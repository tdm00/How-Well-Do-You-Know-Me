"use client";

import { FormEvent, useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendAction, useRoom } from "@/components/use-room";
import type { PlayerState } from "@/lib/types";

const STORAGE = "dykm-player";

type Session = { code: string; token: string };

export function PlayScreen({ initialCode }: { initialCode?: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [code, setCode] = useState(initialCode ?? "");
  const [name, setName] = useState("");
  const [own, setOwn] = useState("");
  const [prediction, setPrediction] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [locking, setLocking] = useState(false);
  const [justLocked, setJustLocked] = useState(false);
  const { state, error } = useRoom(session?.code ?? null, { player: session?.token });

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as Session;
      if (saved.code && saved.token) setSession(saved);
    } catch {
      window.localStorage.removeItem(STORAGE);
    }
  }, []);

  async function join(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setJoining(true);
    try {
      const response = await fetch(`/api/games/${code.trim().toUpperCase()}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await response.json()) as { playerToken?: string; error?: string };
      if (!response.ok || !body.playerToken) {
        setFormError(body.error ?? "Could not join.");
        return;
      }
      const next = { code: code.trim().toUpperCase(), token: body.playerToken };
      window.localStorage.setItem(STORAGE, JSON.stringify(next));
      setSession(next);
    } catch {
      setFormError("Could not join. Check the room code.");
    } finally {
      setJoining(false);
    }
  }

  function handOff() {
    window.localStorage.removeItem(STORAGE);
    setSession(null);
    setOwn("");
    setPrediction("");
    setReadyFor(null);
  }

  const player = state?.role === "player" ? (state as PlayerState) : null;
  const questionKey = player ? `${player.round}-${player.position}` : "";
  const showHint =
    player?.phase === "answering" && !player.locked && !justLocked && readyFor !== questionKey;

  useEffect(() => {
    setJustLocked(false);
  }, [questionKey]);

  async function lock(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setLocking(true);
    setFormError(null);
    try {
      await sendAction(session.code, { action: "lock", own, prediction }, { player: session.token });
      setOwn("");
      setPrediction("");
      setJustLocked(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not lock.");
    } finally {
      setLocking(false);
    }
  }

  if (session && !state && !error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-8">
        <Logo />
        <p className="mt-8 text-2xl">Loading your seat…</p>
      </main>
    );
  }

  if (!session || !player) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-8">
        <Logo />
        <h1 className="mt-8 font-display text-4xl leading-tight">Join the room</h1>
        <form onSubmit={join} className="mt-6 flex flex-col gap-4">
          <div>
            <Label htmlFor="room-code">Room code</Label>
            <Input
              id="room-code"
              data-testid="join-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              className="mt-2 min-h-14 text-lg"
              required
            />
          </div>
          <div>
            <Label htmlFor="player-name">Your name</Label>
            <Input
              id="player-name"
              data-testid="join-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="nickname"
              className="mt-2 min-h-14 text-lg"
              required
            />
          </div>
          {formError || error ? <p className="text-lg text-terracotta-dark">{formError || error}</p> : null}
          <Button type="submit" size="wide" disabled={joining} data-testid="join-submit">
            {joining ? "Joining…" : "Join"}
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-5 py-8">
      <Logo markClassName="h-12 w-12" className="[&_p]:text-2xl" />
      <p className="mt-6 text-lg">
        {player.name}
        {player.teamName ? ` · ${player.teamName}` : ""} · Room {player.code}
      </p>

      {player.phase === "setup" ? (
        <section className="mt-8">
          <h1 className="font-display text-4xl leading-tight">You&apos;re in.</h1>
          <p className="mt-4 text-xl leading-relaxed">
            {player.needsTeam
              ? "The host is pairing everyone up. Keep this page open."
              : `You're on ${player.teamName}. Watch for the first question.`}
          </p>
        </section>
      ) : null}

      {player.phase === "answering" && player.needsTeam ? (
        <h1 className="mt-8 font-display text-4xl leading-tight">You&apos;re not on a team. Watch the TV.</h1>
      ) : null}

      {showHint && player.question ? (
        <section className="mt-8 flex flex-1 flex-col">
          <h1 className="font-display text-4xl leading-tight">Pass the phone.</h1>
          <p className="mt-4 text-xl leading-relaxed">
            If you share a phone, hand it over now. Sit apart so you cannot see each other&apos;s answers.
            There is no race clock.
          </p>
          <Button
            type="button"
            size="wide"
            className="mt-8"
            data-testid="ready"
            onClick={() => setReadyFor(questionKey)}
          >
            I&apos;m ready to answer
          </Button>
        </section>
      ) : null}

      {player.phase === "answering" && player.question && !player.locked && !justLocked && !showHint ? (
        <form onSubmit={lock} className="mt-6 flex flex-1 flex-col gap-5">
          <p className="text-lg text-terracotta-dark">
            Round {player.round} · Question {player.position}
            {player.position === 6 ? " · Bonus" : ""}
          </p>
          <h1 className="font-display text-4xl leading-tight">{player.question.prompt}</h1>
          <div>
            <Label htmlFor="own-answer">Your answer</Label>
            <Input
              id="own-answer"
              data-testid="own-answer"
              value={own}
              onChange={(event) => setOwn(event.target.value)}
              maxLength={120}
              autoComplete="off"
              className="mt-2 min-h-14 text-lg"
              required
            />
          </div>
          <div>
            <Label htmlFor="prediction">What will your partner say?</Label>
            <Input
              id="prediction"
              data-testid="prediction"
              value={prediction}
              onChange={(event) => setPrediction(event.target.value)}
              maxLength={120}
              autoComplete="off"
              className="mt-2 min-h-14 text-lg"
              required
            />
          </div>
          {formError ? <p className="text-lg text-terracotta-dark">{formError}</p> : null}
          <Button type="submit" size="wide" disabled={locking} data-testid="lock-answer">
            {locking ? "Locking…" : "Lock it in"}
          </Button>
        </form>
      ) : null}

      {player.locked || justLocked || player.phase === "revealing" || player.phase === "final" ? (
        <section className="mt-8" data-testid="watch-tv">
          <h1 className="font-display text-5xl leading-tight">You&apos;re in — watch the TV.</h1>
          <p className="mt-4 text-xl leading-relaxed">
            {player.phase === "final"
              ? "The standings on the TV are the final result."
              : player.locked
                ? "Your answer stays locked. Your partner cannot see it on this phone."
                : "Eyes on the TV."}
          </p>
        </section>
      ) : null}

      {player.phase === "answering" && !player.question && !player.locked && !player.needsTeam ? (
        <p className="mt-8 text-xl">Waiting for the next question.</p>
      ) : null}

      <button
        type="button"
        onClick={handOff}
        className="mt-10 min-h-12 pb-8 text-left text-lg text-ink/70 underline-offset-4"
      >
        Hand this phone to someone else
      </button>
    </main>
  );
}
