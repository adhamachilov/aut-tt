import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { roundRobin } from "@/lib/league/schedule";

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
const start = (s: string, ids: string[]) => db.query("select public.start_season($1, $2::jsonb)", [s, JSON.stringify(roundRobin(ids))]);
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
  it("defaults to best of 5 and only allows 3, 5 or 7", async () => {
    const s = await season();
    expect((await db.query<{ best_of: number }>("select best_of from public.seasons where id = $1", [s])).rows[0].best_of).toBe(5);
    await db.query("update public.seasons set best_of = 7 where id = $1", [s]);
    expect(await fails(db.query("update public.seasons set best_of = 4 where id = $1", [s]))).toMatch(/check/);
  });
});

describe("starting a season", () => {
  it("creates a full round robin and closes registration", async () => {
    const s = await season();
    const ids = [await player(), await player(), await player(), await player(), await player()];
    for (const p of ids) await join(s, p);
    await start(s, ids);

    expect(await count("from public.matches where season_id = $1", [s])).toBe(10);
    const { rows } = await db.query<{ status: string; registration_open: boolean }>("select status, registration_open from public.seasons where id = $1", [s]);
    expect(rows[0]).toEqual({ status: "active", registration_open: false });

    const late = await player();
    expect(await fails(join(s, late, true))).toBe("registration_closed");
    expect(await fails(db.query("select public.leave_season($1, $2)", [s, ids[0]]))).toBe("season_already_started");
    expect(await fails(start(s, ids))).toBe("season_already_started");
  });

  it("rejects incomplete schedules and non-participants, saving nothing", async () => {
    const s = await season();
    const [a, b, c] = [await player(), await player(), await player()];
    await join(s, a);
    await join(s, b);
    await join(s, c);
    const partial = roundRobin([a, b, c]).slice(1);
    expect(await fails(db.query("select public.start_season($1, $2::jsonb)", [s, JSON.stringify(partial)]))).toBe("schedule_mismatch");
    const outsider = await player();
    expect(await fails(start(s, [a, b, outsider]))).toMatch(/foreign key/);
    expect(await count("from public.matches")).toBe(0);
  });

  it("needs at least 2 players", async () => {
    const s = await season();
    const p = await player();
    await join(s, p);
    expect(await fails(db.query("select public.start_season($1, '[]'::jsonb)", [s]))).toBe("not_enough_players");
  });
});

describe("results and removals", () => {
  async function running(n: number) {
    const s = await season();
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      ids.push(await player());
      await join(s, ids[i]);
    }
    await start(s, ids);
    return { s, ids };
  }

  it("rejects equal, negative or half-entered scores", async () => {
    const { s } = await running(2);
    const id = (await db.query<{ id: string }>("select id from public.matches where season_id = $1", [s])).rows[0].id;
    const set = (a: number | null, b: number | null) =>
      db.query("update public.matches set score1 = $2::smallint, score2 = $3::smallint, played_at = case when $2::smallint is null then null else now() end where id = $1", [id, a, b]);
    expect(await fails(set(2, 2))).toMatch(/check/);
    expect(await fails(set(-1, 3))).toMatch(/check/);
    expect(await fails(db.query("update public.matches set score1 = 3, played_at = now() where id = $1", [id]))).toMatch(/check/);
    await set(3, 1);
    await set(null, null);
  });

  it("removing a player from a season deletes their matches", async () => {
    const { s, ids } = await running(4);
    await db.query("delete from public.season_players where season_id = $1 and player_id = $2", [s, ids[0]]);
    expect(await count("from public.matches where season_id = $1", [s])).toBe(3);
    expect(await count("from public.matches where $1 in (player1_id, player2_id)", [ids[0]])).toBe(0);
  });

  it("deleting a season deletes everything in it", async () => {
    const { s } = await running(3);
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
