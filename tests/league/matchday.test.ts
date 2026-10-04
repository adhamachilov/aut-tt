import { describe, expect, it } from "vitest";
import { planMatchDay, type PlannedMatch } from "@/lib/league/matchday";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const counts = (plan: PlannedMatch[]) => {
  const c = new Map<string, number>();
  for (const m of plan) for (const p of [m.player1, m.player2]) c.set(p, (c.get(p) ?? 0) + 1);
  return c;
};
const pairs = (plan: PlannedMatch[]) => plan.map((m) => [m.player1, m.player2].sort().join("-"));
const history = (plan: PlannedMatch[]) => plan.map((m) => ({ player1Id: m.player1, player2Id: m.player2 }));

describe("planMatchDay", () => {
  it("gives everyone the requested number of matches", () => {
    for (let n = 2; n <= 16; n++) {
      for (let k = 1; k <= 5; k++) {
        const plan = planMatchDay(ids(n), k, []);
        expect(plan).toHaveLength(Math.floor((n * k) / 2));
        const c = [...counts(plan).values()];
        expect(c.filter((x) => x === k).length).toBeGreaterThanOrEqual(n - 1);
        expect(c.every((x) => x === k || x === k - 1)).toBe(true);
        expect(plan.every((m) => m.player1 !== m.player2)).toBe(true);
      }
    }
  });

  it("3 players, 3 matches each: 4 matches, one player gets 2", () => {
    const plan = planMatchDay(ids(3), 3, []);
    expect(plan).toHaveLength(4);
    expect([...counts(plan).values()].sort()).toEqual([2, 3, 3]);
  });

  it("doesn't repeat an opponent while there are new ones", () => {
    const plan = planMatchDay(ids(6), 5, []);
    expect(new Set(pairs(plan)).size).toBe(15);
  });

  it("prefers opponents players haven't met on earlier days", () => {
    const day1 = planMatchDay(ids(8), 3, []);
    const day2 = planMatchDay(ids(8), 3, history(day1));
    const before = new Set(pairs(day1));
    expect(pairs(day2).filter((p) => before.has(p))).toEqual([]);
  });

  it("numbers matches in order of play and avoids back-to-back games when possible", () => {
    const plan = planMatchDay(ids(8), 2, []);
    expect(plan.map((m) => m.round)).toEqual(plan.map((_, i) => i + 1));
    for (let i = 1; i < plan.length; i++) {
      const prev = [plan[i - 1].player1, plan[i - 1].player2];
      expect(prev.includes(plan[i].player1) || prev.includes(plan[i].player2)).toBe(false);
    }
  });

  it("only uses the players who are here", () => {
    const plan = planMatchDay(["a", "b", "c", "a"], 2, []);
    expect([...counts(plan).keys()].sort()).toEqual(["a", "b", "c"]);
  });

  it("needs at least 2 players and 1 match each", () => {
    expect(() => planMatchDay(["a"], 1, [])).toThrow();
    expect(() => planMatchDay(["a", "b"], 0, [])).toThrow();
  });
});
