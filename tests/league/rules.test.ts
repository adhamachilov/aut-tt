import { describe, expect, it } from "vitest";
import { isValidScore, scoreOptions } from "@/lib/league/rules";

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
