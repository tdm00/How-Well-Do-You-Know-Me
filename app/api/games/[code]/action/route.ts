import { GameError, performAction } from "@/lib/game";
import type { GameAction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(request: Request, context: Ctx) {
  const { code } = await context.params;
  try {
    const body = (await request.json()) as GameAction;
    if (!body || typeof body.action !== "string") {
      return Response.json({ error: "Missing action." }, { status: 400 });
    }
    const state = performAction(code, body, {
      hostToken: request.headers.get("x-host-token"),
      playerToken: request.headers.get("x-player-token"),
    });
    return Response.json(state);
  } catch (error) {
    if (error instanceof GameError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Could not update the game." }, { status: 500 });
  }
}
