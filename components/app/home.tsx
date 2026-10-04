"use client";

import { useMemo, useState } from "react";
import { yearLabel } from "@/lib/league/types";
import { buttonClass, Card, Pill } from "@/components/ui/primitives";
import { useLeague } from "./league-app";
import { ProfileForm } from "./profile-form";
import { rulesText } from "@/lib/league/rules";
import { Avatar, byDayThenOrder, formatDateTime, MatchCard, played, Sheet } from "./ui";

const PLAYER_PREVIEW = 10;

export function HomeTab() {
  const { me, setMe, api, league, reload, run, confirm, goTo, openPlayer } = useLeague();
  const [editing, setEditing] = useState(false);
  const [allPlayers, setAllPlayers] = useState(false);
  const [busy, setBusy] = useState(false);
  const player = me.player!;
  const { season, players, matches, standings } = league!;
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const myRow = standings.find((r) => r.playerId === player.id);
  const joined = league!.me.joined;

  const act = async (action: "join" | "leave") => {
    if (action === "leave" && !(await confirm(`Leave ${season!.name}?`))) return;
    setBusy(true);
    await run(() => api.post("/api/league", { action, seasonId: season!.id }), action === "join" ? "You're in! 🏓" : "You left the season.");
    setBusy(false);
  };

  const myMatches = matches.filter((m) => m.player1Id === player.id || m.player2Id === player.id);
  const upcoming = myMatches.filter((m) => !played(m)).sort(byDayThenOrder);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3 pt-1">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-3">{me.leagueName}</p>
          <h1 className="mt-1 truncate font-display text-[34px] font-semibold uppercase leading-none">Hi, {player.name.split(" ")[0]}</h1>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="shrink-0" aria-label="Edit my profile">
          <Avatar name={player.name} size={44} highlight />
        </button>
      </header>

      {player.banned && (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">You can’t join seasons right now. Contact the organizer.</p>
      )}

      {!season ? (
        <Card className="p-5">
          <p className="text-[17px] font-semibold">No season yet</p>
          <p className="mt-1 text-sm text-ink-2">When the organizer opens registration, you’ll be able to join here.</p>
        </Card>
      ) : season.status === "registration" ? (
        <Card className="overflow-hidden">
          <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <Pill tone={season.acceptingPlayers ? "win" : "muted"}>{season.acceptingPlayers ? "Registration open" : "Registration closed"}</Pill>
              <span className="num text-[13px] text-ink-3">{players.length} joined</span>
            </div>
            <h2 className="mt-3 font-display text-[30px] font-semibold uppercase leading-none">{season.name}</h2>
            {season.acceptingPlayers && season.registrationClosesAt && (
              <p className="mt-2 text-sm text-ink-2">Closes {formatDateTime(season.registrationClosesAt)}</p>
            )}
            {!season.acceptingPlayers && <p className="mt-2 text-sm text-ink-2">The schedule will appear here when the season starts.</p>}
            <p className="mt-2 text-[13px] text-ink-3">{rulesText(season.gamesPerMatch)} Matches are scheduled day by day.</p>

            <div className="mt-5">
              {joined ? (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-win-soft px-4 py-3">
                  <span className="font-semibold text-win">✓ You’re in</span>
                  <button type="button" disabled={busy} onClick={() => act("leave")} className="text-sm font-medium text-ink-2 underline underline-offset-2">
                    Leave
                  </button>
                </div>
              ) : season.acceptingPlayers && !player.banned ? (
                <button type="button" disabled={busy} onClick={() => act("join")} className={buttonClass("primary", "lg", "w-full bg-accent! text-accent-ink! hover:bg-accent/90!")}>
                  {busy ? "Joining…" : "Join season"}
                </button>
              ) : null}
            </div>
          </div>
          {players.length > 0 && (
            <div className="border-t border-line px-5 py-4">
              <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Players · {players.length}</p>
              <ul className="flex flex-wrap gap-2">
                {[...players.filter((p) => p.id === player.id), ...players.filter((p) => p.id !== player.id)].slice(0, allPlayers ? undefined : PLAYER_PREVIEW).map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => openPlayer(p.id)} className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3 text-[13px]">
                      <Avatar name={p.name} size={24} highlight={p.id === player.id} />
                      {p.id === player.id ? "You" : p.name}
                    </button>
                  </li>
                ))}
              </ul>
              {players.length > PLAYER_PREVIEW && (
                <button type="button" onClick={() => setAllPlayers(!allPlayers)} className="mt-3 text-[13px] font-medium text-ink-2 underline underline-offset-2">
                  {allPlayers ? "Show less" : `Show all ${players.length}`}
                </button>
              )}
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <Pill tone={season.status === "active" ? "live" : "muted"}>{season.status === "active" ? "In progress" : "Finished"}</Pill>
              <span className="num text-[13px] text-ink-3">
                {matches.filter(played).length}/{matches.length} played
              </span>
            </div>
            <h2 className="mt-3 font-display text-[30px] font-semibold uppercase leading-none">{season.name}</h2>
            <p className="mt-2 text-[13px] text-ink-3">{rulesText(season.gamesPerMatch)}</p>
            {season.status === "finished" && standings[0] && standings[0].played > 0 && (
              <p className="mt-2 text-sm text-ink-2">
                🏆 Champion: <span className="font-semibold text-ink">{byId.get(standings[0].playerId)?.name}</span>
              </p>
            )}

            {myRow ? (
              <div className="mt-5 grid grid-cols-4 gap-2 text-center">
                <Stat label="Rank" value={`#${myRow.position}`} strong />
                <Stat label="Points" value={myRow.points} />
                <Stat label="Won" value={myRow.wins} />
                <Stat label="Lost" value={myRow.losses} />
              </div>
            ) : season.status === "active" && season.acceptingPlayers && !player.banned ? (
              <div className="mt-4">
                <p className="mb-3 text-sm text-ink-2">The season has started, but you can still join. You’ll be picked for the next match days.</p>
                <button type="button" disabled={busy} onClick={() => act("join")} className={buttonClass("primary", "lg", "w-full bg-accent! text-accent-ink! hover:bg-accent/90!")}>
                  {busy ? "Joining…" : "Join season"}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-2">You’re not playing in this season.</p>
            )}
            <button type="button" onClick={() => goTo("table")} className={buttonClass("secondary", "md", "mt-4 w-full")}>
              View table
            </button>
          </Card>

          {myRow && season.status === "active" && (
            <section>
              <div className="mb-2 flex items-end justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                  {upcoming.length ? `Your next matches · ${upcoming.length} left` : "All your matches are played"}
                </h2>
                <button type="button" onClick={() => goTo("matches")} className="text-[13px] font-medium text-ink-2">
                  All →
                </button>
              </div>
              <div className="space-y-2.5">
                {upcoming.slice(0, 3).map((m) => (
                  <MatchCard key={m.id} match={m} players={byId} meId={player.id} onPlayer={openPlayer} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <p className="text-center text-[12px] text-ink-3">
        {player.major} · {yearLabel(player.year)} ·{" "}
        <button type="button" onClick={() => setEditing(true)} className="underline underline-offset-2">
          Edit profile
        </button>
      </p>

      {editing && (
        <Sheet title="My profile" onClose={() => setEditing(false)}>
          <ProfileForm
            api={api}
            me={me}
            submitLabel="Save"
            onSaved={(p) => {
              setMe({ ...me, player: p });
              setEditing(false);
              void reload();
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "rounded-xl bg-ink py-2.5 text-bg" : "rounded-xl bg-surface-2 py-2.5"}>
      <div className="num font-display text-[24px] font-semibold leading-none">{value}</div>
      <div className={strong ? "mt-1 text-[11px] text-bg/70" : "mt-1 text-[11px] text-ink-3"}>{label}</div>
    </div>
  );
}
