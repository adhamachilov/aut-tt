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
export function contact(p: Person): string {
  return p.username ? `@${html(p.username)}` : `<a href="tg://user?id=${p.telegramId}">${html(p.name)}</a>`;
}

const ORDINALS = ["1st", "2nd", "3rd"];

/** "Your match: vs X", or "1st match: …, 2nd match: …" when someone plays more than once that day. */
export function opponentLines(opponents: readonly Person[]): string[] {
  const line = (p: Person) => `vs <b>${html(p.name)}</b> — ${contact(p)}`;
  if (opponents.length === 1) return [`Your match: ${line(opponents[0])}`];
  return opponents.map((p, i) => `${ORDINALS[i] ?? `${i + 1}th`} match: ${line(p)}`);
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
  const byPlayer = new Map<number, { me: Person; opponents: Person[] }>();
  for (const m of [...notice.matches].sort((x, y) => x.round - y.round)) {
    for (const [me, them] of [
      [m.player1, m.player2],
      [m.player2, m.player1],
    ] as const) {
      const entry = byPlayer.get(me.telegramId) ?? { me, opponents: [] };
      entry.opponents.push(them);
      byPlayer.set(me.telegramId, entry);
    }
  }

  const button = APP_URL ? [[{ text: "🏓 Open League", web_app: { url: APP_URL } }]] : undefined;
  const jobs = [...byPlayer].map(([chatId, { me, opponents }]) => () => sendMessage(chatId, dayMessage(notice, me, opponentLines(opponents)), button));
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

export interface ReminderMatch {
  day: number;
  date: string;
  opponent: Person;
}

/** Morning message: today's matches, plus older ones that still need playing. */
export function reminderMessage(today: ReminderMatch[], overdue: ReminderMatch[], organizer: Person | null, me: Person): string {
  const { LEAGUE_NAME } = env();
  const line = (m: ReminderMatch) => `vs <b>${html(m.opponent.name)}</b> — ${contact(m.opponent)}`;
  const tellOrganizer = organizer && organizer.telegramId !== me.telegramId ? ` (${contact(organizer)})` : "";
  return [
    `🏓 <b>${html(LEAGUE_NAME)}</b>`,
    ...(today.length ? ["", `☀️ <b>You play today · Day ${today[0].day} · ${dayLabel(today[0].date)}</b>`, ...today.map(line)] : []),
    ...(overdue.length ? ["", "⏳ <b>Still to play</b>", ...overdue.map((m) => `Day ${m.day} · ${dayLabel(m.date)}: ${line(m)}`)] : []),
    "",
    `⏰ If you haven't yet, message your opponent and agree on a time. Then tell the organizer${tellOrganizer} the time you chose.`,
  ].join("\n");
}

export interface ResultNotice {
  day: number;
  date: string | null;
  corrected: boolean;
  me: Person;
  opponent: Person;
  myScore: number;
  theirScore: number;
  /** Game points from my side, e.g. [[11, 9], [7, 11]]. */
  games: [number, number][] | null;
  position: number;
  points: number;
}

export function resultMessage(r: ResultNotice): string {
  const { LEAGUE_NAME } = env();
  const won = r.myScore > r.theirScore;
  const games = r.games?.length ? ` (${r.games.map(([a, b]) => `${a}–${b}`).join(" · ")})` : "";
  return [
    `🏓 <b>${html(LEAGUE_NAME)}</b>`,
    "",
    `${r.corrected ? "✏️ <b>Result corrected</b>" : "✅ <b>Result saved</b>"} · Day ${r.day}${r.date ? ` · ${dayLabel(r.date)}` : ""}`,
    `${won ? "🏆 You beat" : "You lost to"} <b>${html(r.opponent.name)}</b> ${r.myScore}–${r.theirScore}${games}`,
    "",
    `+${r.myScore} ${r.myScore === 1 ? "point" : "points"} · You're <b>#${r.position}</b> with ${r.points} ${r.points === 1 ? "point" : "points"}.`,
  ].join("\n");
}

export interface TableLine {
  position: number;
  name: string;
  points: number;
  wins: number;
  losses: number;
  isMe: boolean;
}

export function tableMessage(season: string, rows: TableLine[], mine: TableLine | null): string {
  const { LEAGUE_NAME } = env();
  const line = (r: TableLine) => `${r.position}. ${r.isMe ? "<b>You</b>" : html(r.name)} — ${r.points} pts (${r.wins}W ${r.losses}L)`;
  const top = rows.map(line);
  if (mine && !rows.some((r) => r.isMe)) top.push("…", line(mine));
  return [`🏓 <b>${html(LEAGUE_NAME)}</b> · ${html(season)}`, "", "<b>Table</b>", ...(top.length ? top : ["No results yet."])].join("\n");
}

export function nextMessage(upcoming: ReminderMatch[], organizer: Person | null, me: Person): string {
  const { LEAGUE_NAME } = env();
  if (!upcoming.length) {
    return `🏓 <b>${html(LEAGUE_NAME)}</b>\n\nYou have no matches waiting right now. You'll get a message as soon as you're picked for a match day.`;
  }
  const tellOrganizer = organizer && organizer.telegramId !== me.telegramId ? ` (${contact(organizer)})` : "";
  return [
    `🏓 <b>${html(LEAGUE_NAME)}</b>`,
    "",
    "<b>Your next matches</b>",
    ...upcoming.map((m) => `Day ${m.day} · ${dayLabel(m.date)}: vs <b>${html(m.opponent.name)}</b> — ${contact(m.opponent)}`),
    "",
    `⏰ Agree on a time with your opponent, then tell the organizer${tellOrganizer}.`,
  ].join("\n");
}
