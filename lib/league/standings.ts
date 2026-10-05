import type { Match, StandingRow } from "./types";

// Points are games won (3–0 gives the winner 3, 2–1 gives 2 and 1).
// Ranking: most points; then points from matches between the tied players; then
// matches won; then games difference; then name, so the order is always stable.
export function computeStandings(players: readonly { id: string; name: string }[], matches: readonly Match[]): StandingRow[] {
  const played = matches
    .filter((m) => m.score1 !== null && m.score2 !== null)
    .sort((a, b) => (b.playedAt ?? "").localeCompare(a.playedAt ?? ""));

  const rows = new Map<string, StandingRow>(
    players.map((p) => [p.id, { playerId: p.id, position: 0, played: 0, wins: 0, losses: 0, points: 0, scoreFor: 0, scoreAgainst: 0, form: [] }]),
  );

  for (const m of played) {
    const sides = [
      [m.player1Id, m.score1!, m.score2!],
      [m.player2Id, m.score2!, m.score1!],
    ] as const;
    for (const [id, own, other] of sides) {
      const row = rows.get(id);
      if (!row) continue;
      const won = own > other;
      row.played++;
      if (won) row.wins++;
      else row.losses++;
      row.points += own;
      row.scoreFor += own;
      row.scoreAgainst += other;
      if (row.form.length < 5) row.form.push(won ? "W" : "L");
    }
  }

  const names = new Map(players.map((p) => [p.id, p.name]));
  const byPoints = new Map<number, StandingRow[]>();
  for (const row of rows.values()) byPoints.set(row.points, [...(byPoints.get(row.points) ?? []), row]);

  const ordered: StandingRow[] = [];
  for (const points of [...byPoints.keys()].sort((a, b) => b - a)) {
    const group = byPoints.get(points)!;
    const ids = new Set(group.map((r) => r.playerId));
    const h2h = new Map(group.map((r) => [r.playerId, 0]));
    for (const m of played) {
      if (ids.has(m.player1Id) && ids.has(m.player2Id)) {
        h2h.set(m.player1Id, h2h.get(m.player1Id)! + m.score1!);
        h2h.set(m.player2Id, h2h.get(m.player2Id)! + m.score2!);
      }
    }
    group.sort(
      (a, b) =>
        h2h.get(b.playerId)! - h2h.get(a.playerId)! ||
        b.wins - a.wins ||
        b.scoreFor - b.scoreAgainst - (a.scoreFor - a.scoreAgainst) ||
        (names.get(a.playerId) ?? "").localeCompare(names.get(b.playerId) ?? ""),
    );
    ordered.push(...group);
  }
  ordered.forEach((r, i) => (r.position = i + 1));
  return ordered;
}
