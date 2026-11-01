import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";
import { publish } from "@/lib/events";
import { checkLock, lockDenialMessage } from "@/lib/lock";
import { parseQuestionImport } from "@/lib/parse-questions";
import { pointsForPosition, rankTeams } from "@/lib/scoring";
import type {
  Direction,
  GameAction,
  GameState,
  HostState,
  HostTeamCard,
  Mark,
  Phase,
  PlayerState,
  RevealField,
  TvFocus,
  TvState,
} from "@/lib/types";

export class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type GameRow = {
  id: string;
  code: string;
  host_token: string;
  phase: Phase;
  round: number;
  position: number;
  focus_team_id: string | null;
  stall_deadline: number | null;
  pass_hint: number;
  created_at: number;
};

type TeamRow = {
  id: string;
  game_id: string;
  name: string;
  sort_order: number;
};

type PlayerRow = {
  id: string;
  game_id: string;
  team_id: string | null;
  slot: "a" | "b" | null;
  name: string;
  token: string;
  created_at: number;
};

type QuestionRow = {
  id: string;
  game_id: string;
  prompt: string;
  category: string | null;
  sort_order: number;
};

type AnswerRow = {
  id: string;
  player_id: string;
  own_answer: string;
  prediction: string;
  locked_at: number;
};

type RevealRow = {
  team_id: string;
  show_a_own: number;
  show_a_pred: number;
  show_b_own: number;
  show_b_pred: number;
};

type JudgmentRow = {
  id: string;
  team_id: string;
  direction: Direction;
  is_match: number;
  points: number;
  created_at: number;
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let lastStamp = 0;
function stamp(): number {
  const next = Math.max(Date.now(), lastStamp + 1);
  lastStamp = next;
  return next;
}

function roomCode(): string {
  const bytes = crypto.randomBytes(6);
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

function cleanName(value: string, max: number, label: string): string {
  const name = value.replace(/\s+/g, " ").trim();
  if (!name) throw new GameError(`Enter a ${label}.`);
  if (name.length > max) throw new GameError(`That ${label} is too long.`);
  return name;
}

function loadGame(code: string): GameRow {
  const row = getDb()
    .prepare("SELECT * FROM games WHERE code = ?")
    .get(code.toUpperCase()) as GameRow | undefined;
  if (!row) throw new GameError("No game uses that room code.", 404);
  return row;
}

function teamsFor(gameId: string): TeamRow[] {
  return getDb()
    .prepare("SELECT * FROM teams WHERE game_id = ? ORDER BY sort_order, name")
    .all(gameId) as TeamRow[];
}

function playersFor(gameId: string): PlayerRow[] {
  return getDb()
    .prepare("SELECT * FROM players WHERE game_id = ? ORDER BY created_at, name")
    .all(gameId) as PlayerRow[];
}

function questionsFor(gameId: string): QuestionRow[] {
  return getDb()
    .prepare("SELECT * FROM questions WHERE game_id = ? ORDER BY sort_order, prompt")
    .all(gameId) as QuestionRow[];
}

function picksFor(gameId: string, round: number): string[] {
  const rows = getDb()
    .prepare(
      "SELECT question_id FROM round_picks WHERE game_id = ? AND round = ? ORDER BY position",
    )
    .all(gameId, round) as { question_id: string }[];
  return rows.map((row) => row.question_id);
}

function currentQuestion(game: GameRow): QuestionRow | null {
  if (game.phase === "setup") return null;
  const row = getDb()
    .prepare(
      `SELECT q.* FROM round_picks p
       JOIN questions q ON q.id = p.question_id
       WHERE p.game_id = ? AND p.round = ? AND p.position = ?`,
    )
    .get(game.id, game.round, game.position) as QuestionRow | undefined;
  return row ?? null;
}

function answersFor(game: GameRow): AnswerRow[] {
  return getDb()
    .prepare(
      `SELECT id, player_id, own_answer, prediction, locked_at
       FROM answers WHERE game_id = ? AND round = ? AND position = ?`,
    )
    .all(game.id, game.round, game.position) as AnswerRow[];
}

function revealsFor(game: GameRow): RevealRow[] {
  return getDb()
    .prepare(
      `SELECT team_id, show_a_own, show_a_pred, show_b_own, show_b_pred
       FROM reveals WHERE game_id = ? AND round = ? AND position = ?`,
    )
    .all(game.id, game.round, game.position) as RevealRow[];
}

function judgmentsForQuestion(game: GameRow): JudgmentRow[] {
  return getDb()
    .prepare(
      `SELECT id, team_id, direction, is_match, points, created_at
       FROM judgments WHERE game_id = ? AND round = ? AND position = ?
       ORDER BY created_at, id`,
    )
    .all(game.id, game.round, game.position) as JudgmentRow[];
}

function pointMap(gameId: string): Map<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT team_id, COALESCE(SUM(points), 0) AS points
       FROM judgments WHERE game_id = ? AND is_match = 1
       GROUP BY team_id`,
    )
    .all(gameId) as { team_id: string; points: number }[];
  return new Map(rows.map((row) => [row.team_id, row.points]));
}

function seated(players: PlayerRow[]): PlayerRow[] {
  return players.filter((player) => player.team_id && player.slot);
}

function lockProgress(players: PlayerRow[], answers: AnswerRow[]) {
  const active = seated(players);
  const lockedIds = new Set(answers.map((answer) => answer.player_id));
  const locked = active.filter((player) => lockedIds.has(player.id)).length;
  return { locked, total: active.length };
}

function stallOpen(game: GameRow): boolean {
  return game.stall_deadline != null && Date.now() >= game.stall_deadline;
}

function everyoneLocked(progress: { locked: number; total: number }): boolean {
  return progress.total > 0 && progress.locked === progress.total;
}

function partner(players: PlayerRow[], teamId: string, slot: "a" | "b"): PlayerRow | null {
  return players.find((player) => player.team_id === teamId && player.slot === slot) ?? null;
}

function markOf(judgments: JudgmentRow[], teamId: string, direction: Direction): Mark {
  const row = judgments.find((item) => item.team_id === teamId && item.direction === direction);
  if (!row) return null;
  return row.is_match ? "match" : "miss";
}

function questionRef(question: QuestionRow | null) {
  if (!question) return null;
  return { prompt: question.prompt, category: question.category };
}

function leaderboard(teams: TeamRow[], points: Map<string, number>) {
  return rankTeams(
    teams.map((team) => ({
      id: team.id,
      name: team.name,
      points: points.get(team.id) ?? 0,
    })),
  );
}

function focusTeam(game: GameRow, teams: TeamRow[]): TeamRow | null {
  if (teams.length === 0) return null;
  return teams.find((team) => team.id === game.focus_team_id) ?? teams[0];
}

function buildFocus(
  game: GameRow,
  teams: TeamRow[],
  players: PlayerRow[],
  answers: AnswerRow[],
  reveals: RevealRow[],
  judgments: JudgmentRow[],
  exposeText: boolean,
): TvFocus | null {
  const team = focusTeam(game, teams);
  if (!team) return null;
  const a = partner(players, team.id, "a");
  const b = partner(players, team.id, "b");
  if (!a || !b) return null;
  const answerA = answers.find((item) => item.player_id === a.id);
  const answerB = answers.find((item) => item.player_id === b.id);
  const reveal = reveals.find((item) => item.team_id === team.id);
  const show = (flag: number | undefined, text: string | undefined) =>
    exposeText && flag && text ? text : null;
  return {
    id: team.id,
    name: team.name,
    partnerA: a.name,
    partnerB: b.name,
    aOwn: show(reveal?.show_a_own, answerA?.own_answer),
    aPred: show(reveal?.show_a_pred, answerA?.prediction),
    bOwn: show(reveal?.show_b_own, answerB?.own_answer),
    bPred: show(reveal?.show_b_pred, answerB?.prediction),
    judgeAPredictsB: markOf(judgments, team.id, "a_predicts_b"),
    judgeBPredictsA: markOf(judgments, team.id, "b_predicts_a"),
  };
}

function advanceHint(game: GameRow, progress: { locked: number; total: number }): {
  canAdvance: boolean;
  hint: string;
} {
  if (game.phase === "setup") {
    return { canAdvance: false, hint: "Build the teams and pick round 1 before you start." };
  }
  if (game.phase === "final") {
    return { canAdvance: false, hint: "The standings on the TV are the final result." };
  }
  if (game.phase === "revealing") {
    if (game.round === 1 && game.position === 6 && picksFor(game.id, 2).length !== 6) {
      return {
        canAdvance: false,
        hint: "Pick 6 questions for round 2 before you leave this question.",
      };
    }
    return { canAdvance: true, hint: "Next question when the room is ready." };
  }
  if (everyoneLocked(progress)) {
    return { canAdvance: true, hint: "Everyone is locked. Open the reveal." };
  }
  if (stallOpen(game)) {
    return {
      canAdvance: true,
      hint: "The 3-minute cap ran out. You can open the reveal with whoever locked.",
    };
  }
  const waiting = progress.total - progress.locked;
  return {
    canAdvance: false,
    hint: `Waiting for ${waiting} of ${progress.total} partners to lock.`,
  };
}

function undoLabel(
  game: GameRow,
  teams: TeamRow[],
  players: PlayerRow[],
  judgments: JudgmentRow[],
): string | null {
  if (game.phase !== "revealing" || judgments.length === 0) return null;
  const latest = [...judgments].sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))[0];
  const team = teams.find((item) => item.id === latest.team_id);
  const a = team ? partner(players, team.id, "a") : null;
  const b = team ? partner(players, team.id, "b") : null;
  const who =
    latest.direction === "a_predicts_b"
      ? `${a?.name ?? "Partner A"} predicting ${b?.name ?? "Partner B"}`
      : `${b?.name ?? "Partner B"} predicting ${a?.name ?? "Partner A"}`;
  return `Undo ${team?.name ?? "that team"}: ${who}`;
}

function hostCards(
  game: GameRow,
  teams: TeamRow[],
  players: PlayerRow[],
  answers: AnswerRow[],
  reveals: RevealRow[],
  judgments: JudgmentRow[],
  points: Map<string, number>,
): HostTeamCard[] {
  if (game.phase === "setup") return [];
  const showText = game.phase === "revealing" || game.phase === "final";
  return teams.map((team) => {
    const a = partner(players, team.id, "a");
    const b = partner(players, team.id, "b");
    const answerA = a ? answers.find((item) => item.player_id === a.id) : undefined;
    const answerB = b ? answers.find((item) => item.player_id === b.id) : undefined;
    const reveal = reveals.find((item) => item.team_id === team.id);
    const side = (player: PlayerRow | null, answer: AnswerRow | undefined) => {
      if (!player) return null;
      return {
        playerId: player.id,
        name: player.name,
        own: showText && answer ? answer.own_answer : null,
        prediction: showText && answer ? answer.prediction : null,
        locked: Boolean(answer),
      };
    };
    return {
      id: team.id,
      name: team.name,
      points: points.get(team.id) ?? 0,
      partnerA: side(a, answerA),
      partnerB: side(b, answerB),
      shown: {
        aOwn: Boolean(reveal?.show_a_own),
        aPred: Boolean(reveal?.show_a_pred),
        bOwn: Boolean(reveal?.show_b_own),
        bPred: Boolean(reveal?.show_b_pred),
      },
      judgeAPredictsB: markOf(judgments, team.id, "a_predicts_b"),
      judgeBPredictsA: markOf(judgments, team.id, "b_predicts_a"),
    };
  });
}

function buildHostState(game: GameRow): HostState {
  const teams = teamsFor(game.id);
  const players = playersFor(game.id);
  const points = pointMap(game.id);
  const answers = game.phase === "setup" ? [] : answersFor(game);
  const reveals = game.phase === "setup" ? [] : revealsFor(game);
  const judgments = game.phase === "setup" ? [] : judgmentsForQuestion(game);
  const progress = lockProgress(players, answers);
  const gate = advanceHint(game, progress);
  const board = leaderboard(teams, points);
  return {
    role: "host",
    code: game.code,
    phase: game.phase,
    round: game.round,
    position: game.position,
    passHint: Boolean(game.pass_hint),
    stallDeadline: game.phase === "answering" ? game.stall_deadline : null,
    question: questionRef(currentQuestion(game)),
    canAdvance: gate.canAdvance,
    advanceHint: gate.hint,
    undoLabel: undoLabel(game, teams, players, judgments),
    leaderboard: board,
    focusTeamId: focusTeam(game, teams)?.id ?? null,
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      points: points.get(team.id) ?? 0,
      slotA: (() => {
        const player = partner(players, team.id, "a");
        return player ? { id: player.id, name: player.name } : null;
      })(),
      slotB: (() => {
        const player = partner(players, team.id, "b");
        return player ? { id: player.id, name: player.name } : null;
      })(),
    })),
    unassigned: players
      .filter((player) => !player.team_id)
      .map((player) => ({ id: player.id, name: player.name })),
    library: questionsFor(game.id).map((question) => ({
      id: question.id,
      prompt: question.prompt,
      category: question.category,
    })),
    round1: picksFor(game.id, 1),
    round2: picksFor(game.id, 2),
    cards: hostCards(game, teams, players, answers, reveals, judgments, points),
    lockProgress: progress,
    canEditRound2: game.round < 2,
  };
}

function buildTvState(game: GameRow): TvState {
  const teams = teamsFor(game.id);
  const players = playersFor(game.id);
  const points = pointMap(game.id);
  const answers = game.phase === "setup" ? [] : answersFor(game);
  const reveals = game.phase === "setup" ? [] : revealsFor(game);
  const judgments = game.phase === "setup" ? [] : judgmentsForQuestion(game);
  return {
    role: "tv",
    code: game.code,
    phase: game.phase,
    round: game.round,
    position: game.position,
    passHint: Boolean(game.pass_hint) && game.phase === "answering",
    question: questionRef(currentQuestion(game)),
    lockProgress: lockProgress(players, answers),
    leaderboard: leaderboard(teams, points),
    focus:
      game.phase === "revealing" || game.phase === "final"
        ? buildFocus(game, teams, players, answers, reveals, judgments, true)
        : null,
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      points: points.get(team.id) ?? 0,
      partnerA: partner(players, team.id, "a")?.name ?? null,
      partnerB: partner(players, team.id, "b")?.name ?? null,
    })),
  };
}

function buildPlayerState(game: GameRow, player: PlayerRow): PlayerState {
  const team = player.team_id
    ? teamsFor(game.id).find((item) => item.id === player.team_id) ?? null
    : null;
  const answers = game.phase === "setup" ? [] : answersFor(game);
  const locked = answers.some((answer) => answer.player_id === player.id);
  const showQuestion = game.phase === "answering" && Boolean(team) && !locked;
  return {
    role: "player",
    code: game.code,
    phase: game.phase,
    round: game.round,
    position: game.position,
    name: player.name,
    teamName: team?.name ?? null,
    question: showQuestion ? questionRef(currentQuestion(game)) : null,
    locked,
    needsTeam: !team,
  };
}

export function getState(
  code: string,
  auth: { hostToken?: string | null; playerToken?: string | null },
): GameState {
  const game = loadGame(code);
  if (auth.hostToken && auth.hostToken === game.host_token) {
    return buildHostState(game);
  }
  if (auth.playerToken) {
    const player = getDb()
      .prepare("SELECT * FROM players WHERE game_id = ? AND token = ?")
      .get(game.id, auth.playerToken) as PlayerRow | undefined;
    if (player) return buildPlayerState(game, player);
  }
  return buildTvState(game);
}

export function createGame(): { code: string; hostToken: string } {
  const db = getDb();
  const id = crypto.randomUUID();
  const hostToken = crypto.randomBytes(24).toString("hex");
  let code = roomCode();
  const exists = db.prepare("SELECT 1 FROM games WHERE code = ?");
  for (let attempt = 0; attempt < 6 && exists.get(code); attempt += 1) {
    code = roomCode();
  }
  db.prepare(
    `INSERT INTO games
      (id, code, host_token, phase, round, position, focus_team_id, stall_deadline, pass_hint, created_at)
     VALUES (?, ?, ?, 'setup', 1, 1, NULL, NULL, 0, ?)`,
  ).run(id, code, hostToken, Date.now());
  return { code, hostToken };
}

export function joinGame(code: string, rawName: string): { playerToken: string; playerId: string } {
  const game = loadGame(code);
  if (game.phase !== "setup") {
    throw new GameError("This game has already started.");
  }
  if (typeof rawName !== "string") throw new GameError("Enter a name.");
  const name = cleanName(rawName, 24, "name");
  const players = playersFor(game.id);
  if (players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
    throw new GameError("Someone in this room already uses that name.");
  }
  const playerId = crypto.randomUUID();
  const playerToken = crypto.randomBytes(24).toString("hex");
  getDb()
    .prepare(
      `INSERT INTO players (id, game_id, team_id, slot, name, token, created_at)
       VALUES (?, ?, NULL, NULL, ?, ?, ?)`,
    )
    .run(playerId, game.id, name, playerToken, Date.now());
  publish(game.code);
  return { playerToken, playerId };
}

function requireHost(game: GameRow, hostToken: string | null | undefined): void {
  if (!hostToken || hostToken !== game.host_token) {
    throw new GameError("The host controls that.", 403);
  }
}

function requireSetup(game: GameRow): void {
  if (game.phase !== "setup") throw new GameError("You can only change that before the game starts.");
}

function insertQuestions(gameId: string, incoming: { prompt: string; category: string | null }[]): number {
  const db = getDb();
  const existing = questionsFor(gameId);
  const seen = new Set(existing.map((question) => question.prompt.toLowerCase()));
  let order = existing.reduce((max, question) => Math.max(max, question.sort_order), 0);
  const insert = db.prepare(
    `INSERT INTO questions (id, game_id, prompt, category, sort_order) VALUES (?, ?, ?, ?, ?)`,
  );
  let added = 0;
  const tx = db.transaction(() => {
    for (const question of incoming) {
      const key = question.prompt.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      order += 1;
      insert.run(crypto.randomUUID(), gameId, question.prompt, question.category, order);
      added += 1;
    }
  });
  tx();
  return added;
}

function setRound(game: GameRow, round: 1 | 2, questionIds: string[]): void {
  if (!Array.isArray(questionIds)) throw new GameError("Pick the questions again.");
  if (round === 1 && game.phase !== "setup") {
    throw new GameError("Round 1 is already set.");
  }
  if (round === 2 && game.round >= 2) {
    throw new GameError("Round 2 has already started.");
  }
  if (questionIds.length > 6) throw new GameError("A round holds 6 questions.");
  if (new Set(questionIds).size !== questionIds.length) {
    throw new GameError("Each question can be picked once.");
  }
  const library = new Set(questionsFor(game.id).map((question) => question.id));
  if (questionIds.some((id) => !library.has(id))) {
    throw new GameError("Those questions are not in this game.");
  }
  const other = new Set(picksFor(game.id, round === 1 ? 2 : 1));
  if (questionIds.some((id) => other.has(id))) {
    throw new GameError("A question can only be used in one round.");
  }
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM round_picks WHERE game_id = ? AND round = ?").run(game.id, round);
    const insert = db.prepare(
      `INSERT INTO round_picks (game_id, round, position, question_id) VALUES (?, ?, ?, ?)`,
    );
    questionIds.forEach((questionId, index) => {
      insert.run(game.id, round, index + 1, questionId);
    });
  });
  tx();
}

function assertReadyToStart(game: GameRow): void {
  const teams = teamsFor(game.id);
  if (teams.length < 2) throw new GameError("Add at least two teams.");
  const players = playersFor(game.id);
  for (const team of teams) {
    const a = partner(players, team.id, "a");
    const b = partner(players, team.id, "b");
    if (!a || !b) throw new GameError(`${team.name} needs exactly two partners.`);
  }
  if (picksFor(game.id, 1).length !== 6) {
    throw new GameError("Pick 6 questions for round 1.");
  }
}

function enterAnswering(gameId: string, round: number, position: number, focusTeamId: string | null): void {
  getDb()
    .prepare(
      `UPDATE games
       SET phase = 'answering', round = ?, position = ?, focus_team_id = ?, stall_deadline = NULL, pass_hint = 1
       WHERE id = ?`,
    )
    .run(round, position, focusTeamId, gameId);
}

export function performAction(
  code: string,
  action: GameAction,
  auth: { hostToken?: string | null; playerToken?: string | null },
): GameState {
  const game = loadGame(code);
  const db = getDb();

  if (action.action === "lock") {
    if (!auth.playerToken) throw new GameError("Join the room before you lock.", 403);
    const player = db
      .prepare("SELECT * FROM players WHERE game_id = ? AND token = ?")
      .get(game.id, auth.playerToken) as PlayerRow | undefined;
    if (!player) throw new GameError("Join the room before you lock.", 403);
    if (!player.team_id || !player.slot) {
      throw new GameError("Wait until the host puts you on a team.");
    }
    const existing = db
      .prepare(
        `SELECT 1 FROM answers
         WHERE game_id = ? AND round = ? AND position = ? AND player_id = ?`,
      )
      .get(game.id, game.round, game.position, player.id);
    if (typeof action.own !== "string" || typeof action.prediction !== "string") {
      throw new GameError("Type your answer and your guess before you lock.");
    }
    const verdict = checkLock({
      phase: game.phase,
      alreadyLocked: Boolean(existing),
      own: action.own,
      prediction: action.prediction,
    });
    if (!verdict.ok) throw new GameError(lockDenialMessage(verdict.reason));
    try {
      db.prepare(
        `INSERT INTO answers (id, game_id, round, position, player_id, own_answer, prediction, locked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        crypto.randomUUID(),
        game.id,
        game.round,
        game.position,
        player.id,
        verdict.own,
        verdict.prediction,
        stamp(),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNIQUE")) throw new GameError(lockDenialMessage("already-locked"));
      throw error;
    }
    publish(game.code);
    return getState(code, auth);
  }

  requireHost(game, auth.hostToken);

  switch (action.action) {
    case "add-team": {
      requireSetup(game);
      const name = cleanName(action.name, 32, "team name");
      const teams = teamsFor(game.id);
      if (teams.some((team) => team.name.toLowerCase() === name.toLowerCase())) {
        throw new GameError("That team name is already in the room.");
      }
      const order = teams.reduce((max, team) => Math.max(max, team.sort_order), 0) + 1;
      db.prepare(
        "INSERT INTO teams (id, game_id, name, sort_order) VALUES (?, ?, ?, ?)",
      ).run(crypto.randomUUID(), game.id, name, order);
      break;
    }
    case "rename-team": {
      requireSetup(game);
      const name = cleanName(action.name, 32, "team name");
      const team = teamsFor(game.id).find((item) => item.id === action.teamId);
      if (!team) throw new GameError("That team is not in this room.");
      db.prepare("UPDATE teams SET name = ? WHERE id = ? AND game_id = ?").run(name, team.id, game.id);
      break;
    }
    case "remove-team": {
      requireSetup(game);
      const tx = db.transaction(() => {
        db.prepare("UPDATE players SET team_id = NULL, slot = NULL WHERE game_id = ? AND team_id = ?").run(
          game.id,
          action.teamId,
        );
        db.prepare("DELETE FROM teams WHERE id = ? AND game_id = ?").run(action.teamId, game.id);
      });
      tx();
      break;
    }
    case "remove-player": {
      requireSetup(game);
      db.prepare("DELETE FROM players WHERE id = ? AND game_id = ?").run(action.playerId, game.id);
      break;
    }
    case "assign": {
      requireSetup(game);
      if (action.slot !== "a" && action.slot !== "b") throw new GameError("Pick partner A or partner B.");
      const players = playersFor(game.id);
      const teams = teamsFor(game.id);
      const player = players.find((item) => item.id === action.playerId);
      const team = teams.find((item) => item.id === action.teamId);
      if (!player || !team) throw new GameError("Pick a player and a team.");
      const tx = db.transaction(() => {
        db.prepare(
          "UPDATE players SET team_id = NULL, slot = NULL WHERE game_id = ? AND team_id = ? AND slot = ?",
        ).run(game.id, team.id, action.slot);
        db.prepare("UPDATE players SET team_id = ?, slot = ? WHERE id = ? AND game_id = ?").run(
          team.id,
          action.slot,
          player.id,
          game.id,
        );
      });
      tx();
      break;
    }
    case "unassign": {
      requireSetup(game);
      db.prepare("UPDATE players SET team_id = NULL, slot = NULL WHERE id = ? AND game_id = ?").run(
        action.playerId,
        game.id,
      );
      break;
    }
    case "import-questions": {
      const parsed = parseQuestionImport(action.text);
      if (parsed.length === 0) throw new GameError("No questions found in that text.");
      insertQuestions(game.id, parsed);
      break;
    }
    case "load-sample": {
      const file = path.join(process.cwd(), "data", "sample-questions.csv");
      const text = fs.readFileSync(file, "utf8");
      const parsed = parseQuestionImport(text);
      if (parsed.length < 12) throw new GameError("The sample pack is missing.");
      insertQuestions(game.id, parsed);
      break;
    }
    case "set-round": {
      setRound(game, action.round, action.questionIds);
      break;
    }
    case "start": {
      requireSetup(game);
      assertReadyToStart(game);
      const firstTeam = teamsFor(game.id)[0]?.id ?? null;
      enterAnswering(game.id, 1, 1, firstTeam);
      break;
    }
    case "reveal": {
      if (game.phase !== "revealing") throw new GameError("Reveal answers once the question is on the TV.");
      const team = teamsFor(game.id).find((item) => item.id === action.teamId);
      if (!team) throw new GameError("That team is not in this room.");
      const columns: Record<RevealField, string> = {
        aOwn: "show_a_own",
        aPred: "show_a_pred",
        bOwn: "show_b_own",
        bPred: "show_b_pred",
      };
      const column = columns[action.field];
      if (!column) throw new GameError("Choose which answer to reveal.");
      db.prepare(
        `INSERT INTO reveals (game_id, round, position, team_id, show_a_own, show_a_pred, show_b_own, show_b_pred)
         VALUES (?, ?, ?, ?, 0, 0, 0, 0)
         ON CONFLICT(game_id, round, position, team_id) DO NOTHING`,
      ).run(game.id, game.round, game.position, team.id);
      db.prepare(
        `UPDATE reveals SET ${column} = 1
         WHERE game_id = ? AND round = ? AND position = ? AND team_id = ?`,
      ).run(game.id, game.round, game.position, team.id);
      db.prepare("UPDATE games SET focus_team_id = ? WHERE id = ?").run(team.id, game.id);
      break;
    }
    case "focus": {
      const team = teamsFor(game.id).find((item) => item.id === action.teamId);
      if (!team) throw new GameError("That team is not in this room.");
      db.prepare("UPDATE games SET focus_team_id = ? WHERE id = ?").run(team.id, game.id);
      break;
    }
    case "judge": {
      if (game.phase !== "revealing") {
        throw new GameError("Mark a match while this question is on the TV.");
      }
      const team = teamsFor(game.id).find((item) => item.id === action.teamId);
      if (!team) throw new GameError("That team is not in this room.");
      const players = playersFor(game.id);
      const a = partner(players, team.id, "a");
      const b = partner(players, team.id, "b");
      if (!a || !b) throw new GameError("That team needs both partners.");
      const answers = answersFor(game);
      const needed =
        action.direction === "a_predicts_b"
          ? [answers.find((item) => item.player_id === a.id), answers.find((item) => item.player_id === b.id)]
          : [answers.find((item) => item.player_id === b.id), answers.find((item) => item.player_id === a.id)];
      if (needed.some((item) => !item)) {
        throw new GameError("Both partners need a locked answer before you can mark this.");
      }
      const points = action.match ? pointsForPosition(game.position) : 0;
      try {
        db.prepare(
          `INSERT INTO judgments
            (id, game_id, round, position, team_id, direction, is_match, points, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          crypto.randomUUID(),
          game.id,
          game.round,
          game.position,
          team.id,
          action.direction,
          action.match ? 1 : 0,
          points,
          stamp(),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("UNIQUE")) {
          throw new GameError("Undo the current mark before you change it.");
        }
        throw error;
      }
      db.prepare("UPDATE games SET focus_team_id = ? WHERE id = ?").run(team.id, game.id);
      break;
    }
    case "undo": {
      if (game.phase !== "revealing") {
        throw new GameError("You can undo a mark only before the next question.");
      }
      const latest = db
        .prepare(
          `SELECT id FROM judgments
           WHERE game_id = ? AND round = ? AND position = ?
           ORDER BY created_at DESC, id DESC LIMIT 1`,
        )
        .get(game.id, game.round, game.position) as { id: string } | undefined;
      if (!latest) throw new GameError("There is no mark to undo on this question.");
      db.prepare("DELETE FROM judgments WHERE id = ?").run(latest.id);
      break;
    }
    case "stall": {
      if (game.phase !== "answering") throw new GameError("The cap is for the answer phase.");
      const progress = lockProgress(playersFor(game.id), answersFor(game));
      if (everyoneLocked(progress)) throw new GameError("Everyone has already locked.");
      db.prepare("UPDATE games SET stall_deadline = ? WHERE id = ?").run(Date.now() + 3 * 60 * 1000, game.id);
      break;
    }
    case "dismiss-hint": {
      db.prepare("UPDATE games SET pass_hint = 0 WHERE id = ?").run(game.id);
      break;
    }
    case "advance": {
      if (game.phase === "answering") {
        const progress = lockProgress(playersFor(game.id), answersFor(game));
        if (!everyoneLocked(progress) && !stallOpen(game)) {
          throw new GameError("Wait until every partner has locked, or let the 3-minute cap finish.");
        }
        const focus = game.focus_team_id ?? teamsFor(game.id)[0]?.id ?? null;
        db.prepare(
          "UPDATE games SET phase = 'revealing', stall_deadline = NULL, pass_hint = 0, focus_team_id = ? WHERE id = ?",
        ).run(focus, game.id);
        break;
      }
      if (game.phase !== "revealing") throw new GameError("Nothing to advance right now.");
      if (game.position < 6) {
        enterAnswering(game.id, game.round, game.position + 1, teamsFor(game.id)[0]?.id ?? null);
        break;
      }
      if (game.round === 1) {
        if (picksFor(game.id, 2).length !== 6) {
          throw new GameError("Pick 6 questions for round 2 before you start it.");
        }
        enterAnswering(game.id, 2, 1, teamsFor(game.id)[0]?.id ?? null);
        break;
      }
      db.prepare("UPDATE games SET phase = 'final', stall_deadline = NULL, pass_hint = 0 WHERE id = ?").run(
        game.id,
      );
      break;
    }
    default: {
      const never: never = action;
      throw new GameError(`Unknown action: ${JSON.stringify(never)}`);
    }
  }

  publish(game.code);
  return getState(code, auth);
}

