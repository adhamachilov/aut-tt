export const POINTS = { win: 1, loss: 0 } as const;

// Every game of a match is played; an odd count means someone always wins.
export const GAMES_PER_MATCH = [3, 5, 7] as const;
export type GamesPerMatch = (typeof GAMES_PER_MATCH)[number];
export const DEFAULT_GAMES_PER_MATCH: GamesPerMatch = 3;

export const MAX_MATCHES_PER_PLAYER = 10;

export function isValidScore(games: number, a: number, b: number): boolean {
  return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a + b === games && a !== b;
}

/** Every possible result from player 1's point of view, wins first: 3–0, 2–1, 1–2, 0–3. */
export function scoreOptions(games: number): [number, number][] {
  const wins: [number, number][] = [];
  for (let a = games; a > games / 2; a--) wins.push([a, games - a]);
  return [...wins, ...wins.map(([a, b]): [number, number] => [b, a]).reverse()];
}

export const rulesText = (games: number) => `Each match is ${games} games, all played. Win = ${POINTS.win} point, loss = ${POINTS.loss}.`;
