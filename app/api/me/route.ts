import { env } from "@/lib/env";
import { authenticate, handle, json } from "@/lib/league/http";
import { getPlayerByTelegramId, saveOwnProfile } from "@/lib/league/server";
import type { MeResponse } from "@/lib/league/types";

export async function GET(request: Request) {
  const auth = authenticate(request);
  if ("response" in auth) return auth.response;
  const { viewer } = auth;
  return handle(async () => {
    const body: MeResponse = {
      leagueName: env().LEAGUE_NAME,
      telegramId: viewer.telegramId,
      firstName: viewer.firstName,
      lastName: viewer.lastName,
      player: await getPlayerByTelegramId(viewer.telegramId),
      isAdmin: viewer.isAdmin,
      dev: viewer.dev,
    };
    return json(body);
  });
}

// Register or edit your own profile. The Telegram ID comes from the verified session.
export async function POST(request: Request) {
  const auth = authenticate(request);
  if ("response" in auth) return auth.response;
  return handle(async () => json({ player: await saveOwnProfile(auth.viewer, await request.json().catch(() => null)) }));
}
