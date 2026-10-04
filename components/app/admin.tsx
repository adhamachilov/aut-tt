"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { DEFAULT_GAMES_PER_MATCH, GAMES_PER_MATCH, MAX_MATCHES_PER_DAY, MAX_MATCHES_PER_PLAYER, rulesText, scoreOptions } from "@/lib/league/rules";
import { yearLabel, type AdminAction, type AdminPlayer, type LeaguePlayer, type Match } from "@/lib/league/types";
import { buttonClass, Card, EmptyState, Pill } from "@/components/ui/primitives";
import { useLeague } from "./league-app";
import { Field, inputClass, StudyFields, type Study } from "./profile-form";
import { SeasonPicker } from "./standings";
import { Avatar, byDayThenOrder, dayTitle, formatDateTime, fromLocalInput, played, Segmented, Sheet, todayInput, toLocalInput } from "./ui";

function useAdmin() {
  const ctx = useLeague();
  const [players, setPlayers] = useState<AdminPlayer[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    ctx.api
      .get<{ players: AdminPlayer[] }>("/api/admin")
      .then((r) => !cancelled && setPlayers(r.players))
      .catch(() => !cancelled && setPlayers([]));
    return () => {
      cancelled = true;
    };
  }, [ctx.api, version]);
  const act = async (body: AdminAction, success: string) => {
    const done = await ctx.run(() => ctx.api.post("/api/admin", body), success);
    if (done) setVersion((v) => v + 1);
    return done;
  };
  return { ...ctx, players, act };
}

type AdminCtx = ReturnType<typeof useAdmin>;

export function AdminTab() {
  const admin = useAdmin();
  const [section, setSection] = useState<"season" | "players">("season");
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 pt-1">
        <h1 className="font-display text-[34px] font-semibold uppercase leading-none">Admin</h1>
        {section === "season" && <SeasonPicker />}
      </div>
      <Segmented
        value={section}
        onChange={setSection}
        options={[
          { value: "season", label: "Season" },
          { value: "players", label: `Players${admin.players ? ` · ${admin.players.length}` : ""}` },
        ]}
      />
      {section === "season" ? <SeasonAdmin admin={admin} /> : <PlayersAdmin admin={admin} />}
    </div>
  );
}

// ─── Season ──────────────────────────────────────────────────────────────────

function SeasonAdmin({ admin }: { admin: AdminCtx }) {
  const { league, act, confirm } = admin;
  const { season, seasons, players, matches } = league!;
  const hasCurrent = seasons.some((s) => s.status !== "finished");

  return (
    <div className="space-y-5">
      {!hasCurrent && <CreateSeason admin={admin} />}

      {season && (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 truncate text-[17px] font-semibold">{season.name}</h2>
              <Pill tone={season.status === "registration" ? "win" : season.status === "active" ? "live" : "muted"}>
                {season.status === "registration" ? "Registration" : season.status === "active" ? "In progress" : "Finished"}
              </Pill>
            </div>
            <p className="num mt-1 text-sm text-ink-2">
              {players.length} players
              {season.status !== "registration" && ` · ${matches.filter(played).length}/${matches.length} matches played`}
            </p>

            {season.status === "registration" ? (
              <div className="mt-4">
                <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Match format</span>
                <GamesPicker
                  value={season.gamesPerMatch}
                  onChange={(n) => act({ action: "updateSeason", seasonId: season.id, gamesPerMatch: n }, `Matches are now ${n} games.`)}
                />
                <p className="mt-1.5 text-[12px] text-ink-3">{rulesText(season.gamesPerMatch)}</p>
              </div>
            ) : (
              <p className="mt-1 text-[12px] text-ink-3">{rulesText(season.gamesPerMatch)}</p>
            )}

            {season.status !== "finished" && <RegistrationControls admin={admin} />}

            <div className="mt-4 flex flex-wrap gap-2">
              {season.status === "registration" && (
                <button
                  type="button"
                  disabled={players.length < 2}
                  onClick={async () => {
                    const n = players.length;
                    if (await confirm(`Start "${season.name}" with ${n} players?\n\nRegistration closes. Then you add match days: pick who's here and how many matches each plays.`)) {
                      await act({ action: "startSeason", seasonId: season.id }, "Season started. Add the first match day.");
                    }
                  }}
                  className={buttonClass("primary", "md", "flex-1")}
                >
                  Start season
                </button>
              )}
              {season.status === "active" && (
                <button
                  type="button"
                  onClick={async () => {
                    const left = matches.filter((m) => !played(m)).length;
                    const warn = left ? `\n\n${left} matches are still unplayed.` : "";
                    if (await confirm(`Finish "${season.name}"?${warn}`)) await act({ action: "finishSeason", seasonId: season.id }, "Season finished.");
                  }}
                  className={buttonClass("primary", "md", "flex-1")}
                >
                  Finish season
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  if (await confirm(`Delete "${season.name}" with all its matches and results? This can't be undone.`)) {
                    await act({ action: "deleteSeason", seasonId: season.id }, "Season deleted.");
                  }
                }}
                className={buttonClass("ghost", "md", "text-danger!")}
              >
                Delete
              </button>
            </div>
            {season.status === "registration" && players.length < 2 && <p className="mt-2 text-[12px] text-ink-3">At least 2 players are needed to start.</p>}
          </Card>

          {season.status === "active" && <PlanDay admin={admin} />}
          {season.status !== "registration" && <Results admin={admin} />}
          <Participants admin={admin} />
        </>
      )}
    </div>
  );
}

function CreateSeason({ admin }: { admin: AdminCtx }) {
  const [name, setName] = useState("");
  const [closes, setCloses] = useState("");
  const [games, setGames] = useState<number>(DEFAULT_GAMES_PER_MATCH);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="p-4">
      <h2 className="text-[17px] font-semibold">New season</h2>
      <p className="mt-1 text-sm text-ink-2">Registration opens right away. Players join from the app.</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await admin.act({ action: "createSeason", name, closesAt: fromLocalInput(closes), gamesPerMatch: games }, "Season created. Registration is open.");
          setBusy(false);
          if (ok) {
            setName("");
            setCloses("");
          }
        }}
      >
        <Field label="Season name">
          <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Autumn 2026" className={inputClass} />
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Games per match</span>
          <GamesPicker value={games} onChange={setGames} />
          <p className="mt-1.5 text-[12px] text-ink-3">{rulesText(games)}</p>
        </div>
        <Field label="Registration closes (optional)">
          <input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} className={inputClass} />
        </Field>
        <button type="submit" disabled={busy} className={buttonClass("primary", "lg", "w-full")}>
          {busy ? "Creating…" : "Create season"}
        </button>
      </form>
    </Card>
  );
}

function GamesPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Segmented
      value={String(value)}
      onChange={(v) => Number(v) !== value && onChange(Number(v))}
      options={GAMES_PER_MATCH.map((n) => ({ value: String(n), label: `${n} games` }))}
    />
  );
}

function RegistrationControls({ admin }: { admin: AdminCtx }) {
  const season = admin.league!.season!;
  const [closes, setCloses] = useState(toLocalInput(season.registrationClosesAt));
  const deadlinePassed = !!season.registrationClosesAt && new Date(season.registrationClosesAt) <= new Date();
  const changed = closes !== toLocalInput(season.registrationClosesAt);

  return (
    <div className="mt-4 space-y-3 rounded-xl bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-medium">Registration {season.acceptingPlayers ? "open" : "closed"}</p>
          <p className="text-[12px] text-ink-3">
            {season.acceptingPlayers
              ? season.status === "active"
                ? "Players can still join. They’re picked for the next match days."
                : "Players can join now."
              : deadlinePassed && season.registrationOpen
                ? "The deadline has passed. Change or clear it to reopen."
                : "Players can’t join. You can still add them below."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={season.registrationOpen}
          aria-label="Registration open"
          onClick={() =>
            admin.act(
              { action: "updateSeason", seasonId: season.id, registrationOpen: !season.registrationOpen },
              season.registrationOpen ? "Registration closed." : "Registration opened.",
            )
          }
          className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", season.registrationOpen ? "bg-win" : "bg-line-strong")}
        >
          <span className={cn("absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left]", season.registrationOpen ? "left-[22px]" : "left-0.5")} />
        </button>
      </div>
      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Closes automatically at</span>
        <div className="flex gap-2">
          <input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} className={cn(inputClass, "h-10 min-w-0 flex-1 text-[15px]")} />
          {changed ? (
            <button
              type="button"
              onClick={() => admin.act({ action: "updateSeason", seasonId: season.id, closesAt: fromLocalInput(closes) }, "Deadline saved.")}
              className={buttonClass("primary", "md")}
            >
              Save
            </button>
          ) : (
            season.registrationClosesAt && (
              <button
                type="button"
                onClick={async () => {
                  if (await admin.act({ action: "updateSeason", seasonId: season.id, closesAt: null }, "Deadline removed.")) setCloses("");
                }}
                className={buttonClass("secondary", "md")}
              >
                Clear
              </button>
            )
          )}
        </div>
        {season.registrationClosesAt && !changed && <p className="mt-1 text-[12px] text-ink-3">{formatDateTime(season.registrationClosesAt)}</p>}
      </div>
    </div>
  );
}

function Participants({ admin }: { admin: AdminCtx }) {
  const { league, players: everyone, act, confirm, openPlayer } = admin;
  const { season, players } = league!;
  const [adding, setAdding] = useState("");
  const joinedIds = new Set(players.map((p) => p.id));
  const addable = (everyone ?? []).filter((p) => !joinedIds.has(p.id) && !p.banned);

  const remove = async (p: LeaguePlayer) => {
    const msg =
      season!.status === "registration"
        ? `Remove ${p.name} from the season?`
        : `Remove ${p.name} from the season?\n\nAll their matches in this season are deleted, including played ones, and the table is recalculated.`;
    if (await confirm(msg)) await act({ action: "removeFromSeason", seasonId: season!.id, playerId: p.id }, `${p.name} removed.`);
  };

  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">Players in season · {players.length}</h2>
      {season!.status !== "finished" && addable.length > 0 && (
        <div className="mb-3 flex gap-2">
          <select value={adding} onChange={(e) => setAdding(e.target.value)} className={cn(inputClass, "h-10 min-w-0 flex-1 text-[15px]")} aria-label="Add a registered player">
            <option value="">Add a registered player…</option>
            {addable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!adding}
            onClick={async () => {
              if (await act({ action: "addToSeason", seasonId: season!.id, playerId: adding }, "Player added.")) setAdding("");
            }}
            className={buttonClass("primary", "md")}
          >
            Add
          </button>
        </div>
      )}
      {players.length === 0 ? (
        <EmptyState title="Nobody has joined yet" body="Share the bot link in your group so players can register and join." />
      ) : (
        <ul className="divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <button type="button" onClick={() => openPlayer(p.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar name={p.name} size={32} />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium">{p.name}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {p.major} · {yearLabel(p.year)}
                  </span>
                </span>
              </button>
              <button type="button" onClick={() => remove(p)} className={buttonClass("ghost", "sm", "text-danger!")}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlanDay({ admin }: { admin: AdminCtx }) {
  const [open, setOpen] = useState(false);
  const nextDay = Math.max(0, ...admin.league!.matches.map((m) => m.day)) + 1;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void admin.reload();
          setOpen(true);
        }}
        className={buttonClass("primary", "lg", "w-full")}
      >
        + Plan Day {nextDay}
      </button>
      {open && (
        <Sheet title={`Plan Day ${nextDay}`} onClose={() => setOpen(false)}>
          <DayPlanner admin={admin} nextDay={nextDay} onDone={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}

function DayPlanner({ admin, nextDay, onDone }: { admin: AdminCtx; nextDay: number; onDone: () => void }) {
  const { league, act } = admin;
  const { season, players, matches } = league!;
  const [date, setDate] = useState(todayInput);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"perPlayer" | "total">("total");
  const [count, setCount] = useState(3);
  const [notify, setNotify] = useState(true);
  const [showWho, setShowWho] = useState(false);
  const [busy, setBusy] = useState(false);

  const here = players.filter((p) => !absent.has(p.id));
  const n = here.length;
  const max = mode === "perPlayer" ? MAX_MATCHES_PER_PLAYER : MAX_MATCHES_PER_DAY;
  const total = mode === "perPlayer" ? Math.floor((n * count) / 2) : count;
  const possible = (players.length * (players.length - 1)) / 2;
  const metPairs = new Set(matches.map((m) => [m.player1Id, m.player2Id].sort().join())).size;
  const toggle = (id: string) =>
    setAbsent((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        The app picks the players: whoever has played least goes first (random among equals), and players who haven’t met yet are paired first. Pairings
        played so far:{" "}
        <span className="num font-semibold text-ink">
          {metPairs} of {possible}
        </span>
        .
      </p>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputClass, "h-10 text-[15px]")} />
      </Field>
      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">How many matches</span>
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setCount(m === "total" ? 3 : 1);
          }}
          options={[
            { value: "total", label: "Total today" },
            { value: "perPlayer", label: "Per player" },
          ]}
        />
        <div className="mt-3 flex items-center gap-3">
          <button type="button" aria-label="Fewer" disabled={count <= 1} onClick={() => setCount(count - 1)} className={buttonClass("secondary", "md", "w-11 px-0")}>
            −
          </button>
          <span className="num w-10 text-center font-display text-[26px] font-semibold">{count}</span>
          <button type="button" aria-label="More" disabled={count >= max} onClick={() => setCount(count + 1)} className={buttonClass("secondary", "md", "w-11 px-0")}>
            +
          </button>
          <span className="text-sm text-ink-2">{mode === "perPlayer" ? (count === 1 ? "match each" : "matches each") : count === 1 ? "match today" : "matches today"}</span>
        </div>
        {n >= 2 && (
          <p className="mt-1.5 text-[12px] text-ink-3">
            {mode === "perPlayer"
              ? `${total} matches today. Everyone here plays ${count}${(n * count) % 2 ? `, except one player who plays ${count - 1}` : ""}.`
              : 2 * total >= n
                ? `${total} matches today. Everyone here plays${2 * total > n ? ", some more than once" : ""}.`
                : `${total} matches today: the app picks ${2 * total} of the ${n} players here. The others go first next time.`}
          </p>
        )}
      </div>
      <div>
        <button type="button" onClick={() => setShowWho(!showWho)} aria-expanded={showWho} className="flex w-full items-center justify-between text-left">
          <span className="text-[13px] font-medium text-ink-2">
            Who can play today · {n}/{players.length}
          </span>
          <span className="text-[13px] font-medium text-ink-3">{showWho ? "Hide" : absent.size ? "Change" : "Everyone · change"}</span>
        </button>
        <ul hidden={!showWho} className="mt-2 flex flex-wrap gap-2">
          {players.map((p) => {
            const on = !absent.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p.id)}
                  className={cn("flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px] ring-1 ring-inset", on ? "bg-ink text-bg ring-ink" : "bg-surface-2 text-ink-3 ring-line line-through")}
                >
                  <Avatar name={p.name} size={24} />
                  {p.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-5" />
        <span className="text-sm">Message the players on Telegram with their matches</span>
      </label>
      <button
        type="button"
        disabled={busy || n < 2 || total < 1 || !date}
        onClick={async () => {
          setBusy(true);
          const ok = await act(
            { action: "addMatchDay", seasonId: season!.id, date, playerIds: here.map((p) => p.id), mode, count, notify },
            `Day ${nextDay} added: ${total} matches.${notify ? " Players are being notified." : ""}`,
          );
          setBusy(false);
          if (ok) onDone();
        }}
        className={buttonClass("primary", "lg", "w-full")}
      >
        {busy ? "Creating…" : n < 2 ? "Pick at least 2 players" : `Create Day ${nextDay} · ${total} matches`}
      </button>
    </div>
  );
}

function Results({ admin }: { admin: AdminCtx }) {
  const { players, matches, season } = admin.league!;
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const days = [...new Set(matches.map((m) => m.day))].sort((a, b) => b - a);
  const latest = days[0] ?? 0;
  // A new day (or a deleted one) jumps the picker back to the latest day.
  const [picked, setPicked] = useState<{ day: number; latest: number } | null>(null);
  const shown = picked && picked.latest === latest && days.includes(picked.day) ? picked.day : latest;
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  if (!matches.length) {
    return <EmptyState title="No matches yet" body={season!.status === "active" ? "Plan the first match day above." : undefined} />;
  }

  const q = query.trim().toLowerCase();
  const list = (q ? matches.filter((m) => [m.player1Id, m.player2Id].some((id) => byId.get(id)?.name.toLowerCase().includes(q))) : matches.filter((m) => m.day === shown)).sort(
    byDayThenOrder,
  );
  const todo = list.filter((m) => !played(m));
  const done = list.filter(played);
  const ofDay = (d: number) => matches.filter((m) => m.day === d);
  const name = (id: string) => byId.get(id)?.name ?? "Removed player";

  const removeDay = async () => {
    const left = ofDay(shown).filter((m) => !played(m)).length;
    if (await admin.confirm(`Remove the ${left} unplayed matches of Day ${shown}?\n\nResults already saved for that day are kept.`)) {
      await admin.act({ action: "removeMatchDay", seasonId: season!.id, day: shown }, `Day ${shown}: unplayed matches removed.`);
    }
  };

  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">Results</h2>
      <div className="mb-3 space-y-2">
        <div className="flex gap-2">
          <select
            aria-label="Match day"
            value={shown}
            disabled={!!q}
            onChange={(e) => setPicked({ day: Number(e.target.value), latest })}
            className={cn(inputClass, "h-10 min-w-0 flex-1 text-[15px] disabled:opacity-50")}
          >
            {days.map((d) => {
              const all = ofDay(d);
              return (
                <option key={d} value={d}>
                  {dayTitle(d, all[0].dayDate)} · {all.filter(played).length}/{all.length} saved
                </option>
              );
            })}
          </select>
          {!q && season!.status === "active" && ofDay(shown).some((m) => !played(m)) && (
            <button type="button" onClick={removeDay} className={buttonClass("ghost", "md", "shrink-0 text-danger!")}>
              Remove unplayed
            </button>
          )}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a player in any day…" className={cn(inputClass, "h-10 text-[15px]")} />
      </div>

      {todo.length > 0 ? (
        <div className="space-y-2.5">
          {todo.map((m) => (
            <ScoreRow key={`${m.id}:${m.score1}:${m.score2}`} match={m} byId={byId} games={season!.gamesPerMatch} admin={admin} withDay={!!q} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-win-soft px-4 py-3 text-sm font-medium text-win">
          {q ? (done.length ? "All their matches are saved ✓" : "No matches found.") : `All Day ${shown} results are saved ✓`}
        </p>
      )}

      {done.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Saved · {done.length}</h3>
          <ul className="divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
            {done.map((m) =>
              editing === m.id ? (
                <li key={m.id} className="p-2">
                  <ScoreRow match={m} byId={byId} games={season!.gamesPerMatch} admin={admin} withDay={!!q} onFinished={() => setEditing(null)} />
                </li>
              ) : (
                <li key={m.id}>
                  <button type="button" onClick={() => setEditing(m.id)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
                    <span className="num w-14 shrink-0 text-[12px] text-ink-3">{q ? `Day ${m.day}` : `Match ${m.round}`}</span>
                    <span className="num min-w-0 flex-1 truncate text-[14px]">
                      <span className={m.score1! > m.score2! ? "font-semibold" : "text-ink-2"}>{name(m.player1Id)}</span>
                      <span className="mx-1.5 font-semibold">
                        {m.score1}–{m.score2}
                      </span>
                      <span className={m.score2! > m.score1! ? "font-semibold" : "text-ink-2"}>{name(m.player2Id)}</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-medium text-ink-3">Edit</span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

function ScoreRow({
  match,
  byId,
  games,
  admin,
  withDay,
  onFinished,
}: {
  match: Match;
  byId: Map<string, LeaguePlayer>;
  games: number;
  admin: AdminCtx;
  withDay?: boolean;
  onFinished?: () => void;
}) {
  const saved: [number, number] | null = played(match) ? [match.score1!, match.score2!] : null;
  const [pick, setPick] = useState(saved);
  const [busy, setBusy] = useState(false);
  const changed = !!pick && (!saved || pick[0] !== saved[0] || pick[1] !== saved[1]);
  const lead = pick ? (pick[0] > pick[1] ? 1 : 2) : null;
  const options = scoreOptions(games);
  const half = options.length / 2;
  const name = (id: string) => byId.get(id)?.name ?? "?";
  const first = (id: string) => name(id).split(" ")[0];

  const save = async (score: [number, number] | null) => {
    setBusy(true);
    const ok = await admin.act({ action: "setScore", matchId: match.id, score1: score?.[0] ?? null, score2: score?.[1] ?? null }, score ? "Result saved." : "Result cleared.");
    setBusy(false);
    if (ok && !score) setPick(null);
    if (ok) onFinished?.();
  };

  const line = (id: string, side: 1 | 2) => (
    <div className="flex items-center gap-3">
      <Avatar name={name(id)} size={28} />
      <span className={cn("min-w-0 flex-1 truncate text-[15px]", lead === side ? "font-semibold" : "font-medium", lead && lead !== side && "text-ink-3")}>
        {name(id)}
        {lead === side && <span className="ml-1.5 text-[12px] font-semibold text-win">wins</span>}
      </span>
      <span className={cn("num w-8 text-center font-display text-[22px] font-semibold", !pick && "text-ink-3")}>{pick ? pick[side - 1] : "–"}</span>
    </div>
  );

  const choices = (label: string, list: [number, number][]) => (
    <div>
      <p className="mb-1 truncate text-[12px] text-ink-3">{label}</p>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${list.length}, 1fr)` }}>
        {list.map(([a, b]) => {
          const on = pick?.[0] === a && pick?.[1] === b;
          return (
            <button
              key={`${a}-${b}`}
              type="button"
              aria-pressed={on}
              onClick={() => setPick([a, b])}
              className={cn("num h-10 rounded-lg text-[15px] font-semibold ring-1 ring-inset", on ? "bg-ink text-bg ring-ink" : "bg-surface-2 ring-line")}
            >
              {a}–{b}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={cn("rounded-2xl bg-surface p-3.5 ring-1", saved ? "ring-line" : "ring-line-strong")}>
      <div className="mb-2 flex items-center justify-between text-[12px] text-ink-3">
        <span>{withDay ? `${dayTitle(match.day, match.dayDate)} · Match ${match.round}` : `Match ${match.round}`}</span>
        {saved && <span className="font-medium text-win">Saved</span>}
      </div>
      <div className="space-y-2">
        {line(match.player1Id, 1)}
        {line(match.player2Id, 2)}
      </div>
      <div className="mt-3 space-y-2">
        {choices(`${first(match.player1Id)} won`, options.slice(0, half))}
        {choices(`${first(match.player2Id)} won`, options.slice(half))}
      </div>
      {(changed || saved) && (
        <div className="mt-3 flex gap-2">
          {changed && (
            <>
              <button type="button" disabled={busy} onClick={() => save(pick)} className={buttonClass("primary", "md", "flex-1")}>
                {busy ? "Saving…" : "Save result"}
              </button>
              <button type="button" disabled={busy} onClick={() => setPick(saved)} className={buttonClass("ghost", "md")}>
                Undo
              </button>
            </>
          )}
          {saved && !changed && (
            <>
              {onFinished && (
                <button type="button" onClick={onFinished} className={buttonClass("secondary", "sm")}>
                  Close
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => save(null)} className={buttonClass("ghost", "sm", "ml-auto text-ink-3")}>
                Clear result
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Players ─────────────────────────────────────────────────────────────────

function PlayersAdmin({ admin }: { admin: AdminCtx }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminPlayer | null>(null);
  const { players } = admin;
  if (!players) return <p className="py-10 text-center text-sm text-ink-3">Loading…</p>;

  const q = query.trim().toLowerCase();
  const list = players.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.major.toLowerCase().includes(q) || p.username?.toLowerCase().includes(q) || String(p.telegramId).includes(q),
  );

  return (
    <div className="space-y-3">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, major, @username, ID…" className={cn(inputClass, "h-10 text-[15px]")} />
      {list.length === 0 ? (
        <EmptyState title={players.length ? "No matches" : "No players yet"} body={players.length ? undefined : "Players appear here after they register in the app."} />
      ) : (
        <ul className="divide-y divide-line rounded-2xl bg-surface ring-1 ring-line">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setEditing(p)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
                <Avatar name={p.name} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium">{p.name}</span>
                    {p.banned && <Pill tone="danger">Banned</Pill>}
                  </span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {p.major} · {yearLabel(p.year)}
                    {p.username ? ` · @${p.username}` : ""}
                  </span>
                </span>
                <span className="text-ink-3" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <PlayerEditor player={editing} admin={admin} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PlayerEditor({ player, admin, onClose }: { player: AdminPlayer; admin: AdminCtx; onClose: () => void }) {
  const [name, setName] = useState(player.name);
  const [study, setStudy] = useState<Study>({ major: player.major, year: player.year });
  const [busy, setBusy] = useState(false);

  return (
    <Sheet title="Edit player" onClose={onClose}>
      <p className="mb-4 text-[13px] text-ink-3">
        Telegram ID <span className="num font-medium text-ink-2">{player.telegramId}</span>
        {player.username && (
          <>
            {" · "}
            <a href={`https://t.me/${player.username}`} className="font-medium text-live">
              @{player.username}
            </a>
          </>
        )}
      </p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!study.major || !study.year) return;
          setBusy(true);
          const ok = await admin.act({ action: "updatePlayer", playerId: player.id, name, major: study.major, year: study.year }, "Player saved.");
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <Field label="Full name">
          <input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <StudyFields value={study} onChange={setStudy} />
        <button type="submit" disabled={busy || !study.major || !study.year} className={buttonClass("primary", "lg", "w-full")}>
          Save
        </button>
      </form>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          const msg = player.banned
            ? `Unban ${player.name}? They'll be able to join seasons again.`
            : `Ban ${player.name}?\n\nThey can't join seasons, and they're removed from any season that hasn't started yet. A season already in progress isn't changed; remove them there if needed.`;
          if (!(await admin.confirm(msg))) return;
          if (await admin.act({ action: "setBanned", playerId: player.id, banned: !player.banned }, player.banned ? "Player unbanned." : "Player banned.")) onClose();
        }}
        className={buttonClass(player.banned ? "secondary" : "ghost", "lg", cn("mt-3 w-full", !player.banned && "text-danger!"))}
      >
        {player.banned ? "Unban player" : "Ban player"}
      </button>
    </Sheet>
  );
}
