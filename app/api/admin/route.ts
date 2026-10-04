import { authenticate, handle, json } from "@/lib/league/http";
import { listPlayers, runAdminAction } from "@/lib/league/server";

function requireAdmin(request: Request) {
  const auth = authenticate(request);
  if ("response" in auth) return auth;
  if (!auth.viewer.isAdmin) return { response: json({ error: "Organizers only." }, 403) };
  return auth;
}

export async function GET(request: Request) {
  const auth = requireAdmin(request);
  if ("response" in auth) return auth.response;
  return handle(async () => json({ players: await listPlayers() }));
}

export async function POST(request: Request) {
  const auth = requireAdmin(request);
  if ("response" in auth) return auth.response;
  return handle(async () => {
    await runAdminAction(await request.json().catch(() => null));
    return json({ ok: true });
  });
}
