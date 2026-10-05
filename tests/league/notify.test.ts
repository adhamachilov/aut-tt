import { describe, expect, it, vi } from "vitest";

const sent: { chatId: number; text: string }[] = [];
vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "https://example.test", LEAGUE_NAME: "AUT League" }) }));
vi.mock("@/lib/telegram/bot", async (load) => ({
  ...(await load<typeof import("@/lib/telegram/bot")>()),
  sendMessage: vi.fn(async (chatId: number, text: string) => {
    if (chatId === 4) throw new Error("bot was blocked by the user");
    sent.push({ chatId, text });
  }),
}));

const { notifyMatchDay } = await import("@/lib/telegram/notify");

describe("notifyMatchDay", () => {
  const a = { name: "Adham", telegramId: 1, username: "a_adham" };
  const b = { name: "Bek <script>", telegramId: 2, username: "bek_1" };
  const c = { name: "Cara", telegramId: 3, username: null };
  const d = { name: "Dan", telegramId: 4, username: "dan" };

  it("sends each player one message with their opponents' contacts and the time instructions", async () => {
    sent.length = 0;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await notifyMatchDay({
      day: 2,
      date: "2026-10-06",
      gamesPerMatch: 3,
      organizer: a,
      note: "Correction: Day 2 is on Tuesday 6 Oct.",
      matches: [
        { round: 1, player1: a, player2: b },
        { round: 2, player1: c, player2: a },
        { round: 3, player1: d, player2: c },
      ],
    });

    expect(result).toEqual({ sent: 3, total: 4 });
    expect(errors).toHaveBeenCalledOnce();
    const bek = sent.find((m) => m.chatId === 2)!.text;
    expect(bek).toContain("⚠️ <b>Correction: Day 2 is on Tuesday 6 Oct.</b>");
    expect(bek).toContain("Day 2 · Tue 6 Oct");
    expect(bek).toContain("Match 1: vs <b>Adham</b> — @a_adham");
    expect(bek).toContain("agree on a time to play. Then tell the organizer (@a_adham) the time you chose.");

    const adham = sent.find((m) => m.chatId === 1)!.text;
    expect(adham).toContain("Match 1: vs <b>Bek &lt;script&gt;</b> — @bek_1");
    // Cara has no username: a tap-to-open mention instead.
    expect(adham).toContain('Match 2: vs <b>Cara</b> — <a href="tg://user?id=3">Cara</a>');
    // The organizer isn't told to tell themselves.
    expect(adham).toContain("Then tell the organizer the time you chose.");
  });
});
