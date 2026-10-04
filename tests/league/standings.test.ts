import { describe, expect, it } from "vitest";
import { computeStandings } from "@/lib/league/standings";
import type { Match } from "@/lib/league/types";

const players = ["Alice", "Bob", "Cara", "Dan"].map((name) => ({ id: name[0].toLowerCase(), name }));
let n = 0;
const m = (p1: string, p2: string, s1: number | null = null, s2: number | null = null): Match => ({
  id: `m${++n}`,
  day: 1,
  dayDate: null,
  round: 1,
  player1Id: p1,
  player2Id: p2,
  score1: s1,
  score2: s2,
  playedAt: s1 === null ? null : new Date(2026, 0, 1, 0, n).toISOString(),
});
const order = (matches: Match[]) => computeStandings(players, matches).map((r) => r.playerId);

describe("computeStandings", () => {
  it("counts played, wins, losses, score and form", () => {
    const rows = computeStandings(players, [m("a", "b", 3, 1), m("c", "a", 3, 0), m("a", "d")]);
    const a = rows.find((r) => r.playerId === "a")!;
    expect(a).toMatchObject({ played: 2, wins: 1, losses: 1, points: 1, scoreFor: 3, scoreAgainst: 4, form: ["L", "W"] });
    expect(rows.find((r) => r.playerId === "d")).toMatchObject({ played: 0, wins: 0, losses: 0, points: 0 });
  });

  it("gives 1 point for a win and 0 for a loss", () => {
    const rows = computeStandings(players, [m("a", "c", 3, 0), m("d", "a", 3, 1), m("a", "b", 3, 2)]);
    expect(rows.find((r) => r.playerId === "a")!.points).toBe(2);
    expect(rows.find((r) => r.playerId === "d")!.points).toBe(1);
    expect(rows.find((r) => r.playerId === "b")!.points).toBe(0);
  });

  it("ranks by points first", () => {
    expect(order([m("b", "a", 3, 0), m("b", "c", 3, 0), m("c", "d", 3, 2)])[0]).toBe("b");
  });

  it("breaks a two-way tie by the match between them, even against score difference", () => {
    // Alice and Bob both have 1 win; Bob has the better difference, but Alice beat Bob.
    const rows = order([m("a", "b", 3, 2), m("b", "c", 3, 0), m("c", "a", 3, 0), m("d", "c", 0, 3)]);
    expect(rows.indexOf("a")).toBeLessThan(rows.indexOf("b"));
  });

  it("falls back to score difference when head-to-head can't separate (three-way cycle)", () => {
    // Everyone has 1 win and 1 head-to-head win. Differences: Alice +2, Bob 0, Cara -2.
    const rows = order([m("a", "b", 3, 0), m("b", "c", 3, 0), m("c", "a", 3, 2)]);
    expect(rows.slice(0, 3)).toEqual(["a", "b", "c"]);
  });

  it("is stable by name when everything is equal", () => {
    expect(order([])).toEqual(["a", "b", "c", "d"]);
  });

  it("assigns positions 1..n", () => {
    expect(computeStandings(players, []).map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });
});
