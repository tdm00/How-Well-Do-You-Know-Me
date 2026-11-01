import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/lib/db";
import { GameError, createGame, getState, joinGame, performAction } from "@/lib/game";
import type { GameAction, HostState } from "@/lib/types";

let file = "";

beforeEach(() => {
  file = path.join(os.tmpdir(), `dykm-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
  process.env.DATABASE_PATH = file;
  resetDbForTests();
});

afterEach(() => {
  resetDbForTests();
  for (const suffix of ["", "-shm", "-wal"]) {
    fs.rmSync(file + suffix, { force: true });
  }
});

function hostDo(code: string, token: string, action: GameAction): HostState {
  const state = performAction(code, action, { hostToken: token });
  if (state.role !== "host") throw new Error("expected the host view");
  return state;
}

function seat(code: string, hostToken: string) {
  const alex = joinGame(code, "Alex");
  const blair = joinGame(code, "Blair");
  const casey = joinGame(code, "Casey");
  const drew = joinGame(code, "Drew");
  let state = hostDo(code, hostToken, { action: "add-team", name: "Red" });
  state = hostDo(code, hostToken, { action: "add-team", name: "Gold" });
  const red = state.teams.find((team) => team.name === "Red");
  const gold = state.teams.find((team) => team.name === "Gold");
  if (!red || !gold) throw new Error("teams missing");
  const ids = Object.fromEntries(state.unassigned.map((player) => [player.name, player.id]));
  hostDo(code, hostToken, { action: "assign", playerId: ids.Alex, teamId: red.id, slot: "a" });
  hostDo(code, hostToken, { action: "assign", playerId: ids.Blair, teamId: red.id, slot: "b" });
  hostDo(code, hostToken, { action: "assign", playerId: ids.Casey, teamId: gold.id, slot: "a" });
  hostDo(code, hostToken, { action: "assign", playerId: ids.Drew, teamId: gold.id, slot: "b" });
  state = hostDo(code, hostToken, { action: "load-sample" });
  hostDo(code, hostToken, { action: "set-round", round: 1, questionIds: state.library.slice(0, 6).map((q) => q.id) });
  hostDo(code, hostToken, {
    action: "set-round",
    round: 2,
    questionIds: state.library.slice(6, 12).map((q) => q.id),
  });
  return { alex, blair, casey, drew, red, gold };
}

describe("game flow", () => {
  it("creates a room, locks answers, scores a host match, and ranks ties", () => {
    const { code, hostToken } = createGame();
    expect(() => hostDo(code, hostToken, { action: "start" })).toThrow(GameError);

    const { alex, blair, casey, drew, red, gold } = seat(code, hostToken);
    let state = hostDo(code, hostToken, { action: "start" });
    expect(state.phase).toBe("answering");
    expect(state.passHint).toBe(true);
    expect(state.question?.prompt).toBeTruthy();

    expect(() =>
      performAction(code, { action: "lock", own: " ", prediction: "tacos" }, { playerToken: alex.playerToken }),
    ).toThrow(/lock/i);

    performAction(code, { action: "lock", own: "purple-otter", prediction: "tacos" }, { playerToken: alex.playerToken });
    expect(() =>
      performAction(
        code,
        { action: "lock", own: "changed", prediction: "changed" },
        { playerToken: alex.playerToken },
      ),
    ).toThrow(/locked/i);

    const refreshed = getState(code, { playerToken: alex.playerToken });
    expect(refreshed.role).toBe("player");
    if (refreshed.role !== "player") return;
    expect(refreshed.locked).toBe(true);
    expect(JSON.stringify(refreshed)).not.toContain("purple-otter");

    const partner = getState(code, { playerToken: blair.playerToken });
    const tv = getState(code, {});
    const hostWhileWriting = getState(code, { hostToken });
    expect(JSON.stringify(partner)).not.toContain("purple-otter");
    expect(JSON.stringify(tv)).not.toContain("purple-otter");
    expect(JSON.stringify(hostWhileWriting)).not.toContain("purple-otter");

    performAction(code, { action: "lock", own: "tacos", prediction: "purple-otter" }, { playerToken: blair.playerToken });
    performAction(code, { action: "lock", own: "cats", prediction: "dogs" }, { playerToken: casey.playerToken });
    performAction(code, { action: "lock", own: "birds", prediction: "cats" }, { playerToken: drew.playerToken });

    state = hostDo(code, hostToken, { action: "advance" });
    expect(state.phase).toBe("revealing");
    expect(JSON.stringify(state)).toContain("purple-otter");
    expect(JSON.stringify(getState(code, {}))).not.toContain("purple-otter");

    state = hostDo(code, hostToken, { action: "reveal", teamId: red.id, field: "aOwn" });
    expect(getState(code, {}).role === "tv" && JSON.stringify(getState(code, {}))).toContain("purple-otter");

    state = hostDo(code, hostToken, { action: "judge", teamId: red.id, direction: "a_predicts_b", match: true });
    state = hostDo(code, hostToken, { action: "judge", teamId: red.id, direction: "b_predicts_a", match: true });
    state = hostDo(code, hostToken, { action: "judge", teamId: gold.id, direction: "a_predicts_b", match: true });
    state = hostDo(code, hostToken, { action: "judge", teamId: gold.id, direction: "b_predicts_a", match: true });

    expect(state.leaderboard).toEqual([
      {
        rank: 1,
        points: 2,
        teams: [
          { id: gold.id, name: "Gold", points: 2 },
          { id: red.id, name: "Red", points: 2 },
        ],
      },
    ]);

    state = hostDo(code, hostToken, { action: "undo" });
    const flat = state.leaderboard.flatMap((group) => group.teams);
    expect(flat.find((team) => team.name === "Gold")?.points).toBe(1);
    expect(flat.find((team) => team.name === "Red")?.points).toBe(2);
    expect(state.leaderboard.map((group) => group.rank)).toEqual([1, 2]);

    state = hostDo(code, hostToken, { action: "advance" });
    expect(state.phase).toBe("answering");
    expect(state.position).toBe(2);
    expect(() => hostDo(code, hostToken, { action: "undo" })).toThrow(/next question/i);
  });

  it("scores 3 points each direction on question 6", () => {
    const { code, hostToken } = createGame();
    const { alex, blair, casey, drew, red } = seat(code, hostToken);
    hostDo(code, hostToken, { action: "start" });
    const tokens = [alex.playerToken, blair.playerToken, casey.playerToken, drew.playerToken];

    for (let question = 1; question <= 5; question += 1) {
      for (const token of tokens) {
        performAction(code, { action: "lock", own: `own-${question}`, prediction: `guess-${question}` }, { playerToken: token });
      }
      hostDo(code, hostToken, { action: "advance" });
      hostDo(code, hostToken, { action: "advance" });
    }

    const answering = getState(code, { hostToken });
    expect(answering.role === "host" && answering.position).toBe(6);

    performAction(code, { action: "lock", own: "left", prediction: "right" }, { playerToken: alex.playerToken });
    performAction(code, { action: "lock", own: "right", prediction: "left" }, { playerToken: blair.playerToken });
    performAction(code, { action: "lock", own: "up", prediction: "down" }, { playerToken: casey.playerToken });
    performAction(code, { action: "lock", own: "west", prediction: "east" }, { playerToken: drew.playerToken });
    hostDo(code, hostToken, { action: "advance" });
    let state = hostDo(code, hostToken, { action: "judge", teamId: red.id, direction: "a_predicts_b", match: true });
    state = hostDo(code, hostToken, { action: "judge", teamId: red.id, direction: "b_predicts_a", match: true });
    expect(state.teams.find((team) => team.id === red.id)?.points).toBe(6);
  });

  it("imports pasted questions into the library", () => {
    const { code, hostToken } = createGame();
    const state = hostDo(code, hostToken, {
      action: "import-questions",
      text: "What is their favorite mug?\nWhat color is their bike? | home",
    });
    expect(state.library.map((question) => question.prompt)).toEqual([
      "What is their favorite mug?",
      "What color is their bike?",
    ]);
    expect(state.library[1].category).toBe("home");
  });
});
