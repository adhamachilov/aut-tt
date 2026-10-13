import "server-only";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { z } from "zod";
import { adminTelegramIds, env } from "@/lib/env";
import { sendMessage } from "@/lib/telegram/bot";
import {
  dayLabel,
  nextMessage,
  notifyMatchDay,
  reminderMessage,
  resultMessage,
  tableMessage,
  type DayNotice,
  type Person,
  type ReminderMatch,
} from "@/lib/telegram/notify";
import { UserError } from "./http";
import { planMatchDay } from "./matchday";
import { GAMES_PER_MATCH, isValidScore, scoreFromGames, MAX_MATCHES_PER_DAY, MAX_MATCHES_PER_PLAYER } from "./rules";
import { computeStandings } from "./standings";
import {
  ALL_MAJORS,
  degreeOfMajor,
  YEARS,
  type AdminAction,
  type AdminPlayer,
  type LeaguePlayer,
  type LeagueResponse,
  type Match,
  type Profile,
  type Season,
  type SeasonStatus,
  type Year,
} from "./types";
import type { Viewer } from "./viewer";

let client: SupabaseClient | null = null;

// Service-role client: bypasses RLS, so callers must authenticate the viewer first.
function db(): SupabaseClient {
  if (!client) {
    const e = env();
    client = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

interface PlayerRow {
  id: string;
  telegram_id: number;
  name: string;
  major: string;
  year: Year;
  username: string | null;
  banned: boolean;
  created_at: string;
}

interface SeasonRow {
  id: string;
  name: string;
  status: SeasonStatus;
  registration_open: boolean;
  registration_closes_at: string | null;
  games_per_match: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface MatchRow {
  id: string;
  season_id: string;
  day: number;
  day_date: string | null;
  round: number;
  player1_id: string;
  player2_id: string;
  score1: number | null;
  score2: number | null;
  game_scores: [number, number][] | null;
  played_at: string | null;
}

const MESSAGES: Record<string, string> = {
  registration_closed: "Registration for this season is closed.",
  player_banned: "This player is banned from joining seasons.",
  season_already_started: "This season has already started.",
  not_enough_players: "At least 2 players must join before the season can start.",
  season_not_found: "Season not found.",
  player_not_found: "Player not found. Register first.",
  season_not_active: "Start the season before adding match days.",
  season_finished: "This season is finished.",
  empty_match_day: "There are no matches to add.",
};

function fail(error: PostgrestError): never {
  if (MESSAGES[error.message]) throw new UserError(MESSAGES[error.message]);
  if (error.code === "23505" && error.message.includes("seasons_one_current")) {
    throw new UserError("Finish the current season before creating a new one.");
  }
  if (error.code === "PGRST205" || error.code === "42P01") {
    throw new Error("Database tables are missing: run `npx supabase db push`.");
  }
  throw new Error(`Database error ${error.code}: ${error.message}`);
}

function ok<T>(r: { data: T | null; error: PostgrestError | null }): T {
  if (r.error) fail(r.error);
  return r.data as T;
}

function maybe<T>(r: { data: T | null; error: PostgrestError | null }): T | null {
  if (r.error) fail(r.error);
  return r.data;
}

const toProfile = (p: PlayerRow): Profile => ({ id: p.id, name: p.name, major: p.major, year: p.year, username: p.username, banned: p.banned });

const toSeason = (s: SeasonRow, now = new Date()): Season => ({
  id: s.id,
  name: s.name,
  status: s.status,
  registrationOpen: s.registration_open,
  registrationClosesAt: s.registration_closes_at,
  gamesPerMatch: s.games_per_match,
  acceptingPlayers:
    s.status !== "finished" && s.registration_open && (!s.registration_closes_at || new Date(s.registration_closes_at) > now),
  startedAt: s.started_at,
  finishedAt: s.finished_at,
});

const toMatch = (m: MatchRow): Match => ({
  id: m.id,
  day: m.day,
  dayDate: m.day_date,
  round: m.round,
  player1Id: m.player1_id,
  player2Id: m.player2_id,
  score1: m.score1,
  score2: m.score2,
  games: m.game_scores,
  playedAt: m.played_at,
});

// ─── Players ─────────────────────────────────────────────────────────────────

const text = (label: string) => z.string().trim().min(2, `${label} is too short.`).max(60, `${label} is too long.`);
const yearSchema = z.enum(YEARS.map((y) => y.value) as [Year, ...Year[]], { error: "Choose your year." });
const majorSchema = z.enum(ALL_MAJORS as [string, ...string[]], { error: "Choose your major from the list." });
const sameDegree = (v: { major: string; year: Year }) => (degreeOfMajor(v.major) === "masters") === (v.year === "masters");
const degreeMismatch = { error: "Master's programs go with Master's, bachelor's programs with years 1–4." };
const profileSchema = z.object({ name: text("Name"), major: majorSchema, year: yearSchema }).refine(sameDegree, degreeMismatch);

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Invalid input.");
  return r.data;
}

export async function getPlayerByTelegramId(telegramId: number): Promise<Profile | null> {
  const row = maybe(await db().from("players").select("*").eq("telegram_id", telegramId).maybeSingle<PlayerRow>());
  return row ? toProfile(row) : null;
}

export async function saveOwnProfile(viewer: Viewer, input: unknown): Promise<Profile> {
  const p = parse(profileSchema, input);
  const row = ok(
    await db()
      .from("players")
      .upsert({ telegram_id: viewer.telegramId, name: p.name, major: p.major, year: p.year, username: viewer.username }, { onConflict: "telegram_id" })
      .select("*")
      .single<PlayerRow>(),
  );
  return toProfile(row);
}

// ─── League view ─────────────────────────────────────────────────────────────

export async function loadLeague(requestedSeasonId: string | null, viewerTelegramId: number): Promise<LeagueResponse> {
  const [seasonRows, me] = await Promise.all([
    db().from("seasons").select("*").order("created_at", { ascending: false }).returns<SeasonRow[]>().then(ok),
    getPlayerByTelegramId(viewerTelegramId),
  ]);

  const chosen =
    seasonRows.find((s) => s.id === requestedSeasonId) ?? seasonRows.find((s) => s.status !== "finished") ?? seasonRows[0] ?? null;
  const seasons = seasonRows.map((s) => ({ id: s.id, name: s.name, status: s.status }));
  if (!chosen) return { seasons, season: null, players: [], matches: [], standings: [], me: { playerId: me?.id ?? null, joined: false } };

  const [entries, matchRows] = await Promise.all([
    db()
      .from("season_players")
      .select("player:players(id, name, major, year, username)")
      .eq("season_id", chosen.id)
      .order("joined_at")
      .returns<{ player: LeaguePlayer }[]>()
      .then(ok),
    db().from("matches").select("*").eq("season_id", chosen.id).order("day").order("round").returns<MatchRow[]>().then(ok),
  ]);

  const players = entries.map((e) => e.player);
  const matches = matchRows.map(toMatch);
  return {
    seasons,
    season: toSeason(chosen),
    players,
    matches,
    standings: computeStandings(players, matches),
    me: { playerId: me?.id ?? null, joined: !!me && players.some((p) => p.id === me.id) },
  };
}

export async function joinSeason(viewer: Viewer, seasonId: string) {
  const me = await getPlayerByTelegramId(viewer.telegramId);
  if (!me) throw new UserError("Register first.");
  if (me.banned) throw new UserError("You can't join seasons right now. Contact the organizer.");
  ok(await db().rpc("join_season", { p_season: seasonId, p_player: me.id }));
}

export async function leaveSeason(viewer: Viewer, seasonId: string) {
  const me = await getPlayerByTelegramId(viewer.telegramId);
  if (!me) throw new UserError("Register first.");
  ok(await db().rpc("leave_season", { p_season: seasonId, p_player: me.id }));
}

// ─── Organizer ───────────────────────────────────────────────────────────────

export async function listPlayers(): Promise<AdminPlayer[]> {
  const rows = ok(await db().from("players").select("*").order("name").returns<PlayerRow[]>());
  return rows.map((p) => ({ ...toProfile(p), telegramId: p.telegram_id, createdAt: p.created_at }));
}

const id = z.uuid({ error: "Invalid id." });
const closesAt = z.iso.datetime({ offset: true, error: "Invalid date." }).nullable();
const score = z.number().int().min(0, "Scores can't be negative.").max(99).nullable();
const gamePoints = z.number().int().min(0, "Points can't be negative.").max(99, "That's too many points for one game.");
const gamesPerMatch = z.literal(GAMES_PER_MATCH, { error: "Choose 3, 5 or 7 games per match." });

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createSeason"), name: text("Season name"), closesAt, gamesPerMatch }),
  z.object({
    action: z.literal("updateSeason"),
    seasonId: id,
    name: text("Season name").optional(),
    registrationOpen: z.boolean().optional(),
    closesAt: closesAt.optional(),
    gamesPerMatch: gamesPerMatch.optional(),
  }),
  z.object({ action: z.literal("startSeason"), seasonId: id }),
  z.object({
    action: z.literal("addMatchDay"),
    seasonId: id,
    date: z.iso.date({ error: "Choose a date." }),
    playerIds: z.array(id).min(2, "Pick at least 2 players who are here."),
    mode: z.enum(["perPlayer", "total"]),
    count: z.number().int().min(1, "Plan at least 1 match.").max(MAX_MATCHES_PER_DAY),
    notify: z.boolean(),
  }),
  z.object({ action: z.literal("removeMatchDay"), seasonId: id, day: z.number().int().positive() }),
  z.object({ action: z.literal("setDayDate"), seasonId: id, day: z.number().int().positive(), date: z.iso.date({ error: "Choose a date." }), notify: z.boolean() }),
  z.object({ action: z.literal("notifyDay"), seasonId: id, day: z.number().int().positive() }),
  z.object({
    action: z.literal("moveMatch"),
    matchId: id,
    day: z.number().int().positive().nullable(),
    date: z.iso.date({ error: "Choose a date." }),
    notify: z.boolean(),
  }),
  z.object({ action: z.literal("finishSeason"), seasonId: id }),
  z.object({ action: z.literal("deleteSeason"), seasonId: id }),
  z.object({ action: z.literal("addToSeason"), seasonId: id, playerId: id }),
  z.object({ action: z.literal("removeFromSeason"), seasonId: id, playerId: id }),
  z.object({
    action: z.literal("setScore"),
    matchId: id,
    score1: score,
    score2: score,
    games: z.array(z.tuple([gamePoints, gamePoints])).nullable().optional(),
  }),
  z
    .object({ action: z.literal("updatePlayer"), playerId: id, name: text("Name"), major: majorSchema, year: yearSchema })
    .refine(sameDegree, degreeMismatch),
  z.object({ action: z.literal("setBanned"), playerId: id, banned: z.boolean() }),
]) satisfies z.ZodType<AdminAction>;

async function seasonRow(seasonId: string): Promise<SeasonRow> {
  const s = maybe(await db().from("seasons").select("*").eq("id", seasonId).maybeSingle<SeasonRow>());
  if (!s) throw new UserError("Season not found.");
  return s;
}

/** Everything needed to message the players of a day's unplayed matches. */
export async function dayNotice(seasonId: string, day: number, note?: string, onlyMatchId?: string): Promise<DayNotice> {
  const [season, matches] = await Promise.all([
    seasonRow(seasonId),
    db()
      .from("matches")
      .select("id, round, day_date, player1_id, player2_id")
      .eq("season_id", seasonId)
      .eq("day", day)
      .is("played_at", null)
      .order("round")
      .returns<{ id: string; round: number; day_date: string | null; player1_id: string; player2_id: string }[]>()
      .then(ok)
      .then((rows) => (onlyMatchId ? rows.filter((m) => m.id === onlyMatchId) : rows)),
  ]);
  const ids = [...new Set(matches.flatMap((m) => [m.player1_id, m.player2_id]))];
  const [who, organizer] = await Promise.all([peopleById(ids), organizerPerson()]);
  return {
    day,
    date: matches[0]?.day_date ?? new Date().toISOString().slice(0, 10),
    gamesPerMatch: season.games_per_match,
    matches: matches.map((m) => ({ round: m.round, player1: who.get(m.player1_id)!, player2: who.get(m.player2_id)! })),
    organizer,
    note,
  };
}

interface PersonRow {
  id: string;
  name: string;
  telegram_id: number;
  username: string | null;
}

const toPerson = (p: PersonRow): Person => ({ name: p.name, telegramId: p.telegram_id, username: p.username });

async function peopleById(ids: string[]): Promise<Map<string, Person>> {
  if (!ids.length) return new Map();
  const rows = ok(await db().from("players").select("id, name, telegram_id, username").in("id", ids).returns<PersonRow[]>());
  return new Map(rows.map((p) => [p.id, toPerson(p)]));
}

/** The organizer players are told to contact: an admin who has registered, preferably one with a username. */
async function organizerPerson(): Promise<Person | null> {
  const admins = [...adminTelegramIds()];
  if (!admins.length) return null;
  const rows = ok(await db().from("players").select("id, name, telegram_id, username").in("telegram_id", admins).returns<PersonRow[]>());
  const pick = rows.find((o) => o.username) ?? rows[0];
  return pick ? toPerson(pick) : null;
}

async function currentSeasonRow(): Promise<SeasonRow | null> {
  return maybe(await db().from("seasons").select("*").neq("status", "finished").limit(1).maybeSingle<SeasonRow>());
}

/** Today's calendar date (YYYY-MM-DD) in the league's time zone. */
export function leagueToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: env().LEAGUE_TIMEZONE });
}

async function unplayedMatches(seasonId: string) {
  return ok(
    await db()
      .from("matches")
      .select("day, day_date, round, player1_id, player2_id")
      .eq("season_id", seasonId)
      .is("played_at", null)
      .order("day")
      .order("round")
      .returns<{ day: number; day_date: string | null; round: number; player1_id: string; player2_id: string }[]>(),
  );
}

/** Morning reminders: everyone who plays today, plus anyone with an older match still unplayed. */
export async function sendDailyReminders(today = leagueToday()): Promise<{ sent: number; total: number }> {
  const season = await currentSeasonRow();
  if (!season || season.status !== "active") return { sent: 0, total: 0 };
  const due = (await unplayedMatches(season.id)).filter((m) => m.day_date && m.day_date <= today);
  const [who, organizer] = await Promise.all([peopleById([...new Set(due.flatMap((m) => [m.player1_id, m.player2_id]))]), organizerPerson()]);

  const perPlayer = new Map<string, { today: ReminderMatch[]; overdue: ReminderMatch[] }>();
  for (const m of due) {
    for (const [me, them] of [
      [m.player1_id, m.player2_id],
      [m.player2_id, m.player1_id],
    ]) {
      const entry = perPlayer.get(me) ?? { today: [], overdue: [] };
      (m.day_date === today ? entry.today : entry.overdue).push({ day: m.day, date: m.day_date!, opponent: who.get(them)! });
      perPlayer.set(me, entry);
    }
  }

  const button = appButton();
  let sent = 0;
  const jobs = [...perPlayer].map(([id, { today: t, overdue }]) => async () => {
    const me = who.get(id)!;
    await sendMessage(me.telegramId, reminderMessage(t, overdue, organizer, me), button);
  });
  for (let i = 0; i < jobs.length; i += 20) {
    const results = await Promise.allSettled(jobs.slice(i, i + 20).map((j) => j()));
    for (const r of results) {
      if (r.status === "fulfilled") sent++;
      else console.error("[reminders]", r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }
  return { sent, total: jobs.length };
}

function appButton() {
  const url = env().APP_URL;
  return url ? [[{ text: "🏓 Open League", web_app: { url } }]] : undefined;
}

async function seasonTable(seasonId: string) {
  const [entries, rows] = await Promise.all([
    db().from("season_players").select("player:players(id, name)").eq("season_id", seasonId).returns<{ player: { id: string; name: string } }[]>().then(ok),
    db().from("matches").select("*").eq("season_id", seasonId).returns<MatchRow[]>().then(ok),
  ]);
  const players = entries.map((e) => e.player);
  return { players, standings: computeStandings(players, rows.map(toMatch)) };
}

/** Tells both players a result was saved, with their points and table position. */
async function notifyResult(matchId: string, corrected: boolean) {
  const m = maybe(await db().from("matches").select("*").eq("id", matchId).maybeSingle<MatchRow>());
  if (!m || m.score1 === null || m.score2 === null) return;
  const [who, { standings }] = await Promise.all([peopleById([m.player1_id, m.player2_id]), seasonTable(m.season_id)]);
  const sides = [
    { me: m.player1_id, them: m.player2_id, mine: m.score1, theirs: m.score2, games: m.game_scores },
    { me: m.player2_id, them: m.player1_id, mine: m.score2, theirs: m.score1, games: m.game_scores?.map(([a, b]) => [b, a] as [number, number]) ?? null },
  ];
  await Promise.allSettled(
    sides.map(async (side) => {
      const me = who.get(side.me);
      const row = standings.find((r) => r.playerId === side.me);
      if (!me || !row) return;
      const text = resultMessage({
        day: m.day,
        date: m.day_date,
        corrected,
        me,
        opponent: who.get(side.them)!,
        myScore: side.mine,
        theirScore: side.theirs,
        games: side.games,
        position: row.position,
        points: row.points,
      });
      await sendMessage(me.telegramId, text, appButton()).catch((e) => console.error("[result]", e instanceof Error ? e.message : e));
    }),
  );
}

/** Reply to /next: the sender's unplayed matches in the current season. */
export async function botNext(telegramId: number): Promise<string> {
  const me = await getPlayerByTelegramId(telegramId);
  if (!me) return "You're not registered yet. Tap 🏓 Open League to sign up.";
  const season = await currentSeasonRow();
  if (!season) return "There's no season running right now.";
  const mine = (await unplayedMatches(season.id)).filter((m) => m.player1_id === me.id || m.player2_id === me.id);
  const [who, organizer] = await Promise.all([peopleById([...new Set(mine.flatMap((m) => [m.player1_id, m.player2_id]))]), organizerPerson()]);
  const upcoming = mine.map((m) => ({ day: m.day, date: m.day_date ?? leagueToday(), opponent: who.get(m.player1_id === me.id ? m.player2_id : m.player1_id)! }));
  return nextMessage(upcoming, organizer, { name: me.name, telegramId, username: me.username });
}

/** Reply to /table: the top 10, plus the sender's row if they're further down. */
export async function botTable(telegramId: number): Promise<string> {
  const season = await currentSeasonRow();
  if (!season) return "There's no season running right now.";
  const [{ players, standings }, me] = await Promise.all([seasonTable(season.id), getPlayerByTelegramId(telegramId)]);
  const names = new Map(players.map((p) => [p.id, p.name]));
  const line = (r: (typeof standings)[number]) => ({
    position: r.position,
    name: names.get(r.playerId) ?? "?",
    points: r.points,
    wins: r.wins,
    losses: r.losses,
    isMe: r.playerId === me?.id,
  });
  const mine = standings.find((r) => r.playerId === me?.id);
  return tableMessage(season.name, standings.slice(0, 10).map(line), mine ? line(mine) : null);
}

/** Messages the day's players after the response is sent, so the admin doesn't wait on Telegram. */
function notifyLater(seasonId: string, day: number, note?: string, onlyMatchId?: string) {
  if (!env().TELEGRAM_BOT_TOKEN) return;
  after(async () => {
    const notice = await dayNotice(seasonId, day, note, onlyMatchId);
    if (notice.matches.length) await notifyMatchDay(notice);
  });
}

export async function runAdminAction(input: unknown): Promise<void> {
  const a = parse(actionSchema, input);
  switch (a.action) {
    case "createSeason":
      ok(await db().from("seasons").insert({ name: a.name, registration_closes_at: a.closesAt, games_per_match: a.gamesPerMatch }));
      return;

    case "updateSeason": {
      const s = await seasonRow(a.seasonId);
      if ((a.registrationOpen !== undefined || a.closesAt !== undefined) && s.status === "finished") {
        throw new UserError("This season is finished.");
      }
      if (a.gamesPerMatch !== undefined && a.gamesPerMatch !== s.games_per_match) {
        const anyPlayed = maybe(
          await db().from("matches").select("id").eq("season_id", a.seasonId).not("played_at", "is", null).limit(1).maybeSingle<{ id: string }>(),
        );
        if (anyPlayed) throw new UserError("The match format can't change after results have been entered.");
      }
      const patch: Partial<SeasonRow> = {};
      if (a.name !== undefined) patch.name = a.name;
      if (a.registrationOpen !== undefined) patch.registration_open = a.registrationOpen;
      if (a.closesAt !== undefined) patch.registration_closes_at = a.closesAt;
      if (a.gamesPerMatch !== undefined) patch.games_per_match = a.gamesPerMatch;
      ok(await db().from("seasons").update(patch).eq("id", a.seasonId));
      return;
    }

    case "startSeason":
      ok(await db().rpc("start_season", { p_season: a.seasonId }));
      return;

    case "addMatchDay": {
      const [entries, history] = await Promise.all([
        db().from("season_players").select("player_id").eq("season_id", a.seasonId).returns<{ player_id: string }[]>().then(ok),
        db()
          .from("matches")
          .select("player1_id, player2_id, played_at")
          .eq("season_id", a.seasonId)
          .returns<{ player1_id: string; player2_id: string; played_at: string | null }[]>()
          .then(ok),
      ]);
      const inSeason = new Set(entries.map((e) => e.player_id));
      if (a.playerIds.some((p) => !inSeason.has(p))) throw new UserError("Some of those players aren't in this season.");
      if (a.mode === "perPlayer" && a.count > MAX_MATCHES_PER_PLAYER) throw new UserError(`At most ${MAX_MATCHES_PER_PLAYER} matches per player.`);
      const plan = planMatchDay(
        a.playerIds,
        a.mode === "perPlayer" ? { perPlayer: a.count } : { total: a.count },
        history.map((m) => ({ player1Id: m.player1_id, player2Id: m.player2_id, played: m.played_at !== null })),
      );
      const day = ok(await db().rpc("add_match_day", { p_season: a.seasonId, p_date: a.date, p_matches: plan })) as number;
      if (a.notify) notifyLater(a.seasonId, day);
      return;
    }

    case "setDayDate": {
      const rows = ok(await db().from("matches").update({ day_date: a.date }).eq("season_id", a.seasonId).eq("day", a.day).select("id"));
      if (!rows.length) throw new UserError("That day has no matches.");
      if (a.notify) notifyLater(a.seasonId, a.day, `Date changed: Day ${a.day} is now on ${dayLabel(a.date)}.`);
      return;
    }

    case "moveMatch": {
      const m = maybe(
        await db().from("matches").select("season_id, day, played_at").eq("id", a.matchId).maybeSingle<{ season_id: string; day: number; played_at: string | null }>(),
      );
      if (!m) throw new UserError("Match not found.");
      if (m.played_at) throw new UserError("Only matches without a result can be moved.");
      const all = ok(
        await db().from("matches").select("day, day_date, round").eq("season_id", m.season_id).returns<{ day: number; day_date: string | null; round: number }[]>(),
      );
      let day = a.day ?? Math.max(0, ...all.map((x) => x.day)) + 1;
      let date = a.date;
      if (a.day !== null) {
        const target = all.filter((x) => x.day === a.day);
        if (!target.length) throw new UserError("That day doesn't exist.");
        if (a.day === m.day) throw new UserError("The match is already on that day.");
        date = target[0].day_date ?? a.date;
        day = a.day;
      }
      const round = Math.max(0, ...all.filter((x) => x.day === day).map((x) => x.round)) + 1;
      ok(await db().from("matches").update({ day, day_date: date, round }).eq("id", a.matchId).is("played_at", null));
      if (a.notify) notifyLater(m.season_id, day, `Your match was moved to Day ${day} · ${dayLabel(date)}.`, a.matchId);
      return;
    }

    case "notifyDay": {
      if (!env().TELEGRAM_BOT_TOKEN) throw new UserError("The bot isn't configured, so messages can't be sent.");
      const notice = await dayNotice(a.seasonId, a.day);
      if (!notice.matches.length) throw new UserError("That day has no unplayed matches to tell anyone about.");
      after(() => notifyMatchDay(notice));
      return;
    }

    case "removeMatchDay": {
      const rows = ok(
        await db().from("matches").delete().eq("season_id", a.seasonId).eq("day", a.day).is("played_at", null).select("id"),
      );
      if (!rows.length) throw new UserError("That day has no unplayed matches to remove.");
      return;
    }

    case "finishSeason": {
      const rows = ok(
        await db()
          .from("seasons")
          .update({ status: "finished", finished_at: new Date().toISOString() })
          .eq("id", a.seasonId)
          .eq("status", "active")
          .select("id"),
      );
      if (!rows.length) throw new UserError("Only a running season can be finished.");
      return;
    }

    case "deleteSeason":
      ok(await db().from("seasons").delete().eq("id", a.seasonId));
      return;

    case "addToSeason":
      ok(await db().rpc("join_season", { p_season: a.seasonId, p_player: a.playerId, p_force: true }));
      return;

    case "removeFromSeason":
      // Cascades to the player's matches in this season.
      ok(await db().from("season_players").delete().eq("season_id", a.seasonId).eq("player_id", a.playerId));
      return;

    case "setScore": {
      let { score1, score2 } = a;
      const games = a.games?.length ? a.games : null;
      if (games) {
        const fromGames = scoreFromGames(games);
        if (!fromGames) throw new UserError("A game can't end in a draw: check the game scores.");
        [score1, score2] = fromGames;
      }
      if ((score1 === null) !== (score2 === null)) throw new UserError("Enter both scores, or clear both.");
      if (score1 !== null && score1 === score2) throw new UserError("Scores can't be equal: someone has to win.");
      if (score1 !== null && score2 !== null) {
        const m = maybe(
          await db().from("matches").select("season:seasons(games_per_match)").eq("id", a.matchId).maybeSingle<{ season: { games_per_match: number } }>(),
        );
        if (!m) throw new UserError("Match not found.");
        const n = m.season.games_per_match;
        if (games && games.length !== n) throw new UserError(`Enter the points for all ${n} games.`);
        if (!isValidScore(n, score1, score2)) {
          throw new UserError(`Each match is ${n} games, so the two scores must add up to ${n} (e.g. ${n - 1}–1).`);
        }
      }
      const played = score1 !== null;
      const before = maybe(await db().from("matches").select("played_at").eq("id", a.matchId).maybeSingle<{ played_at: string | null }>());
      const rows = ok(
        await db()
          .from("matches")
          .update({ score1, score2, game_scores: played ? games : null, played_at: played ? new Date().toISOString() : null })
          .eq("id", a.matchId)
          .select("id"),
      );
      if (!rows.length) throw new UserError("Match not found.");
      if (played && env().TELEGRAM_BOT_TOKEN) after(() => notifyResult(a.matchId, !!before?.played_at));
      return;
    }

    case "updatePlayer":
      ok(await db().from("players").update({ name: a.name, major: a.major, year: a.year }).eq("id", a.playerId));
      return;

    case "setBanned": {
      ok(await db().from("players").update({ banned: a.banned }).eq("id", a.playerId));
      if (a.banned) {
        // A banned player also drops out of any season that hasn't started yet.
        const open = ok(await db().from("seasons").select("id").eq("status", "registration").returns<{ id: string }[]>());
        if (open.length) {
          ok(await db().from("season_players").delete().eq("player_id", a.playerId).in("season_id", open.map((s) => s.id)));
        }
      }
      return;
    }
  }
}
