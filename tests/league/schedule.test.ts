import { describe, expect, it } from "vitest";
import { roundRobin } from "@/lib/league/schedule";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i).padStart(2, "0")}`);
const key = (a: string, b: string) => [a, b].sort().join("|");

describe("roundRobin", () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 11, 16, 25])("%i players: everyone meets everyone exactly once", (n) => {
    const players = ids(n);
    const matches = roundRobin(players);
    expect(matches).toHaveLength((n * (n - 1)) / 2);

    const pairs = new Set(matches.map((m) => key(m.player1, m.player2)));
    expect(pairs.size).toBe(matches.length);
    for (const m of matches) expect(m.player1).not.toBe(m.player2);

    const rounds = new Map<number, string[]>();
    for (const m of matches) rounds.set(m.round, [...(rounds.get(m.round) ?? []), m.player1, m.player2]);
    expect(rounds.size).toBe(n % 2 === 0 ? n - 1 : n);
    for (const inRound of rounds.values()) expect(new Set(inRound).size).toBe(inRound.length);
  });

  it("with an odd count, each player rests exactly one round", () => {
    const players = ids(7);
    const matches = roundRobin(players);
    for (const p of players) {
      const roundsPlayed = new Set(matches.filter((m) => m.player1 === p || m.player2 === p).map((m) => m.round));
      expect(roundsPlayed.size).toBe(6);
    }
  });

  it("rejects fewer than 2 players and duplicates", () => {
    expect(() => roundRobin(["a"])).toThrow();
    expect(() => roundRobin(["a", "a"])).toThrow();
  });
});
