import type { NextRequest } from "next/server";
import { authenticate, handle, json, UserError } from "@/lib/league/http";
import { joinSeason, leaveSeason, loadLeague } from "@/lib/league/server";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if ("response" in auth) return auth.response;
  return handle(async () => json(await loadLeague(request.nextUrl.searchParams.get("season"), auth.viewer.telegramId)));
}

export async function POST(request: Request) {
  const auth = authenticate(request);
  if ("response" in auth) return auth.response;
  return handle(async () => {
    const body = (await request.json().catch(() => null)) as { action?: string; seasonId?: string } | null;
    if (typeof body?.seasonId !== "string") throw new UserError("Missing season.");
    if (body.action === "join") await joinSeason(auth.viewer, body.seasonId);
    else if (body.action === "leave") await leaveSeason(auth.viewer, body.seasonId);
    else throw new UserError("Unknown action.");
    return json({ ok: true });
  });
}
