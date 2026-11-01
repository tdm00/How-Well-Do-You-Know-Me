import { GameError, joinGame } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(request: Request, context: Ctx) {
  const { code } = await context.params;
  try {
    const body = (await request.json()) as { name?: string };
    const result = joinGame(code, body.name ?? "");
    return Response.json(result);
  } catch (error) {
    if (error instanceof GameError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Could not join the game." }, { status: 500 });
  }
}
