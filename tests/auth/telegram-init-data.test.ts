import { describe, expect, it } from "vitest";
import { signInitData, validateInitData } from "@/lib/telegram/init-data";

const BOT_TOKEN = "123456:TEST-token";
const now = new Date("2026-09-30T12:00:00Z");

function build(user: object, overrides: Record<string, string> = {}, token = BOT_TOKEN) {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(now.getTime() / 1000) - 60),
    query_id: "AAE-test",
    user: JSON.stringify(user),
    ...overrides,
  };
  const hash = signInitData(fields, token);
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe("Telegram init data", () => {
  it("accepts correctly signed, fresh data and extracts the user", () => {
    const r = validateInitData(build({ id: 42, first_name: "Ali", username: "ali" }), BOT_TOKEN, { now });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user).toMatchObject({ id: 42, firstName: "Ali", username: "ali" });
  });

  it("rejects data signed with a different bot token", () => {
    const r = validateInitData(build({ id: 42 }, {}, "999:other"), BOT_TOKEN, { now });
    expect(r).toEqual({ ok: false, error: "bad_signature" });
  });

  it("rejects a tampered user id (impersonation attempt)", () => {
    const genuine = new URLSearchParams(build({ id: 42, first_name: "Ali" }));
    genuine.set("user", JSON.stringify({ id: 1, first_name: "Admin" }));
    expect(validateInitData(genuine.toString(), BOT_TOKEN, { now })).toEqual({ ok: false, error: "bad_signature" });
  });

  it("rejects stale data", () => {
    const old = build({ id: 42 }, { auth_date: String(Math.floor(now.getTime() / 1000) - 3 * 86400) });
    expect(validateInitData(old, BOT_TOKEN, { now })).toEqual({ ok: false, error: "expired" });
  });

  it("rejects missing or malformed input", () => {
    expect(validateInitData("", BOT_TOKEN).ok).toBe(false);
    expect(validateInitData("user=%7B%7D", BOT_TOKEN).ok).toBe(false);
    expect(validateInitData("telegram_id=1", BOT_TOKEN).ok).toBe(false);
  });
});
