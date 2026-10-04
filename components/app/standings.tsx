"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { yearLabel } from "@/lib/league/types";
import { EmptyState } from "@/components/ui/primitives";
import { useLeague } from "./league-app";
import { rulesText } from "@/lib/league/rules";
import { Avatar, played, Sheet, winnerOf } from "./ui";

export function SeasonPicker() {
  const { league, setSeasonId } = useLeague();
  const { seasons, season } = league!;
  if (seasons.length < 2 || !season) return null;
  return (
    <select
      aria-label="Season"
      value={season.id}
      onChange={(e) => setSeasonId(e.target.value)}
      className="h-9 max-w-[55%] truncate rounded-full bg-surface px-3 text-[13px] font-medium text-ink-2 ring-1 ring-line"
    >
      {seasons.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
          {s.status !== "finished" ? " (current)" : ""}
        </option>
      ))}
    </select>
  );
}

export function TableTab() {
  const { me, league, openPlayer } = useLeague();
  const { season, players, standings } = league!;
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const meId = me.player!.id;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 pt-1">
        <h1 className="font-display text-[34px] font-semibold uppercase leading-none">Table</h1>
        <SeasonPicker />
      </div>
      {season && <p className="-mt-2 text-sm text-ink-2">{season.name}</p>}

      {!season || players.length === 0 ? (
        <EmptyState title="Nobody here yet" body="Players appear once they join the season." />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  <th className="w-8 py-2.5 pl-3 text-left">#</th>
                  <th className="py-2.5 pl-1 text-left">Player</th>
                  <th className="w-8 py-2.5 text-center" title="Played">P</th>
                  <th className="w-8 py-2.5 text-center" title="Won">W</th>
                  <th className="w-8 py-2.5 text-center" title="Lost">L</th>
                  <th className="w-10 py-2.5 text-center" title="Games difference">+/-</th>
                  <th className="w-11 py-2.5 pr-3 text-right" title="Points">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((r) => {
                  const p = byId.get(r.playerId);
                  const diff = r.scoreFor - r.scoreAgainst;
                  const isMe = r.playerId === meId;
                  return (
                    <tr
                      key={r.playerId}
                      onClick={() => openPlayer(r.playerId)}
                      className={cn("num cursor-pointer border-b border-line last:border-0", isMe && "bg-accent-soft")}
                    >
                      <td className="py-3 pl-3 font-semibold text-ink-2">{r.position}</td>
                      <td className="max-w-0 py-3 pl-1">
                        <span className="flex items-center gap-2">
                          <Avatar name={p?.name ?? "?"} size={26} highlight={isMe} />
                          <span className={cn("truncate", isMe ? "font-semibold" : "font-medium")}>{p?.name}</span>
                        </span>
                      </td>
                      <td className="py-3 text-center text-ink-2">{r.played}</td>
                      <td className="py-3 text-center font-semibold">{r.wins}</td>
                      <td className="py-3 text-center text-ink-2">{r.losses}</td>
                      <td className="py-3 text-center text-ink-2">{diff > 0 ? `+${diff}` : diff}</td>
                      <td className="py-3 pr-3 text-right font-semibold">{r.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-ink-3">
            {rulesText(season.bestOf)} Tied players are ranked by their matches against each other, then games difference (+/-). Tap a player to see their matches.
          </p>
        </>
      )}
    </div>
  );
}

export function PlayerSheet({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { me, league } = useLeague();
  const { players, matches, standings } = league!;
  const byId = new Map(players.map((p) => [p.id, p]));
  const p = byId.get(playerId);
  const row = standings.find((r) => r.playerId === playerId);
  if (!p) return null;

  const theirs = matches
    .filter((m) => m.player1Id === playerId || m.player2Id === playerId)
    .sort((a, b) => Number(played(b)) - Number(played(a)) || (b.playedAt ?? "").localeCompare(a.playedAt ?? "") || a.round - b.round);

  return (
    <Sheet title={p.id === me.player!.id ? "You" : p.name} onClose={onClose}>
      <div className="flex items-center gap-3">
        <Avatar name={p.name} size={52} highlight={p.id === me.player!.id} />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold">{p.name}</p>
          <p className="truncate text-sm text-ink-2">
            {p.major} · {yearLabel(p.year)}
          </p>
          {p.username && (
            <a href={`https://t.me/${p.username}`} className="text-sm font-medium text-live">
              @{p.username}
            </a>
          )}
        </div>
      </div>

      {row && (
        <div className="mt-5 grid grid-cols-4 gap-2 text-center">
          {[
            ["Rank", `#${row.position}`],
            ["Points", row.points],
            ["Won", row.wins],
            ["Lost", row.losses],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-surface-2 py-2.5">
              <div className="num font-display text-[22px] font-semibold leading-none">{value}</div>
              <div className="mt-1 text-[11px] text-ink-3">{label}</div>
            </div>
          ))}
        </div>
      )}

      {theirs.length > 0 && (
        <ul className="mt-5 divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
          {theirs.map((m) => {
            const oppId = m.player1Id === playerId ? m.player2Id : m.player1Id;
            const own = m.player1Id === playerId ? m.score1 : m.score2;
            const other = m.player1Id === playerId ? m.score2 : m.score1;
            const winner = winnerOf(m);
            const opp = byId.get(oppId);
            return (
              <li key={m.id} className="flex items-center gap-3 px-3.5 py-3">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold",
                    !winner ? "bg-surface-2 text-ink-3" : winner === playerId ? "bg-win-soft text-win" : "bg-loss-soft text-loss",
                  )}
                >
                  {!winner ? "–" : winner === playerId ? "W" : "L"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px]">
                  <span className="text-ink-3">vs </span>
                  {oppId === me.player!.id ? "You" : (opp?.name ?? "Removed player")}
                </span>
                <span className="num shrink-0 text-[15px] font-semibold">{winner ? `${own}–${other}` : <span className="text-[13px] font-normal text-ink-3">Round {m.round}</span>}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
