"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/primitives";
import type { Match } from "@/lib/league/types";
import { useLeague } from "./league-app";
import { SeasonPicker } from "./standings";
import { MatchCard, played, Segmented } from "./ui";

export function MatchesTab() {
  const { me, league, openPlayer } = useLeague();
  const { season, players, matches } = league!;
  const meId = me.player!.id;
  const inSeason = players.some((p) => p.id === meId);
  const [view, setView] = useState<"mine" | "all">(inSeason ? "mine" : "all");
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const mine = matches.filter((m) => m.player1Id === meId || m.player2Id === meId);
  const toPlay = mine.filter((m) => !played(m)).sort((a, b) => a.round - b.round);
  const done = mine.filter(played).sort((a, b) => (b.playedAt ?? "").localeCompare(a.playedAt ?? ""));

  const rounds = useMemo(() => {
    const map = new Map<number, Match[]>();
    for (const m of matches) map.set(m.round, [...(map.get(m.round) ?? []), m]);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 pt-1">
        <h1 className="font-display text-[34px] font-semibold uppercase leading-none">Matches</h1>
        <SeasonPicker />
      </div>

      {!season || season.status === "registration" ? (
        <EmptyState title="No matches yet" body="Every player plays every other player once. The schedule appears when the season starts." />
      ) : (
        <>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "mine", label: "My matches" },
              { value: "all", label: "All matches" },
            ]}
          />

          {view === "mine" ? (
            !inSeason ? (
              <EmptyState title="You’re not in this season" body="Switch to All matches to follow everyone else." />
            ) : (
              <div className="space-y-5">
                <Group title={toPlay.length ? `To play · ${toPlay.length}` : "Nothing left to play"}>
                  {toPlay.map((m) => (
                    <MatchCard key={m.id} match={m} players={byId} meId={meId} onPlayer={openPlayer} />
                  ))}
                </Group>
                {done.length > 0 && (
                  <Group title={`Played · ${done.length}`}>
                    {done.map((m) => (
                      <MatchCard key={m.id} match={m} players={byId} meId={meId} onPlayer={openPlayer} />
                    ))}
                  </Group>
                )}
              </div>
            )
          ) : (
            <div className="space-y-5">
              {rounds.map(([round, list]) => (
                <Group key={round} title={`Round ${round} · ${list.filter(played).length}/${list.length} played`}>
                  {list.map((m) => (
                    <MatchCard key={m.id} match={m} players={byId} meId={meId} onPlayer={openPlayer} showRound={false} />
                  ))}
                </Group>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}
