import { describe, expect, it } from "vitest";
import { planMatchDay, type PlannedMatch } from "@/lib/league/matchday";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const counts = (plan: readonly PlannedMatch[], players: string[] = []) => {
  const c = new Map<string, number>(players.map((p) => [p, 0]));
  for (const m of plan) for (const p of [m.player1, m.player2]) c.set(p, (c.get(p) ?? 0) + 1);
  return c;
};
const pairs = (plan: readonly PlannedMatch[]) => plan.map((m) => [m.player1, m.player2].sort().join("-"));
const asHistory = (plan: readonly PlannedMatch[]) => plan.map((m) => ({ player1Id: m.player1, player2Id: m.player2 }));

/** Plays `days` days in a row, feeding each day's matches into the next. */
function season(players: string[], days: number, target: Parameters<typeof planMatchDay>[1]) {
  const all: PlannedMatch[] = [];
  const perDay: PlannedMatch[][] = [];
  for (let d = 0; d < days; d++) {
    const day = planMatchDay(players, target, asHistory(all));
    perDay.push(day);
    all.push(...day);
  }
  return { all, perDay };
}

describe("planMatchDay: matches per player", () => {
  it("gives everyone the requested number of matches", () => {
    for (let n = 2; n <= 16; n++) {
      for (let k = 1; k <= 5; k++) {
        const plan = planMatchDay(ids(n), { perPlayer: k }, []);
        expect(plan).toHaveLength(Math.floor((n * k) / 2));
        const c = [...counts(plan).values()];
        expect(c.filter((x) => x === k).length).toBeGreaterThanOrEqual(n - 1);
        expect(c.every((x) => x === k || x === k - 1)).toBe(true);
        expect(plan.every((m) => m.player1 !== m.player2)).toBe(true);
      }
    }
  });

  it("3 players, 3 matches each: 4 matches, one player gets 2", () => {
    const plan = planMatchDay(ids(3), { perPlayer: 3 }, []);
    expect(plan).toHaveLength(4);
    expect([...counts(plan).values()].sort()).toEqual([2, 3, 3]);
  });

  it("doesn't repeat an opponent while there are new ones, across days", () => {
    // 8 players have 28 possible pairings: 2 days of 3 matches each use 24 of them.
    const { all } = season(ids(8), 2, { perPlayer: 3 });
    expect(new Set(pairs(all)).size).toBe(all.length);
  });
});

describe("planMatchDay: total matches per day", () => {
  it("20 players, 2 matches a day: nobody plays twice until everyone has played", () => {
    const players = ids(20);
    const { all, perDay } = season(players, 5, { total: 2 });
    expect(perDay.every((d) => d.length === 2)).toBe(true);
    expect([...counts(all, players).values()].every((c) => c === 1)).toBe(true);
    const next = season(players, 10, { total: 2 }).all;
    expect([...counts(next, players).values()].every((c) => c === 2)).toBe(true);
    expect(new Set(pairs(next)).size).toBe(next.length);
  });

  it("5 players, 1 match a day: 10 days play every possible pairing exactly once", () => {
    const players = ids(5);
    const { all } = season(players, 10, { total: 1 });
    expect(new Set(pairs(all)).size).toBe(10);
    expect([...counts(all, players).values()].every((c) => c === 4)).toBe(true);
  });

  it("keeps match counts within 1 of each other over a long season", () => {
    const players = ids(7);
    const { all } = season(players, 25, { total: 3 });
    const c = [...counts(all, players).values()];
    expect(Math.max(...c) - Math.min(...c)).toBeLessThanOrEqual(1);
  });

  it("favours whoever has played least when someone joins late", () => {
    const early = ids(4);
    const { all } = season(early, 3, { total: 2 });
    const day = planMatchDay([...early, "late"], { total: 1 }, asHistory(all));
    expect([day[0].player1, day[0].player2]).toContain("late");
  });
});

describe("planMatchDay: basics", () => {
  it("numbers matches in order of play and avoids back-to-back games when possible", () => {
    const plan = planMatchDay(ids(8), { perPlayer: 2 }, []);
    expect(plan.map((m) => m.round)).toEqual(plan.map((_, i) => i + 1));
    for (let i = 1; i < plan.length; i++) {
      const prev = [plan[i - 1].player1, plan[i - 1].player2];
      expect(prev.includes(plan[i].player1) || prev.includes(plan[i].player2)).toBe(false);
    }
  });

  it("only uses the players who are here", () => {
    const plan = planMatchDay(["a", "b", "c", "a"], { perPlayer: 2 }, []);
    expect([...counts(plan).keys()].sort()).toEqual(["a", "b", "c"]);
  });

  it("needs at least 2 players and 1 match", () => {
    expect(() => planMatchDay(["a"], { perPlayer: 1 }, [])).toThrow();
    expect(() => planMatchDay(["a", "b"], { perPlayer: 0 }, [])).toThrow();
    expect(() => planMatchDay(["a", "b"], { total: 0 }, [])).toThrow();
  });
});
