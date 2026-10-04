import { describe, expect, it } from "vitest";
import { gamesToWin, isValidScore, scoreOptions } from "@/lib/league/rules";

describe("match format", () => {
  it("needs a majority of games to win", () => {
    expect([3, 5, 7].map(gamesToWin)).toEqual([2, 3, 4]);
  });

  it("accepts only results a real match can end with", () => {
    expect(isValidScore(5, 3, 0)).toBe(true);
    expect(isValidScore(5, 2, 3)).toBe(true);
    expect(isValidScore(5, 3, 3)).toBe(false);
    expect(isValidScore(5, 4, 1)).toBe(false);
    expect(isValidScore(5, 2, 1)).toBe(false);
    expect(isValidScore(3, 2, 1)).toBe(true);
    expect(isValidScore(3, 3, 0)).toBe(false);
    expect(isValidScore(7, 4, 3)).toBe(true);
    expect(isValidScore(5, -1, 3)).toBe(false);
  });

  it("lists every possible result, player 1's wins first", () => {
    expect(scoreOptions(5)).toEqual([[3, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 3]]);
    expect(scoreOptions(3)).toEqual([[2, 0], [2, 1], [1, 2], [0, 2]]);
    expect(scoreOptions(7)).toHaveLength(8);
    expect(scoreOptions(7).every(([a, b]) => isValidScore(7, a, b))).toBe(true);
  });
});
