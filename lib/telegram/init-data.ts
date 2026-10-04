import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-side validation of Telegram Mini App init data, per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 *   data_check_string = every field except `hash`, as "key=value", sorted by key, joined by "\n"
 *   secret_key        = HMAC_SHA256(key = "WebAppData", message = bot_token)
 *   expected_hash     = hex(HMAC_SHA256(key = secret_key, message = data_check_string))
 *
 * The client never tells us who it is; it hands us this signed blob and we derive
 * the Telegram user from it only if the signature and freshness check pass.
 */

export interface TelegramInitUser {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  languageCode: string | null;
}

export type InitDataResult =
  | { ok: true; user: TelegramInitUser; authDate: Date }
  | { ok: false; error: "missing" | "malformed" | "bad_signature" | "expired" | "no_user" };

/** Init data older than this is rejected (replay protection). */
export const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

export function signInitData(fields: Record<string, string>, botToken: string): string {
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const dataCheckString = Object.keys(fields)
    .filter((k) => k !== "hash")
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  return createHmac("sha256", secret).update(dataCheckString).digest("hex");
}

export function validateInitData(
  initData: string | null | undefined,
  botToken: string,
  options: { maxAgeSeconds?: number; now?: Date } = {},
): InitDataResult {
  if (!initData || typeof initData !== "string") return { ok: false, error: "missing" };
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: "malformed" };
  }

  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, error: "malformed" };

  const fields: Record<string, string> = {};
  for (const [k, v] of params) {
    if (k in fields) return { ok: false, error: "malformed" };
    fields[k] = v;
  }

  const expected = Buffer.from(signInitData(fields, botToken), "hex");
  const given = Buffer.from(hash, "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, error: "bad_signature" };
  }

  const authDateSeconds = Number(fields.auth_date);
  if (!Number.isFinite(authDateSeconds) || authDateSeconds <= 0) return { ok: false, error: "malformed" };
  const now = options.now ?? new Date();
  const maxAge = options.maxAgeSeconds ?? DEFAULT_INIT_DATA_MAX_AGE_SECONDS;
  const ageSeconds = now.getTime() / 1000 - authDateSeconds;
  if (ageSeconds > maxAge || ageSeconds < -300) return { ok: false, error: "expired" };

  if (!fields.user) return { ok: false, error: "no_user" };
  let raw: unknown;
  try {
    raw = JSON.parse(fields.user);
  } catch {
    return { ok: false, error: "malformed" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "no_user" };
  const u = raw as Record<string, unknown>;
  if (typeof u.id !== "number" || !Number.isSafeInteger(u.id) || u.id <= 0) return { ok: false, error: "no_user" };

  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  return {
    ok: true,
    authDate: new Date(authDateSeconds * 1000),
    user: {
      id: u.id,
      firstName: str(u.first_name) ?? "",
      lastName: str(u.last_name),
      username: str(u.username),
      photoUrl: str(u.photo_url),
      languageCode: str(u.language_code),
    },
  };
}
