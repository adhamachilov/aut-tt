"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { LeaguePlayer, Match } from "@/lib/league/types";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = 36, highlight }: { name: string; size?: number; highlight?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        highlight ? "bg-accent text-accent-ink" : "bg-surface-3 text-ink-2",
      )}
    >
      {initials(name)}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="grid rounded-xl bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-9 rounded-lg text-sm font-medium transition-colors", value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative max-h-[88dvh] w-full max-w-xl animate-fade-up overflow-y-auto rounded-t-3xl bg-bg px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3 sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full bg-surface-2 text-ink-2" aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const played = (m: Match) => m.score1 !== null && m.score2 !== null;

export const winnerOf = (m: Match) => (!played(m) ? null : m.score1! > m.score2! ? m.player1Id : m.player2Id);

// One match, seen from `meId`'s side when they play in it (they go on the left).
export function MatchCard({
  match,
  players,
  meId,
  onPlayer,
  showRound = true,
}: {
  match: Match;
  players: Map<string, LeaguePlayer>;
  meId: string | null;
  onPlayer?: (id: string) => void;
  showRound?: boolean;
}) {
  const flip = match.player2Id === meId;
  const left = flip ? match.player2Id : match.player1Id;
  const right = flip ? match.player1Id : match.player2Id;
  const leftScore = flip ? match.score2 : match.score1;
  const rightScore = flip ? match.score1 : match.score2;
  const winner = winnerOf(match);
  const mine = left === meId;

  const side = (id: string, align: "left" | "right") => {
    const p = players.get(id);
    const name = p?.name ?? "Removed player";
    return (
      <button
        type="button"
        onClick={() => p && onPlayer?.(id)}
        className={cn("flex min-w-0 flex-1 items-center gap-2.5 text-left", align === "right" && "flex-row-reverse text-right")}
      >
        <Avatar name={name} size={34} highlight={id === meId} />
        <span className={cn("min-w-0 truncate text-[15px]", winner === id ? "font-semibold text-ink" : winner ? "text-ink-3" : "font-medium text-ink")}>
          {id === meId ? "You" : name}
        </span>
      </button>
    );
  };

  return (
    <div className={cn("rounded-2xl bg-surface px-3.5 py-3 ring-1", mine ? "ring-accent/40" : "ring-line")}>
      <div className="mb-2 flex items-center justify-between text-[12px] text-ink-3">
        <span>{showRound ? `Round ${match.round}` : ""}</span>
        {mine && winner && (
          <span className={cn("rounded-full px-2 py-0.5 font-semibold", winner === meId ? "bg-win-soft text-win" : "bg-loss-soft text-loss")}>
            {winner === meId ? "Won" : "Lost"}
          </span>
        )}
        {!winner && <span>Not played yet</span>}
      </div>
      <div className="flex items-center gap-3">
        {side(left, "left")}
        <div className="num shrink-0 text-center font-display text-[22px] font-semibold leading-none">
          {winner ? (
            <>
              <span className={winner === left ? "text-ink" : "text-ink-3"}>{leftScore}</span>
              <span className="mx-1 text-ink-3">–</span>
              <span className={winner === right ? "text-ink" : "text-ink-3"}>{rightScore}</span>
            </>
          ) : (
            <span className="text-[15px] font-medium uppercase text-ink-3">vs</span>
          )}
        </div>
        {side(right, "right")}
      </div>
    </div>
  );
}

export const formatDateTime = (iso: string) => new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));


// <input type="datetime-local"> works in local time without a zone.
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export const fromLocalInput = (value: string): string | null => (value ? new Date(value).toISOString() : null);
