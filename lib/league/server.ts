import "server-only";
import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { env, majorOptions } from "@/lib/env";
import { UserError } from "./http";
import { BEST_OF, gamesToWin, isValidScore } from "./rules";
import { roundRobin } from "./schedule";
import { computeStandings } from "./standings";
import {
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
  best_of: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface MatchRow {
  id: string;
  season_id: string;
  round: number;
  player1_id: string;
  player2_id: string;
  score1: number | null;
  score2: number | null;
  played_at: string | null;
}

const MESSAGES: Record<string, string> = {
  registration_closed: "Registration for this season is closed.",
  player_banned: "This player is banned from joining seasons.",
  season_already_started: "This season has already started.",
  not_enough_players: "At least 2 players must join before the season can start.",
  season_not_found: "Season not found.",
  player_not_found: "Player not found. Register first.",
  schedule_mismatch: "Couldn't build the schedule. Please try again.",
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
  bestOf: s.best_of,
  acceptingPlayers:
    s.status === "registration" && s.registration_open && (!s.registration_closes_at || new Date(s.registration_closes_at) > now),
  startedAt: s.started_at,
  finishedAt: s.finished_at,
});

const toMatch = (m: MatchRow): Match => ({
  id: m.id,
  round: m.round,
  player1Id: m.player1_id,
  player2Id: m.player2_id,
  score1: m.score1,
  score2: m.score2,
  playedAt: m.played_at,
});

// ─── Players ─────────────────────────────────────────────────────────────────

const text = (label: string) => z.string().trim().min(2, `${label} is too short.`).max(60, `${label} is too long.`);
const yearSchema = z.enum(YEARS.map((y) => y.value) as [Year, ...Year[]], { error: "Choose your year." });
const profileSchema = z.object({ name: text("Name"), major: text("Major"), year: yearSchema });

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
  const majors = majorOptions();
  if (majors.length && !majors.includes(p.major)) throw new UserError("Choose your major from the list.");
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
    db().from("matches").select("*").eq("season_id", chosen.id).order("round").returns<MatchRow[]>().then(ok),
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
const bestOf = z.literal(BEST_OF, { error: "Choose best of 3, 5 or 7." });

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createSeason"), name: text("Season name"), closesAt, bestOf }),
  z.object({
    action: z.literal("updateSeason"),
    seasonId: id,
    name: text("Season name").optional(),
    registrationOpen: z.boolean().optional(),
    closesAt: closesAt.optional(),
    bestOf: bestOf.optional(),
  }),
  z.object({ action: z.literal("startSeason"), seasonId: id }),
  z.object({ action: z.literal("finishSeason"), seasonId: id }),
  z.object({ action: z.literal("deleteSeason"), seasonId: id }),
  z.object({ action: z.literal("addToSeason"), seasonId: id, playerId: id }),
  z.object({ action: z.literal("removeFromSeason"), seasonId: id, playerId: id }),
  z.object({ action: z.literal("setScore"), matchId: id, score1: score, score2: score }),
  z.object({ action: z.literal("updatePlayer"), playerId: id, name: text("Name"), major: text("Major"), year: yearSchema }),
  z.object({ action: z.literal("setBanned"), playerId: id, banned: z.boolean() }),
]) satisfies z.ZodType<AdminAction>;

async function seasonRow(seasonId: string): Promise<SeasonRow> {
  const s = maybe(await db().from("seasons").select("*").eq("id", seasonId).maybeSingle<SeasonRow>());
  if (!s) throw new UserError("Season not found.");
  return s;
}

export async function runAdminAction(input: unknown): Promise<void> {
  const a = parse(actionSchema, input);
  switch (a.action) {
    case "createSeason":
      ok(await db().from("seasons").insert({ name: a.name, registration_closes_at: a.closesAt, best_of: a.bestOf }));
      return;

    case "updateSeason": {
      const s = await seasonRow(a.seasonId);
      if ((a.registrationOpen !== undefined || a.closesAt !== undefined) && s.status !== "registration") {
        throw new UserError("Registration can only be changed before the season starts.");
      }
      if (a.bestOf !== undefined && a.bestOf !== s.best_of) {
        const anyPlayed = maybe(
          await db().from("matches").select("id").eq("season_id", a.seasonId).not("played_at", "is", null).limit(1).maybeSingle<{ id: string }>(),
        );
        if (anyPlayed) throw new UserError("The match format can't change after results have been entered.");
      }
      const patch: Partial<SeasonRow> = {};
      if (a.name !== undefined) patch.name = a.name;
      if (a.registrationOpen !== undefined) patch.registration_open = a.registrationOpen;
      if (a.closesAt !== undefined) patch.registration_closes_at = a.closesAt;
      if (a.bestOf !== undefined) patch.best_of = a.bestOf;
      ok(await db().from("seasons").update(patch).eq("id", a.seasonId));
      return;
    }

    case "startSeason": {
      const entries = ok(await db().from("season_players").select("player_id").eq("season_id", a.seasonId).returns<{ player_id: string }[]>());
      if (entries.length < 2) throw new UserError(MESSAGES.not_enough_players);
      const schedule = roundRobin(entries.map((e) => e.player_id));
      ok(await db().rpc("start_season", { p_season: a.seasonId, p_matches: schedule }));
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
      if ((a.score1 === null) !== (a.score2 === null)) throw new UserError("Enter both scores, or clear both.");
      if (a.score1 !== null && a.score1 === a.score2) throw new UserError("Scores can't be equal: someone has to win.");
      if (a.score1 !== null && a.score2 !== null) {
        const m = maybe(
          await db().from("matches").select("season:seasons(best_of)").eq("id", a.matchId).maybeSingle<{ season: { best_of: number } }>(),
        );
        if (!m) throw new UserError("Match not found.");
        const bo = m.season.best_of;
        if (!isValidScore(bo, a.score1, a.score2)) {
          throw new UserError(`Best of ${bo}: the winner needs exactly ${gamesToWin(bo)} games and the loser fewer (e.g. ${gamesToWin(bo)}–1).`);
        }
      }
      const played = a.score1 !== null;
      const rows = ok(
        await db()
          .from("matches")
          .update({ score1: a.score1, score2: a.score2, played_at: played ? new Date().toISOString() : null })
          .eq("id", a.matchId)
          .select("id"),
      );
      if (!rows.length) throw new UserError("Match not found.");
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
