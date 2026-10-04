import "server-only";
import { env } from "@/lib/env";
import { rulesText } from "@/lib/league/rules";
import { html, sendMessage } from "./bot";

export interface DayMatch {
  round: number;
  player1: { name: string; telegramId: number };
  player2: { name: string; telegramId: number };
}

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Tells every player in a new match day who they play. Failures (e.g. a player blocked the bot) are logged, not thrown. */
export async function notifyMatchDay(day: number, date: string, gamesPerMatch: number, matches: DayMatch[]) {
  const { APP_URL, LEAGUE_NAME } = env();
  const byPlayer = new Map<number, string[]>();
  for (const m of matches) {
    for (const [me, them] of [
      [m.player1, m.player2],
      [m.player2, m.player1],
    ] as const) {
      byPlayer.set(me.telegramId, [...(byPlayer.get(me.telegramId) ?? []), `Match ${m.round}: vs <b>${html(them.name)}</b>`]);
    }
  }

  const button = APP_URL ? [[{ text: "🏓 Open League", web_app: { url: APP_URL } }]] : undefined;
  const jobs = [...byPlayer].map(([chatId, lines]) => () =>
    sendMessage(
      chatId,
      `🏓 <b>${html(LEAGUE_NAME)}</b>\n<b>Day ${day} · ${dayLabel(date)}</b>\n\n${lines.join("\n")}\n\n${html(rulesText(gamesPerMatch))}`,
      button,
    ),
  );
  // Small batches stay well under Telegram's ~30 messages/second limit.
  for (let i = 0; i < jobs.length; i += 20) {
    const results = await Promise.allSettled(jobs.slice(i, i + 20).map((job) => job()));
    for (const r of results) if (r.status === "rejected") console.error("[notify]", r.reason instanceof Error ? r.reason.message : r.reason);
  }
}
