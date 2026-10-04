// ITTF round-robin scoring: a played match earns points even when lost.
export const POINTS = { win: 2, loss: 1 } as const;

export const BEST_OF = [3, 5, 7] as const;
export type BestOf = (typeof BEST_OF)[number];
export const DEFAULT_BEST_OF: BestOf = 5;

export const gamesToWin = (bestOf: number) => Math.ceil(bestOf / 2);

/** Winner has exactly the games needed; loser has fewer. */
export function isValidScore(bestOf: number, a: number, b: number): boolean {
  const need = gamesToWin(bestOf);
  return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && Math.max(a, b) === need && Math.min(a, b) < need;
}

/** Every valid result from player 1's point of view, wins first: 3–0, 3–1, 3–2, 2–3, 1–3, 0–3. */
export function scoreOptions(bestOf: number): [number, number][] {
  const need = gamesToWin(bestOf);
  const losing = Array.from({ length: need }, (_, i) => i);
  return [...losing.map((l): [number, number] => [need, l]), ...losing.reverse().map((l): [number, number] => [l, need])];
}

export const rulesText = (bestOf: number) => `Best of ${bestOf} games (first to ${gamesToWin(bestOf)}). Win ${POINTS.win} pts, loss ${POINTS.loss} pt.`;
