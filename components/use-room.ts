"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameAction, GameState } from "@/lib/types";

export function useRoom(
  code: string | null,
  tokens: { host?: string | null; player?: string | null },
) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!code) return;
    const headers: Record<string, string> = {};
    if (tokens.host) headers["x-host-token"] = tokens.host;
    if (tokens.player) headers["x-player-token"] = tokens.player;
    try {
      const response = await fetch(`/api/games/${code}`, { headers, cache: "no-store" });
      const body = (await response.json()) as GameState & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not load the room.");
        return;
      }
      setState(body);
      setError(null);
    } catch {
      setError("The room did not answer. Try again.");
    }
  }, [code, tokens.host, tokens.player]);

  useEffect(() => {
    if (!code) return;
    void reload();
    const source = new EventSource(`/api/games/${code}/events`);
    const onState = () => {
      void reload();
    };
    source.addEventListener("state", onState);
    const poll = window.setInterval(() => {
      void reload();
    }, 2000);
    return () => {
      source.removeEventListener("state", onState);
      source.close();
      window.clearInterval(poll);
    };
  }, [code, reload]);

  return { state, error, reload };
}

export async function sendAction(
  code: string,
  action: GameAction,
  tokens: { host?: string | null; player?: string | null },
): Promise<GameState> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (tokens.host) headers["x-host-token"] = tokens.host;
  if (tokens.player) headers["x-player-token"] = tokens.player;
  const response = await fetch(`/api/games/${code}/action`, {
    method: "POST",
    headers,
    body: JSON.stringify(action),
  });
  const body = (await response.json()) as GameState & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "That did not work.");
  return body;
}
