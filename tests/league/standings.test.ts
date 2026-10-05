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
  games: null,
  playedAt: s1 === null ? null : new Date(2026, 0, 1, 0, n).toISOString(),
});
const order = (matches: Match[]) => computeStandings(players, matches).map((r) => r.playerId);

describe("computeStandings", () => {
  it("counts played, wins, losses, score and form", () => {
    const rows = computeStandings(players, [m("a", "b", 2, 1), m("c", "a", 3, 0), m("a", "d")]);
    const a = rows.find((r) => r.playerId === "a")!;
    expect(a).toMatchObject({ played: 2, wins: 1, losses: 1, points: 2, scoreFor: 2, scoreAgainst: 4, form: ["L", "W"] });
    expect(rows.find((r) => r.playerId === "d")).toMatchObject({ played: 0, wins: 0, losses: 0, points: 0 });
  });

  it("gives one point per game won: 3–0 is 3 points, 2–1 is 2 and 1", () => {
    const rows = computeStandings(players, [m("a", "b", 3, 0), m("c", "d", 2, 1)]);
    const pts = (id: string) => rows.find((r) => r.playerId === id)!.points;
    expect([pts("a"), pts("b"), pts("c"), pts("d")]).toEqual([3, 0, 2, 1]);
    expect(rows.map((r) => r.playerId)).toEqual(["a", "c", "d", "b"]);
  });

  it("adds points up over all matches", () => {
    const rows = computeStandings(players, [m("a", "b", 2, 1), m("a", "c", 1, 2), m("a", "d", 3, 0)]);
    expect(rows.find((r) => r.playerId === "a")!.points).toBe(6);
  });

  it("breaks a tie on points by the match between the tied players", () => {
    // Alice and Bob both end on 3 points with 1 win each; Bob beat Alice 2–1, so Bob is above
    // her even though "Alice" sorts first by name.
    const rows = computeStandings(players, [m("b", "a", 2, 1), m("a", "c", 2, 1), m("b", "d", 1, 2)]);
    expect(rows.find((r) => r.playerId === "a")!.points).toBe(3);
    expect(rows.find((r) => r.playerId === "b")!.points).toBe(3);
    const ids = rows.map((r) => r.playerId);
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("a"));
  });

  it("then by matches won, then games difference", () => {
    // Alice and Dan both have 3 points and never met. Alice won 1 of 2 matches (2–1, 1–2),
    // Dan won 1 of 1 (3–0): equal wins, Dan's difference is better.
    const rows = order([m("a", "b", 2, 1), m("c", "a", 2, 1), m("d", "b", 3, 0)]);
    expect(rows.indexOf("d")).toBeLessThan(rows.indexOf("a"));
  });

  it("is stable by name when everything is equal", () => {
    expect(order([])).toEqual(["a", "b", "c", "d"]);
  });

  it("assigns positions 1..n", () => {
    expect(computeStandings(players, []).map((r) => r.position)).toEqual([1, 2, 3, 4]);
  });
});
