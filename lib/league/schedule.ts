export interface ScheduledMatch {
  round: number;
  player1: string;
  player2: string;
}

// Round robin by the circle method: everyone plays everyone exactly once, each
// player at most once per round. With an odd count, one player rests each round.
export function roundRobin(playerIds: readonly string[], random: () => number = Math.random): ScheduledMatch[] {
  if (new Set(playerIds).size !== playerIds.length) throw new Error("Duplicate player in schedule.");
  if (playerIds.length < 2) throw new Error("A season needs at least 2 players.");

  const slots: (string | null)[] = [...playerIds];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  if (slots.length % 2 === 1) slots.push(null);

  const n = slots.length;
  const matches: ScheduledMatch[] = [];
  let rotating = slots.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const current = [slots[0], ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = current[i];
      const b = current[n - 1 - i];
      if (a === null || b === null) continue;
      // Alternate who is listed first so the fixed slot isn't always on the left.
      const flip = (r + i) % 2 === 1;
      matches.push({ round: r + 1, player1: flip ? b : a, player2: flip ? a : b });
    }
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }
  return matches;
}
