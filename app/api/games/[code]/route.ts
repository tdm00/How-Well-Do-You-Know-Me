import { GameError, getState } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: Request, context: Ctx) {
  const { code } = await context.params;
  try {
    const state = getState(code, {
      hostToken: request.headers.get("x-host-token"),
      playerToken: request.headers.get("x-player-token"),
    });
    return Response.json(state);
  } catch (error) {
    if (error instanceof GameError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Could not load the game." }, { status: 500 });
  }
}
