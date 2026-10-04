export interface PlannedMatch {
  /** Order of play within the day, from 1. */
  round: number;
  player1: string;
  player2: string;
}

/** Either every present player plays `perPlayer` matches, or `total` matches are played in all. */
export type DayTarget = { perPlayer: number } | { total: number };

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function matchesForDay(players: number, target: DayTarget): number {
  return "perPlayer" in target ? Math.floor((players * target.perPlayer) / 2) : target.total;
}

/**
 * Plans one match day, fairly across the whole season:
 * - players with the fewest matches so far are picked first, so everyone plays about equally;
 * - pairs that have never met come first, so nobody meets the same opponent again until
 *   every possible pairing (n×(n−1)/2) has been played;
 * - matches are ordered so nobody plays twice in a row when it can be avoided.
 */
export function planMatchDay(
  present: readonly string[],
  target: DayTarget,
  history: readonly { player1Id: string; player2Id: string }[],
  random: () => number = Math.random,
): PlannedMatch[] {
  const ids = [...new Set(present)];
  const n = ids.length;
  if (n < 2) throw new Error("At least 2 players are needed.");
  const total = matchesForDay(n, target);
  if (!Number.isInteger(total) || total < 1) throw new Error("Plan at least 1 match.");
  // Most matches one player gets today.
  const cap = "perPlayer" in target ? target.perPlayer : Math.ceil((2 * total) / n);

  const met = new Map<string, number>();
  const playedBefore = new Map(ids.map((id) => [id, 0]));
  for (const m of history) {
    met.set(pairKey(m.player1Id, m.player2Id), (met.get(pairKey(m.player1Id, m.player2Id)) ?? 0) + 1);
    for (const p of [m.player1Id, m.player2Id]) if (playedBefore.has(p)) playedBefore.set(p, playedBefore.get(p)! + 1);
  }

  let best: [string, string][] = [];
  let bestCost = Infinity;
  for (let attempt = 0; attempt < 400; attempt++) {
    const today = new Map(ids.map((id) => [id, 0]));
    const seen = new Map(met);
    const pairs: [string, string][] = [];
    let cost = 0;
    const strict = attempt % 2 === 0;
    while (pairs.length < total) {
      const open = shuffle(ids.filter((id) => today.get(id)! < cap), random);
      if (open.length < 2) break;
      // Stable sorts keep the random order among equals.
      open.sort((x, y) => today.get(x)! - today.get(y)! || (strict ? playedBefore.get(x)! - playedBefore.get(y)! : 0));
      const a = open[0];
      const b = open
        .slice(1)
        .sort(
          (x, y) =>
            (seen.get(pairKey(a, x)) ?? 0) - (seen.get(pairKey(a, y)) ?? 0) ||
            today.get(x)! - today.get(y)! ||
            playedBefore.get(x)! - playedBefore.get(y)!,
        )[0];
      const times = seen.get(pairKey(a, b)) ?? 0;
      cost += times * times * 1000;
      seen.set(pairKey(a, b), times + 1);
      today.set(a, today.get(a)! + 1);
      today.set(b, today.get(b)! + 1);
      pairs.push([a, b]);
    }
    cost += (total - pairs.length) * 1e9;
    for (const id of ids) cost += (playedBefore.get(id)! + today.get(id)!) ** 2;
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
