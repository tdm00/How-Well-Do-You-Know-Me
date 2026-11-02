"use client";

import { FormEvent, useEffect, useState } from "react";
import { Leaderboard } from "@/components/leaderboard";
import { Logo } from "@/components/logo";
import { TvJoin } from "@/components/tv-join";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRoom } from "@/components/use-room";
import type { Mark, TvFocus, TvState } from "@/lib/types";

const STORAGE = "dykm-tv-code";

function pointsLabel(position: number, mark: Mark): string | null {
  if (mark !== "match") return mark === "miss" ? "Not a match" : null;
  const points = position === 6 ? 3 : 1;
  return `Match · ${points} point${points === 1 ? "" : "s"}`;
}

function RevealCard({
  title,
  testId,
  guesser,
  speaker,
  guess,
  answer,
  mark,
  position,
}: {
  title: string;
  testId: string;
  guesser: string;
  speaker: string;
  guess: string | null;
  answer: string | null;
  mark: Mark;
  position: number;
}) {
  const label = pointsLabel(position, mark);
  return (
    <article className="rounded-[1.75rem] bg-tvcard p-6 shadow-tv" data-testid={testId}>
      <p className="font-display text-[clamp(1.6rem,2.2vw,2.8rem)] leading-tight text-gold-bright">{title}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Face label={`${speaker} said`} value={answer} testId={`${testId}-answer`} />
        <Face label={`${guesser} guessed`} value={guess} testId={`${testId}-guess`} />
      </div>
      {label ? (
        <p
          className={`mt-4 font-display text-[clamp(1.8rem,2.4vw,3rem)] ${
            mark === "match" ? "text-gold-bright" : "text-cream/70"
          }`}
        >
          {label}
        </p>
      ) : null}
    </article>
  );
}

function Face({ label, value, testId }: { label: string; value: string | null; testId: string }) {
  return (
    <div className="min-h-24 rounded-2xl bg-tv px-5 py-4">
      <p className="text-[clamp(1.05rem,1.3vw,1.5rem)] uppercase tracking-wide text-cream/70">{label}</p>
      {value ? (
        <p
          key={value}
          data-testid={testId}
          className="reveal-flip mt-2 font-display text-[clamp(2.2rem,3.5vw,4.6rem)] leading-[1.05]"
        >
          {value}
        </p>
      ) : (
        <p className="mt-2 font-display text-[clamp(2rem,3vw,3.6rem)] text-cream/35">Hidden</p>
      )}
    </div>
  );
}

function QuestionStage({ state }: { state: TvState }) {
  if (state.phase === "setup") {
    return (
      <div>
        <p className="text-[clamp(1.4rem,2vw,2.2rem)] text-gold-bright">Join on your phone</p>
        <p
          data-testid="tv-room-code"
          className="mt-4 font-display text-[clamp(5rem,12vw,11rem)] leading-none tracking-wide"
        >
          {state.code}
        </p>
        <TvJoin code={state.code} />
        <ul className="mt-8 grid gap-3">
          {state.teams.map((team) => (
            <li key={team.id} className="text-[clamp(1.4rem,2vw,2.2rem)]">
              <span className="font-display">{team.name}</span>
              <span className="text-cream/70">
                {" "}
                · {team.partnerA ?? "…"} and {team.partnerB ?? "…"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (state.phase === "final") {
    return (
      <div>
        <p className="font-display text-[clamp(3rem,6vw,7rem)] leading-none text-gold-bright">Final</p>
        <p className="mt-6 max-w-3xl text-[clamp(1.6rem,2.4vw,2.8rem)] leading-snug">
          Same board. Most points wins. Ties share a rank.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[clamp(1.2rem,1.6vw,1.8rem)] uppercase tracking-wide text-gold-bright">
        Round {state.round} · Question {state.position} of 6
        {state.position === 6 ? " · Bonus" : ""}
      </p>
      <h1 className="mt-4 max-w-5xl font-display text-[clamp(2.6rem,4.6vw,5.8rem)] leading-[1.02]">
        {state.question?.prompt}
      </h1>
      {state.phase === "answering" ? (
        <div className="mt-8">
          {state.passHint ? (
            <p
              data-testid="tv-pass-hint"
              className="max-w-3xl rounded-3xl bg-gold px-6 py-5 font-display text-[clamp(2rem,3vw,3.4rem)] leading-tight text-ink"
            >
              Pass the phone, then sit apart.
            </p>
          ) : null}
          <p className="mt-6 text-[clamp(1.5rem,2vw,2.4rem)] text-cream/80" data-testid="tv-lock-progress">
            {state.lockProgress.locked} of {state.lockProgress.total} locked in
          </p>
        </div>
      ) : (
        <RevealRow state={state} />
      )}
    </div>
  );
}

function RevealRow({ state }: { state: TvState }) {
  const focus: TvFocus | null = state.focus;
  if (!focus) return null;
  return (
    <div className="mt-6" data-testid="tv-focus">
      <p className="font-display text-[clamp(1.8rem,2.5vw,3rem)] text-gold-bright">{focus.name}</p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <RevealCard
          testId="predicts-b"
          title={`Did ${focus.partnerA} predict ${focus.partnerB}?`}
          guesser={focus.partnerA}
          speaker={focus.partnerB}
          guess={focus.aPred}
          answer={focus.bOwn}
          mark={focus.judgeAPredictsB}
          position={state.position}
        />
        <RevealCard
          testId="predicts-a"
          title={`Did ${focus.partnerB} predict ${focus.partnerA}?`}
          guesser={focus.partnerB}
          speaker={focus.partnerA}
          guess={focus.bPred}
          answer={focus.aOwn}
          mark={focus.judgeBPredictsA}
          position={state.position}
        />
      </div>
    </div>
  );
}

export function TvScreen({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = useState<string | null>(initialCode ?? null);
  const [draft, setDraft] = useState("");
  const { state, error } = useRoom(code, {});

  useEffect(() => {
    if (initialCode) {
      window.localStorage.setItem(STORAGE, initialCode.toUpperCase());
      return;
    }
    const saved = window.localStorage.getItem(STORAGE);
    if (saved) setCode(saved);
  }, [initialCode]);

  function connect(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim().toUpperCase();
    if (!next) return;
    window.localStorage.setItem(STORAGE, next);
    setCode(next);
  }

  if (code && !state && !error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-tv px-6 text-cream">
        <p className="font-display text-4xl">Opening the room…</p>
      </main>
    );
  }

  if (!code || !state || state.role !== "tv") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-tv px-6 text-cream">
        <form onSubmit={connect} className="w-full max-w-xl">
          <Logo tone="cream" markClassName="h-20 w-20" />
          <Label htmlFor="tv-code" className="mt-8 block text-2xl text-cream">
            Room code
          </Label>
          <Input
            id="tv-code"
            value={draft}
            onChange={(event) => setDraft(event.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoComplete="off"
            className="mt-3 min-h-16 bg-tvcard text-2xl text-cream"
          />
          {error ? <p className="mt-3 text-xl text-gold-bright">{error}</p> : null}
          <Button type="submit" variant="tv" size="wide" className="mt-5">
            Show this room
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden bg-tv text-cream">
      <div className="grid h-full gap-8 p-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(22rem,0.9fr)] lg:p-10 xl:p-12">
        <section className="flex min-h-0 flex-col overflow-auto">
          <div className="mb-6 flex items-center justify-between gap-4">
            <Logo tone="cream" markClassName="h-16 w-16" className="[&_p]:text-[clamp(1.4rem,2vw,2.2rem)]" />
            <p className="font-display text-[clamp(1.4rem,2vw,2.4rem)] tracking-widest text-cream/80">{state.code}</p>
          </div>
          <QuestionStage state={state} />
        </section>
        <aside className="min-h-0 overflow-auto rounded-[2rem] bg-black/25 p-6 lg:p-8" aria-live="polite">
          <Leaderboard groups={state.leaderboard} />
        </aside>
      </div>
    </main>
  );
}
