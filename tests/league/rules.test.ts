import { describe, expect, it } from "vitest";
import { isValidScore, scoreFromGames, scoreOptions } from "@/lib/league/rules";

describe("match format (every game is played)", () => {
  it("accepts only scores that add up to the number of games", () => {
    expect(isValidScore(3, 3, 0)).toBe(true);
    expect(isValidScore(3, 2, 1)).toBe(true);
    expect(isValidScore(3, 1, 2)).toBe(true);
    expect(isValidScore(3, 2, 0)).toBe(false);
    expect(isValidScore(3, 3, 1)).toBe(false);
    expect(isValidScore(5, 3, 2)).toBe(true);
    expect(isValidScore(5, 3, 0)).toBe(false);
    expect(isValidScore(3, -1, 4)).toBe(false);
  });

  it("lists every result, player 1's wins first", () => {
    expect(scoreOptions(3)).toEqual([[3, 0], [2, 1], [1, 2], [0, 3]]);
    expect(scoreOptions(5)).toEqual([[5, 0], [4, 1], [3, 2], [2, 3], [1, 4], [0, 5]]);
    expect(scoreOptions(7).every(([a, b]) => isValidScore(7, a, b))).toBe(true);
  });
});

describe("scoreFromGames", () => {
  it("counts the games each player won", () => {
    expect(scoreFromGames([[11, 0], [11, 0], [11, 0]])).toEqual([3, 0]);
    expect(scoreFromGames([[11, 9], [7, 11], [12, 10]])).toEqual([2, 1]);
    expect(scoreFromGames([[0, 11], [0, 11], [0, 11]])).toEqual([0, 3]);
  });

  it("rejects a drawn game", () => {
    expect(scoreFromGames([[11, 9], [10, 10], [11, 4]])).toBeNull();
  });
});
