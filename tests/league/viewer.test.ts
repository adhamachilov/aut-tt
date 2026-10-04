import { describe, expect, it } from "vitest";
import { signInitData } from "@/lib/telegram/init-data";
import { resolveViewer } from "@/lib/league/viewer";

const BOT = "123456:ABCdefGHIjklMNOpqrSTUvwxYZ012345678";
const now = new Date("2026-10-01T12:00:00Z");

function initData(userId: number, token = BOT) {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(now.getTime() / 1000) - 60),
    user: JSON.stringify({ id: userId, first_name: "Ann", username: "ann" }),
  };
  return new URLSearchParams({ ...fields, hash: signInitData(fields, token) }).toString();
}

const deps = { botToken: BOT, devTelegramUserId: null, adminIds: new Set([42]), now };

describe("resolveViewer", () => {
  it("accepts signed Telegram data and marks admins by Telegram ID", () => {
    const player = resolveViewer(`tma ${initData(7)}`, deps);
    expect(player.ok && player.viewer).toMatchObject({ telegramId: 7, isAdmin: false, username: "ann" });
    const admin = resolveViewer(`tma ${initData(42)}`, deps);
    expect(admin.ok && admin.viewer.isAdmin).toBe(true);
  });

  it("rejects data signed for another bot", () => {
    expect(resolveViewer(`tma ${initData(42, "999:zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")}`, deps).ok).toBe(false);
  });

  it("rejects a tampered user ID", () => {
    const tampered = initData(7).replace("%22id%22%3A7", "%22id%22%3A42");
    expect(resolveViewer(`tma ${tampered}`, deps).ok).toBe(false);
  });

  it("allows the dev login only when the server enabled it", () => {
    expect(resolveViewer("dev", deps).ok).toBe(false);
    const dev = resolveViewer("dev", { ...deps, devTelegramUserId: 42 });
    expect(dev.ok && dev.viewer).toMatchObject({ telegramId: 42, isAdmin: true, dev: true });
  });

  it("rejects requests with no Telegram data", () => {
    expect(resolveViewer(null, deps).ok).toBe(false);
    expect(resolveViewer("Bearer x", deps).ok).toBe(false);
  });
});
