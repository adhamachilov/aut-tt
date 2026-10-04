import { validateInitData } from "@/lib/telegram/init-data";

export interface Viewer {
  telegramId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  isAdmin: boolean;
  dev: boolean;
}

export type ViewerResult = { ok: true; viewer: Viewer } | { ok: false; error: string };

// Identity comes only from Telegram-signed init data ("Authorization: tma <initData>").
// The client can't name a Telegram ID; "dev" works only when the server opted in.
export function resolveViewer(
  authorization: string | null,
  deps: { botToken: string | undefined; devTelegramUserId: number | null; adminIds: Set<number>; now?: Date },
): ViewerResult {
  const header = authorization?.trim() ?? "";

  if (header.startsWith("tma ")) {
    if (!deps.botToken) return { ok: false, error: "The bot token isn't configured on the server." };
    const r = validateInitData(header.slice(4), deps.botToken, { now: deps.now });
    if (!r.ok) return { ok: false, error: r.error === "expired" ? "Session expired. Reopen the app from Telegram." : "Invalid Telegram session." };
    const u = r.user;
    return {
      ok: true,
      viewer: { telegramId: u.id, firstName: u.firstName, lastName: u.lastName, username: u.username, isAdmin: deps.adminIds.has(u.id), dev: false },
    };
  }

  if (header === "dev" && deps.devTelegramUserId) {
    const id = deps.devTelegramUserId;
    return { ok: true, viewer: { telegramId: id, firstName: "Dev", lastName: null, username: null, isAdmin: deps.adminIds.has(id), dev: true } };
  }

  return { ok: false, error: "Open this app from Telegram." };
}
