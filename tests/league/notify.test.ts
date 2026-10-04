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
  it("sends each player one message with all their matches, and survives a blocked bot", async () => {
    const a = { name: "Adham", telegramId: 1 };
    const b = { name: "Bek <script>", telegramId: 2 };
    const c = { name: "Cara", telegramId: 3 };
    const d = { name: "Dan", telegramId: 4 };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await notifyMatchDay(2, "2026-10-05", 3, [
      { round: 1, player1: a, player2: b },
      { round: 2, player1: c, player2: a },
      { round: 3, player1: d, player2: c },
    ]);

    expect(sent.map((m) => m.chatId).sort()).toEqual([1, 2, 3]);
    const adham = sent.find((m) => m.chatId === 1)!.text;
    expect(adham).toContain("Day 2 · Mon 5 Oct");
    expect(adham).toContain("Match 1: vs <b>Bek &lt;script&gt;</b>");
    expect(adham).toContain("Match 2: vs <b>Cara</b>");
    expect(sent.find((m) => m.chatId === 2)!.text).toContain("Match 1: vs <b>Adham</b>");
    expect(errors).toHaveBeenCalledOnce();
  });
});
