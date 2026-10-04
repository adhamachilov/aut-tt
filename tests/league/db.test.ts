import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { planMatchDay } from "@/lib/league/matchday";

// Runs the real migration in an in-process Postgres and exercises its rules directly.

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
`;

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");

let db: PGlite;
let tg = 1000;

async function player(name = "Player", banned = false): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.players (telegram_id, name, major, year, banned) values ($1, $2, 'CS', '2', $3) returning id",
    [++tg, name, banned],
  );
  return rows[0].id;
}

async function season(column?: string, valueSql?: string): Promise<string> {
  const sql = column
    ? `insert into public.seasons (name, ${column}) values ('Autumn', ${valueSql}) returning id`
    : "insert into public.seasons (name) values ('Autumn') returning id";
  return (await db.query<{ id: string }>(sql)).rows[0].id;
}

const join = (s: string, p: string, force = false) => db.query("select public.join_season($1, $2, $3)", [s, p, force]);
const start = (s: string) => db.query("select public.start_season($1)", [s]);
const addDay = async (s: string, ids: string[], perPlayer: number, date = "2026-10-05") =>
  (await db.query<{ day: number }>("select public.add_match_day($1, $2::date, $3::jsonb) as day", [s, date, JSON.stringify(planMatchDay(ids, perPlayer, []))])).rows[0].day;
const count = async (sql: string, params: unknown[] = []) => (await db.query<{ n: number }>(`select count(*)::int as n ${sql}`, params)).rows[0].n;

async function fails(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected failure");
}

beforeEach(async () => {
  db = await PGlite.create();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, f), "utf8"));
  }
});

describe("registration", () => {
  it("lets players join an open season, once", async () => {
    const s = await season();
    const p = await player();
    await join(s, p);
    await join(s, p);
    expect(await count("from public.season_players where season_id = $1", [s])).toBe(1);
  });

  it("rejects joining when registration is closed or the deadline passed, unless the organizer adds them", async () => {
    const closed = await season("registration_open", "false");
    const p = await player();
    expect(await fails(join(closed, p))).toBe("registration_closed");
    await join(closed, p, true);

    await db.query("update public.seasons set status = 'finished'");
    const late = await season("registration_closes_at", "now() - interval '1 minute'");
    expect(await fails(join(late, p))).toBe("registration_closed");
  });

  it("rejects banned players", async () => {
    const s = await season();
    expect(await fails(join(s, await player("Banned", true), true))).toBe("player_banned");
  });

  it("allows only one current season", async () => {
    await season();
    expect(await fails(season())).toMatch(/seasons_one_current/);
  });
});

describe("match format", () => {
  it("defaults to 3 games per match and only allows 3, 5 or 7", async () => {
    const s = await season();
    expect((await db.query<{ games_per_match: number }>("select games_per_match from public.seasons where id = $1", [s])).rows[0].games_per_match).toBe(3);
    await db.query("update public.seasons set games_per_match = 7 where id = $1", [s]);
    expect(await fails(db.query("update public.seasons set games_per_match = 4 where id = $1", [s]))).toMatch(/check/);
  });
});

describe("starting a season", () => {
  it("closes registration without creating matches", async () => {
    const s = await season();
    const ids = [await player(), await player(), await player()];
    for (const p of ids) await join(s, p);
    await start(s);

    expect(await count("from public.matches where season_id = $1", [s])).toBe(0);
    const { rows } = await db.query<{ status: string; registration_open: boolean }>("select status, registration_open from public.seasons where id = $1", [s]);
    expect(rows[0]).toEqual({ status: "active", registration_open: false });
    expect(await fails(db.query("select public.leave_season($1, $2)", [s, ids[0]]))).toBe("season_already_started");
    expect(await fails(start(s))).toBe("season_already_started");
  });

  it("needs at least 2 players", async () => {
    const s = await season();
    await join(s, await player());
    expect(await fails(start(s))).toBe("not_enough_players");
  });

  it("only the organizer can add players once it's running, and nobody after it's finished", async () => {
    const s = await season();
    const [a, b] = [await player(), await player()];
    await join(s, a);
    await join(s, b);
    await start(s);
    const late = await player();
    expect(await fails(join(s, late))).toBe("registration_closed");
    await join(s, late, true);
    expect(await count("from public.season_players where season_id = $1", [s])).toBe(3);
    await db.query("update public.seasons set status = 'finished' where id = $1", [s]);
    expect(await fails(join(s, await player(), true))).toBe("season_finished");
  });
});

describe("match days", () => {
  async function running(n: number) {
    const s = await season();
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      ids.push(await player());
      await join(s, ids[i]);
    }
    await start(s);
    return { s, ids };
  }

  it("numbers days in order and allows players to meet again", async () => {
    const { s, ids } = await running(3);
    expect(await addDay(s, ids, 3)).toBe(1);
    expect(await addDay(s, ids, 2, "2026-10-06")).toBe(2);
    expect(await count("from public.matches where season_id = $1 and day = 1", [s])).toBe(4);
    expect(await count("from public.matches where season_id = $1 and day = 2", [s])).toBe(3);
    const { rows } = await db.query<{ d: string }>("select distinct day_date::text as d from public.matches where day = 2");
    expect(rows).toEqual([{ d: "2026-10-06" }]);
  });

  it("can only add days to a running season, with players who are in it", async () => {
    const s = await season();
    const [a, b] = [await player(), await player()];
    await join(s, a);
    await join(s, b);
    expect(await fails(addDay(s, [a, b], 1))).toBe("season_not_active");
    await start(s);
    expect(await fails(addDay(s, [a, await player()], 1))).toMatch(/foreign key/);
    expect(await fails(db.query("select public.add_match_day($1, '2026-10-05', '[]'::jsonb)", [s]))).toBe("empty_match_day");
    expect(await count("from public.matches")).toBe(0);
  });

  it("rejects equal, negative or half-entered scores", async () => {
    const { s, ids } = await running(2);
    await addDay(s, ids, 1);
    const id = (await db.query<{ id: string }>("select id from public.matches where season_id = $1", [s])).rows[0].id;
    const set = (a: number | null, b: number | null) =>
      db.query("update public.matches set score1 = $2::smallint, score2 = $3::smallint, played_at = case when $2::smallint is null then null else now() end where id = $1", [id, a, b]);
    expect(await fails(set(2, 2))).toMatch(/check/);
    expect(await fails(set(-1, 3))).toMatch(/check/);
    expect(await fails(db.query("update public.matches set score1 = 3, played_at = now() where id = $1", [id]))).toMatch(/check/);
    await set(2, 1);
    await set(null, null);
  });

  it("removing a player from a season deletes their matches", async () => {
    const { s, ids } = await running(4);
    await addDay(s, ids, 3);
    await db.query("delete from public.season_players where season_id = $1 and player_id = $2", [s, ids[0]]);
    expect(await count("from public.matches where season_id = $1", [s])).toBe(3);
    expect(await count("from public.matches where $1 in (player1_id, player2_id)", [ids[0]])).toBe(0);
  });

  it("deleting a season deletes everything in it", async () => {
    const { s, ids } = await running(3);
    await addDay(s, ids, 2);
    await db.query("delete from public.seasons where id = $1", [s]);
    expect(await count("from public.matches")).toBe(0);
    expect(await count("from public.season_players")).toBe(0);
  });
});

describe("access", () => {
  it("browsers (anon/authenticated) can't read or call anything", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      expect(await fails(db.query("select * from public.players"))).toMatch(/permission denied/);
      expect(await fails(db.query("select public.join_season(gen_random_uuid(), gen_random_uuid())"))).toMatch(/permission denied/);
      await db.exec("reset role");
    }
  });
});
