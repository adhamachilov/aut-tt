// Every game of a match is played; an odd count means someone always wins.
export const GAMES_PER_MATCH = [3, 5, 7] as const;
export type GamesPerMatch = (typeof GAMES_PER_MATCH)[number];
export const DEFAULT_GAMES_PER_MATCH: GamesPerMatch = 3;

export const MAX_MATCHES_PER_PLAYER = 10;

export const MATCH_HOURS = { from: "11:00", to: "13:00" } as const;
export const scheduleText = `Matches are played between ${MATCH_HOURS.from} and ${MATCH_HOURS.to}. A no-show loses 3–0 (11–0 every game).`;

/** A no-show forfeit: the player who came wins every game 11–0. */
export function walkover(games: number, winner: 1 | 2): { score: [number, number]; games: [number, number][] } {
  return {
    score: winner === 1 ? [games, 0] : [0, games],
    games: Array.from({ length: games }, (): [number, number] => (winner === 1 ? [11, 0] : [0, 11])),
  };
}
export const MAX_MATCHES_PER_DAY = 100;

export function isValidScore(games: number, a: number, b: number): boolean {
  return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a + b === games && a !== b;
}

/** Every possible result from player 1's point of view, wins first: 3–0, 2–1, 1–2, 0–3. */
export function scoreOptions(games: number): [number, number][] {
  const wins: [number, number][] = [];
  for (let a = games; a > games / 2; a--) wins.push([a, games - a]);
  return [...wins, ...wins.map(([a, b]): [number, number] => [b, a]).reverse()];
}

export const rulesText = (games: number) => `Each match is ${games} games, all played. Every game won = 1 point.`;

/** Games won by each player, from the points of every game; null if a game is a draw. */
export function scoreFromGames(games: readonly (readonly [number, number])[]): [number, number] | null {
  if (games.some(([a, b]) => a === b)) return null;
  const won1 = games.filter(([a, b]) => a > b).length;
  return [won1, games.length - won1];
}
