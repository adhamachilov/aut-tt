import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: () => ({ LEAGUE_TIMEZONE: "Asia/Tashkent" }), adminTelegramIds: () => new Set() }));

const { leagueToday } = await import("@/lib/league/server");

describe("leagueToday", () => {
  it("uses the league's time zone, not UTC", () => {
    // 20:30 UTC on 13 Oct is already 01:30 on 14 Oct in Tashkent (UTC+5).
    expect(leagueToday(new Date("2026-10-13T20:30:00Z"))).toBe("2026-10-14");
    expect(leagueToday(new Date("2026-10-13T18:00:00Z"))).toBe("2026-10-13");
  });
});
