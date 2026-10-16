import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "https://example.test", LEAGUE_NAME: "AUT League", LEAGUE_TIMEZONE: "Asia/Tashkent" }) }));

const { reminderMessage, resultMessage, tableMessage, nextMessage } = await import("@/lib/telegram/notify");

const admin = { name: "Adham", telegramId: 1, username: "a_adham" };
const sher = { name: "Sher", telegramId: 2, username: "sherzodkomill" };
const bill = { name: "Bill <Edon>", telegramId: 3, username: null };

describe("bot messages", () => {
  it("reminds about today's match and older unplayed ones, with contacts", () => {
    const text = reminderMessage(
      [{ day: 7, date: "2026-10-14", opponent: sher }],
      [{ day: 5, date: "2026-10-12", opponent: bill }],
      admin,
      bill,
    );
    expect(text).toContain("You play today · Day 7 · Wed 14 Oct");
    expect(text).toContain("vs <b>Sher</b> — @sherzodkomill");
    expect(text).toContain("Still to play");
    expect(text).toContain('Day 5 · Mon 12 Oct: vs <b>Bill &lt;Edon&gt;</b> — <a href="tg://user?id=3">Bill &lt;Edon&gt;</a>');
    expect(text).toContain("Play your match today between <b>11:00 and 13:00</b>");
    expect(text).toContain("Message the organizer: @a_adham");
  });

  it("reports a result with game scores, points and position", () => {
    const text = resultMessage({
      day: 1, date: "2026-10-05", corrected: false, me: sher, opponent: bill,
      myScore: 3, theirScore: 0, games: [[11, 0], [11, 0], [11, 0]], outcome: null, noShows: 0, position: 1, points: 6,
    });
    expect(text).toContain("✅ <b>Result saved</b> · Day 1 · Mon 5 Oct");
    expect(text).toContain("🏆 You beat <b>Bill &lt;Edon&gt;</b> 3–0 (11–0 · 11–0 · 11–0)");
    expect(text).toContain("+3 points · You're <b>#1</b> with 6 points.");

    const lost = resultMessage({ day: 1, date: null, corrected: true, me: bill, opponent: sher, myScore: 1, theirScore: 2, games: null, outcome: null, noShows: 0, position: 9, points: 1 });
    expect(lost).toContain("✏️ <b>Result corrected</b> · Day 1");
    expect(lost).toContain("You lost to <b>Sher</b> 1–2");
    expect(lost).toContain("+1 point · You're <b>#9</b> with 1 point.");
  });

  it("explains walkovers and no-shows", () => {
    const base = { day: 8, date: "2026-10-16", corrected: false, games: null, position: 5, points: 4 };
    const win = resultMessage({ ...base, me: sher, opponent: bill, myScore: 3, theirScore: 0, games: [[11, 0], [11, 0], [11, 0]], outcome: "walkover", noShows: 0 });
    expect(win).toContain("✅ <b>Walkover</b> · Day 8 · Fri 16 Oct");
    expect(win).toContain("didn't show up, so you win 3–0 (11–0 · 11–0 · 11–0).");

    const missed = resultMessage({ ...base, me: bill, opponent: sher, myScore: 0, theirScore: 3, outcome: "walkover", noShows: 1 });
    expect(missed).toContain("❌ <b>No-show</b>");
    expect(missed).toContain("You missed your match vs <b>Sher</b>, so it counts as a 0–3 loss.");
    expect(missed).toContain("1st no-show. A 2nd one removes you");

    const both = resultMessage({ ...base, me: bill, opponent: sher, myScore: 0, theirScore: 0, outcome: "both_absent", noShows: 2 });
    expect(both).toContain("Neither you nor <b>Sher</b> came, so the match is closed 0–0 with no points.");
    expect(both).toContain("no-show #2. The organizer may remove you");
  });

  it("shows the top of the table and the sender's own row below it", () => {
    const row = (position: number, name: string, isMe = false) => ({ position, name, points: 10 - position, wins: 2, losses: 1, isMe });
    const text = tableMessage("Season 1", [row(1, "Sher"), row(2, "U.K")], row(14, "Bill", true));
    expect(text).toContain("1. Sher — 9 pts (2W 1L)");
    expect(text).toContain("…\n14. <b>You</b> — -4 pts (2W 1L)");
  });

  it("lists next matches, or says there are none", () => {
    expect(nextMessage([{ day: 7, date: "2026-10-14", opponent: sher }], admin, bill)).toContain("Day 7 · Wed 14 Oct: vs <b>Sher</b> — @sherzodkomill");
    expect(nextMessage([], admin, bill)).toContain("no matches waiting");
  });
});
