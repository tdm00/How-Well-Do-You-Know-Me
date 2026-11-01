"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Leaderboard } from "@/components/leaderboard";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendAction, useRoom } from "@/components/use-room";
import type { Direction, HostState, RevealField } from "@/lib/types";

const STORAGE = "dykm-host";

type Session = { code: string; token: string };

function formatRemaining(deadline: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function HostScreen({ initial }: { initial?: Session }) {
  const [session, setSession] = useState<Session | null>(initial ?? null);
  const [teamName, setTeamName] = useState("");
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const queue = useRef(Promise.resolve());
  const { state, error } = useRoom(session?.code ?? null, { host: session?.token });

  useEffect(() => {
    if (initial?.code && initial.token) {
      window.localStorage.setItem(STORAGE, JSON.stringify(initial));
      return;
    }
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Session;
      if (saved.code && saved.token) setSession(saved);
    } catch {
      window.localStorage.removeItem(STORAGE);
    }
  }, [initial]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const host = state?.role === "host" ? (state as HostState) : null;

  function run(action: Parameters<typeof sendAction>[1]) {
    if (!session) return Promise.resolve();
    const code = session.code;
    const token = session.token;
    const job = queue.current.then(async () => {
      setBusy(true);
      setFormError(null);
      try {
        await sendAction(code, action, { host: token });
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "That did not work.");
      } finally {
        setBusy(false);
      }
    });
    queue.current = job.then(
      () => undefined,
      () => undefined,
    );
    return job;
  }

  async function createGame() {
    setBusy(true);
    setFormError(null);
    try {
      const response = await fetch("/api/games", { method: "POST" });
      const body = (await response.json()) as { code?: string; hostToken?: string; error?: string };
      if (!response.ok || !body.code || !body.hostToken) {
        setFormError(body.error ?? "Could not create the room.");
        return;
      }
      const next = { code: body.code, token: body.hostToken };
      window.localStorage.setItem(STORAGE, JSON.stringify(next));
      const url = `/host?code=${next.code}&host=${next.token}`;
      window.history.replaceState(null, "", url);
      setSession(next);
    } catch {
      setFormError("Could not create the room.");
    } finally {
      setBusy(false);
    }
  }

  if (session && !state && !error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
        <Logo />
        <p className="mt-8 text-2xl">Loading the room…</p>
      </main>
    );
  }

  if (!session || !host) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-10">
        <Logo />
        <h1 className="mt-8 font-display text-5xl leading-tight">Host the room</h1>
        <p className="mt-4 text-xl leading-relaxed">
          You will pair the teams, pick the questions, and decide which guesses count.
        </p>
        {formError || error ? <p className="mt-4 text-lg text-terracotta-dark">{formError || error}</p> : null}
        <Button type="button" size="wide" className="mt-8" onClick={createGame} disabled={busy} data-testid="create-game">
          {busy ? "Creating…" : "Host a new game"}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <Logo markClassName="h-14 w-14" />
        <div className="text-right">
          <p className="text-lg">Room code</p>
          <p data-testid="room-code" className="font-display text-5xl tracking-wide">
            {host.code}
          </p>
          <button
            type="button"
            className="mt-1 min-h-12 text-lg text-ink/70"
            onClick={() => {
              window.localStorage.removeItem(STORAGE);
              window.location.assign("/host");
            }}
          >
            Host a different game
          </button>
          <p className="text-lg text-ink/70">
            {host.phase === "setup"
              ? "Setup"
              : host.phase === "final"
                ? "Final"
                : `Round ${host.round} · Question ${host.position}`}
          </p>
        </div>
      </header>

      {formError ? (
        <p className="rounded-2xl bg-cream px-4 py-3 text-lg text-terracotta-dark" role="alert">
          {formError}
        </p>
      ) : null}

      {host.phase === "setup" ? (
        <Setup host={host} teamName={teamName} setTeamName={setTeamName} importText={importText} setImportText={setImportText} busy={busy} run={run} />
      ) : (
        <Live host={host} busy={busy} now={now} run={run} />
      )}
    </main>
  );
}

function Setup({
  host,
  teamName,
  setTeamName,
  importText,
  setImportText,
  busy,
  run,
}: {
  host: HostState;
  teamName: string;
  setTeamName: Dispatch<SetStateAction<string>>;
  importText: string;
  setImportText: Dispatch<SetStateAction<string>>;
  busy: boolean;
  run: (action: Parameters<typeof sendAction>[1]) => Promise<void>;
}) {
  const readyTeams = host.teams.filter((team) => team.slotA && team.slotB).length;

  async function addTeam(event: FormEvent) {
    event.preventDefault();
    const name = teamName.trim();
    if (!name) return;
    setTeamName((current) => (current.trim() === name ? "" : current));
    await run({ action: "add-team", name });
  }

  async function importQuestions(event: FormEvent) {
    event.preventDefault();
    const text = importText;
    if (!text.trim()) return;
    setImportText((current) => (current === text ? "" : current));
    await run({ action: "import-questions", text });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Teams</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-lg">Exactly two partners on every team. At least two teams.</p>
          <form onSubmit={addTeam} className="flex flex-col gap-3 sm:flex-row">
            <Label className="sr-only" htmlFor="team-name">
              Team name
            </Label>
            <Input
              id="team-name"
              data-testid="team-name"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="Team name"
              className="min-h-12"
            />
            <Button type="submit" disabled={busy || !teamName.trim()} data-testid="add-team">
              Add team
            </Button>
          </form>
          {host.unassigned.length > 0 ? (
            <p className="text-lg">
              Waiting to be paired: {host.unassigned.map((player) => player.name).join(", ")}
            </p>
          ) : (
            <p className="text-lg text-ink/70">Players appear here after they join on their phones.</p>
          )}
          {host.teams.map((team) => (
            <section key={team.id} data-testid={`team-${team.name}`} className="rounded-2xl bg-paper p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-2xl">{team.name}</h3>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => run({ action: "remove-team", teamId: team.id })}>
                  Remove
                </Button>
              </div>
              <SlotPicker label="Partner A" slot="a" teamId={team.id} current={team.slotA} unassigned={host.unassigned} busy={busy} run={run} />
              <SlotPicker label="Partner B" slot="b" teamId={team.id} current={team.slotB} unassigned={host.unassigned} busy={busy} run={run} />
            </section>
          ))}
          <p className="text-lg">
            {readyTeams} complete {readyTeams === 1 ? "team" : "teams"}. Round 1 has {host.round1.length} of 6 questions.
          </p>
          <Button
            type="button"
            size="wide"
            disabled={busy}
            data-testid="start-game"
            onClick={() => run({ action: "start" })}
          >
            Start round 1
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button type="button" variant="pine" disabled={busy} data-testid="load-sample" onClick={() => run({ action: "load-sample" })}>
            Load the sample pack
          </Button>
          <form onSubmit={importQuestions} className="flex flex-col gap-3">
            <Label htmlFor="import-questions">Paste questions, or a CSV with a prompt, category header</Label>
            <Textarea
              id="import-questions"
              data-testid="import-questions"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={"What is their favorite dessert?\nWhat song do they sing in the car? | music"}
            />
            <Button type="submit" variant="secondary" disabled={busy || !importText.trim()} data-testid="import-submit">
              Add questions
            </Button>
          </form>
          <QuestionPicker host={host} busy={busy} run={run} />
        </CardContent>
      </Card>
    </div>
  );
}

function SlotPicker({
  label,
  slot,
  teamId,
  current,
  unassigned,
  busy,
  run,
}: {
  label: string;
  slot: "a" | "b";
  teamId: string;
  current: { id: string; name: string } | null;
  unassigned: { id: string; name: string }[];
  busy: boolean;
  run: (action: Parameters<typeof sendAction>[1]) => Promise<void>;
}) {
  return (
    <div className="mt-3" data-testid={`slot-${slot}`}>
      <p className="font-semibold">{label}</p>
      {current ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-lg">{current.name}</span>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => run({ action: "unassign", playerId: current.id })}>
            Clear
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {unassigned.length === 0 ? <span className="text-lg text-ink/60">Nobody waiting</span> : null}
          {unassigned.map((player) => (
            <Button
              key={player.id}
              type="button"
              variant="secondary"
              disabled={busy}
              data-testid={`assign-${player.name}-${slot}`}
              onClick={() => run({ action: "assign", playerId: player.id, teamId, slot })}
            >
              {player.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionPicker({
  host,
  busy,
  run,
}: {
  host: HostState;
  busy: boolean;
  run: (action: Parameters<typeof sendAction>[1]) => Promise<void>;
}) {
  const round1 = useMemo(() => new Set(host.round1), [host.round1]);
  const round2 = useMemo(() => new Set(host.round2), [host.round2]);
  const picksRef = useRef({ 1: host.round1, 2: host.round2 });
  const serverPicks = useRef({ 1: host.round1, 2: host.round2 });
  const pendingPicks = useRef(0);
  serverPicks.current = { 1: host.round1, 2: host.round2 };

  useEffect(() => {
    if (pendingPicks.current === 0) {
      picksRef.current = { 1: host.round1, 2: host.round2 };
    }
  }, [host.round1, host.round2]);

  async function toggle(round: 1 | 2, id: string) {
    const selected = picksRef.current[round];
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    if (next.length > 6) return;
    picksRef.current = { ...picksRef.current, [round]: next };
    pendingPicks.current += 1;
    try {
      await run({ action: "set-round", round, questionIds: next });
    } finally {
      pendingPicks.current -= 1;
      if (pendingPicks.current === 0) {
        picksRef.current = serverPicks.current;
      }
    }
  }

  if (host.library.length === 0) {
    return <p className="text-lg">Load the sample pack, or paste your own questions.</p>;
  }

  return (
    <ul className="flex max-h-[36rem] flex-col gap-3 overflow-auto pr-1">
      {host.library.map((question) => (
        <li key={question.id} data-testid={`question-${question.id}`} className="rounded-2xl bg-paper p-3">
          <p className="text-lg leading-snug">{question.prompt}</p>
          {question.category ? <p className="text-base text-ink/60">{question.category}</p> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {host.phase === "setup" ? (
              <Button
                type="button"
                variant={round1.has(question.id) ? "gold" : "secondary"}
                disabled={
                  busy || (!round1.has(question.id) && (host.round1.length >= 6 || round2.has(question.id)))
                }
                data-testid="add-round-1"
                onClick={() => toggle(1, question.id)}
              >
                {round1.has(question.id) ? "In round 1" : "Round 1"}
              </Button>
            ) : round1.has(question.id) ? (
              <span className="inline-flex min-h-12 items-center rounded-full bg-paper px-4 text-base">Used in round 1</span>
            ) : null}
            <Button
              type="button"
              variant={round2.has(question.id) ? "gold" : "secondary"}
              disabled={busy || !host.canEditRound2 || (!round2.has(question.id) && (host.round2.length >= 6 || round1.has(question.id)))}
              data-testid="add-round-2"
              onClick={() => toggle(2, question.id)}
            >
              {round2.has(question.id) ? "In round 2" : "Round 2"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Live({
  host,
  busy,
  now,
  run,
}: {
  host: HostState;
  busy: boolean;
  now: number;
  run: (action: Parameters<typeof sendAction>[1]) => Promise<void>;
}) {
  const cap =
    host.stallDeadline && host.stallDeadline > now ? formatRemaining(host.stallDeadline, now) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>{host.question?.prompt ?? "Question"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-lg" data-testid="advance-hint">
              {host.advanceHint}
            </p>
            <p className="text-lg" data-testid="host-lock-progress">
              {host.lockProgress.locked} of {host.lockProgress.total} locked
            </p>
            {host.phase === "answering" ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="secondary" disabled={busy} data-testid="stall" onClick={() => run({ action: "stall" })}>
                  {cap ? `Cap running ${cap}` : "Start a 3-minute cap"}
                </Button>
                {host.passHint ? (
                  <Button type="button" variant="ghost" disabled={busy} onClick={() => run({ action: "dismiss-hint" })}>
                    Hide the pass-the-phone card
                  </Button>
                ) : null}
              </div>
            ) : null}
            <Button
              type="button"
              size="wide"
              disabled={busy || !host.canAdvance}
              data-testid="advance"
              onClick={() => run({ action: "advance" })}
            >
              {host.phase === "answering"
                ? "Open the reveal"
                : host.phase === "revealing"
                  ? host.position === 6 && host.round === 2
                    ? "Show the final standings"
                    : "Next question"
                  : "Standings are final"}
            </Button>
            {host.undoLabel ? (
              <Button type="button" variant="miss" disabled={busy} data-testid="undo" onClick={() => run({ action: "undo" })}>
                {host.undoLabel}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {host.phase === "revealing" || host.phase === "final" ? (
          <div className="flex flex-wrap gap-2">
            {host.cards.map((card) => (
              <Button
                key={card.id}
                type="button"
                variant={host.focusTeamId === card.id ? "gold" : "secondary"}
                disabled={busy}
                data-testid={`focus-${card.name}`}
                onClick={() => run({ action: "focus", teamId: card.id })}
              >
                {card.name}
              </Button>
            ))}
          </div>
        ) : null}

        {host.cards.map((card) => (
          <Card key={card.id} data-testid={`card-${card.name}`}>
            <CardHeader>
              <CardTitle>
                {card.name} · {card.points} pts
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <PartnerColumn title="Partner A" person={card.partnerA} />
                <PartnerColumn title="Partner B" person={card.partnerB} />
              </div>
              {host.phase === "revealing" && card.partnerA && card.partnerB ? (
                <div className="grid gap-4">
                  <DirectionControls
                    title={`Did ${card.partnerA.name} predict ${card.partnerB.name}?`}
                    answerLabel={`Show ${card.partnerB.name}'s answer`}
                    guessLabel={`Show ${card.partnerA.name}'s guess`}
                    answerShown={card.shown.bOwn}
                    guessShown={card.shown.aPred}
                    answerField="bOwn"
                    guessField="aPred"
                    direction="a_predicts_b"
                    mark={card.judgeAPredictsB}
                    team={card}
                    busy={busy}
                    run={run}
                  />
                  <DirectionControls
                    title={`Did ${card.partnerB.name} predict ${card.partnerA.name}?`}
                    answerLabel={`Show ${card.partnerA.name}'s answer`}
                    guessLabel={`Show ${card.partnerB.name}'s guess`}
                    answerShown={card.shown.aOwn}
                    guessShown={card.shown.bPred}
                    answerField="aOwn"
                    guessField="bPred"
                    direction="b_predicts_a"
                    mark={card.judgeBPredictsA}
                    team={card}
                    busy={busy}
                    run={run}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}

        {host.phase !== "final" && host.round === 1 ? (
          <Card>
            <CardHeader>
              <CardTitle>Round 2 questions · {host.round2.length} of 6</CardTitle>
            </CardHeader>
            <CardContent>
              <QuestionPicker host={host} busy={busy} run={run} />
            </CardContent>
          </Card>
        ) : null}
      </div>
      <Card className="h-fit lg:sticky lg:top-6">
        <CardContent className="pt-5">
          <Leaderboard groups={host.leaderboard} tone="paper" />
        </CardContent>
      </Card>
    </div>
  );
}

function PartnerColumn({
  title,
  person,
}: {
  title: string;
  person: HostState["cards"][number]["partnerA"];
}) {
  return (
    <div className="rounded-2xl bg-paper p-4">
      <p className="whitespace-nowrap text-base font-semibold text-ink/60">{title}</p>
      <p className="font-display text-2xl">{person?.name ?? "Empty seat"}</p>
      {!person?.locked ? <p className="mt-2 text-lg">Still writing</p> : null}
      {person?.locked && !person.own ? <p className="mt-2 text-lg">Locked</p> : null}
      {person?.own ? (
        <p className="mt-3 text-lg">
          <span className="font-semibold">Answer: </span>
          {person.own}
        </p>
      ) : null}
      {person?.prediction ? (
        <p className="mt-2 text-lg">
          <span className="font-semibold">Guess: </span>
          {person.prediction}
        </p>
      ) : null}
    </div>
  );
}

function DirectionControls({
  title,
  answerLabel,
  guessLabel,
  answerShown,
  guessShown,
  answerField,
  guessField,
  direction,
  mark,
  team,
  busy,
  run,
}: {
  title: string;
  answerLabel: string;
  guessLabel: string;
  answerShown: boolean;
  guessShown: boolean;
  answerField: RevealField;
  guessField: RevealField;
  direction: Direction;
  mark: "match" | "miss" | null;
  team: HostState["cards"][number];
  busy: boolean;
  run: (action: Parameters<typeof sendAction>[1]) => Promise<void>;
}) {
  const bothLocked = Boolean(team.partnerA?.locked && team.partnerB?.locked);
  return (
    <div className="rounded-2xl border border-line p-4">
      <p className="text-lg font-semibold">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || answerShown}
          data-testid={`reveal-${team.name}-${answerField}`}
          onClick={() => run({ action: "reveal", teamId: team.id, field: answerField })}
        >
          {answerShown ? "On the TV" : answerLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || guessShown}
          data-testid={`reveal-${team.name}-${guessField}`}
          onClick={() => run({ action: "reveal", teamId: team.id, field: guessField })}
        >
          {guessShown ? "On the TV" : guessLabel}
        </Button>
        <Button
          type="button"
          variant="pine"
          disabled={busy || !bothLocked || mark != null}
          data-testid={`match-${team.name}-${direction}`}
          onClick={() => run({ action: "judge", teamId: team.id, direction, match: true })}
        >
          {mark === "match" ? "Matched" : "Match"}
        </Button>
        <Button
          type="button"
          variant="miss"
          disabled={busy || !bothLocked || mark != null}
          data-testid={`miss-${team.name}-${direction}`}
          onClick={() => run({ action: "judge", teamId: team.id, direction, match: false })}
        >
          {mark === "miss" ? "No match" : "No match"}
        </Button>
      </div>
    </div>
  );
}
