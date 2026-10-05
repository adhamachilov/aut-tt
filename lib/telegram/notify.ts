import "server-only";
import { env } from "@/lib/env";
import { rulesText } from "@/lib/league/rules";
import { html, sendMessage } from "./bot";

export interface Person {
  name: string;
  telegramId: number;
  username: string | null;
}

export interface DayMatch {
  round: number;
  player1: Person;
  player2: Person;
}

export interface DayNotice {
  day: number;
  /** YYYY-MM-DD */
  date: string;
  gamesPerMatch: number;
  matches: DayMatch[];
  /** Who players tell the agreed time to. */
  organizer: Person | null;
  /** Shown at the top, e.g. a date correction. */
  note?: string;
}

export const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "@username", or a tap-to-open mention when someone has no username. */
function contact(p: Person): string {
  return p.username ? `@${html(p.username)}` : `<a href="tg://user?id=${p.telegramId}">${html(p.name)}</a>`;
}

export function dayMessage(notice: DayNotice, me: Person, lines: string[]): string {
  const { LEAGUE_NAME } = env();
  const organizer = notice.organizer && notice.organizer.telegramId !== me.telegramId ? ` (${contact(notice.organizer)})` : "";
  return [
    `🏓 <b>${html(LEAGUE_NAME)}</b>`,
    ...(notice.note ? [`\n⚠️ <b>${html(notice.note)}</b>`] : []),
    `\n<b>Day ${notice.day} · ${dayLabel(notice.date)}</b>`,
    "",
    ...lines,
    "",
    `⏰ Message your opponent and agree on a time to play. Then tell the organizer${organizer} the time you chose.`,
    "",
    html(rulesText(notice.gamesPerMatch)),
  ].join("\n");
}

/** Tells every player in a match day who they play. Failures (e.g. a player blocked the bot) are logged, not thrown. */
export async function notifyMatchDay(notice: DayNotice) {
  const { APP_URL } = env();
  const byPlayer = new Map<number, { me: Person; lines: string[] }>();
  for (const m of notice.matches) {
    for (const [me, them] of [
      [m.player1, m.player2],
      [m.player2, m.player1],
    ] as const) {
      const entry = byPlayer.get(me.telegramId) ?? { me, lines: [] };
      entry.lines.push(`Match ${m.round}: vs <b>${html(them.name)}</b> — ${contact(them)}`);
      byPlayer.set(me.telegramId, entry);
    }
  }

  const button = APP_URL ? [[{ text: "🏓 Open League", web_app: { url: APP_URL } }]] : undefined;
  const jobs = [...byPlayer].map(([chatId, { me, lines }]) => () => sendMessage(chatId, dayMessage(notice, me, lines), button));
  let sent = 0;
  // Small batches stay well under Telegram's ~30 messages/second limit.
  for (let i = 0; i < jobs.length; i += 20) {
    const results = await Promise.allSettled(jobs.slice(i, i + 20).map((job) => job()));
    for (const r of results) {
      if (r.status === "fulfilled") sent++;
      else console.error("[notify]", r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }
  return { sent, total: jobs.length };
}
