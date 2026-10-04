export interface PlannedMatch {
  /** Order of play within the day, from 1. */
  round: number;
  player1: string;
  player2: string;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Plans one match day: each present player gets `perPlayer` matches (one player gets one
 * fewer when the total is odd). Opponents they've met least often are preferred, so
 * repeats only happen when there aren't enough new opponents. Matches are ordered so
 * nobody plays twice in a row when it can be avoided.
 */
export function planMatchDay(
  present: readonly string[],
  perPlayer: number,
  history: readonly { player1Id: string; player2Id: string }[],
  random: () => number = Math.random,
): PlannedMatch[] {
  const ids = [...new Set(present)];
  if (ids.length < 2) throw new Error("At least 2 players are needed.");
  if (!Number.isInteger(perPlayer) || perPlayer < 1) throw new Error("Each player needs at least 1 match.");

  const met = new Map<string, number>();
  for (const m of history) met.set(pairKey(m.player1Id, m.player2Id), (met.get(pairKey(m.player1Id, m.player2Id)) ?? 0) + 1);
  const total = Math.floor((ids.length * perPlayer) / 2);

  let best: [string, string][] = [];
  let bestCost = Infinity;
  for (let attempt = 0; attempt < 300 && bestCost > 0; attempt++) {
    const left = new Map(ids.map((id) => [id, perPlayer]));
    const seen = new Map(met);
    const pairs: [string, string][] = [];
    let cost = 0;
    while (pairs.length < total) {
      // Stable sort keeps the random order among players with the same number left.
      const open = shuffle(ids.filter((id) => left.get(id)! > 0), random).sort((x, y) => left.get(y)! - left.get(x)!);
      if (open.length < 2) break;
      const a = open[0];
      const b = open
        .slice(1)
        .sort((x, y) => (seen.get(pairKey(a, x)) ?? 0) - (seen.get(pairKey(a, y)) ?? 0) || left.get(y)! - left.get(x)!)[0];
      const times = seen.get(pairKey(a, b)) ?? 0;
      cost += times * times;
      seen.set(pairKey(a, b), times + 1);
      left.set(a, left.get(a)! - 1);
      left.set(b, left.get(b)! - 1);
      pairs.push([a, b]);
    }
    cost += (total - pairs.length) * 1_000_000;
    if (cost < bestCost) {
      bestCost = cost;
      best = pairs;
    }
  }

  const lastPlayed = new Map<string, number>();
  const remaining = shuffle([...best], random);
  const ordered: PlannedMatch[] = [];
  while (remaining.length) {
    const rest = (id: string) => lastPlayed.get(id) ?? -Infinity;
    let pick = 0;
    for (let i = 1; i < remaining.length; i++) {
      const [a, b] = remaining[i];
      const [c, d] = remaining[pick];
      if (Math.max(rest(a), rest(b)) < Math.max(rest(c), rest(d))) pick = i;
    }
    const [a, b] = remaining.splice(pick, 1)[0];
    lastPlayed.set(a, ordered.length);
    lastPlayed.set(b, ordered.length);
    const flip = random() < 0.5;
    ordered.push({ round: ordered.length + 1, player1: flip ? b : a, player2: flip ? a : b });
  }
  return ordered;
}
