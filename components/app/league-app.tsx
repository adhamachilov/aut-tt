"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { LeagueResponse, MeResponse } from "@/lib/league/types";
import { buttonClass, Skeleton } from "@/components/ui/primitives";
import { AdminTab } from "./admin";
import { HomeTab } from "./home";
import { MatchesTab } from "./matches";
import { PlayerSheet, TableTab } from "./standings";
import { ProfileForm } from "./profile-form";
import { ApiError, applyTelegramTheme, confirmDialog, createApi, loadTelegram, type Api, type TelegramWebApp } from "./telegram";

type Tab = "home" | "matches" | "table" | "admin";

interface LeagueCtx {
  me: MeResponse;
  setMe: (me: MeResponse) => void;
  api: Api;
  league: LeagueResponse | null;
  loadError: string | null;
  reload: () => Promise<void>;
  setSeasonId: (id: string) => void;
  openPlayer: (id: string) => void;
  goTo: (tab: Tab) => void;
  confirm: (message: string) => Promise<boolean>;
  /** Runs a change, reloads the league and reports success or the error. Returns whether it worked. */
  run: (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;
}

const Ctx = createContext<LeagueCtx | null>(null);

export function useLeague(): LeagueCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLeague must be used inside <LeagueApp>");
  return ctx;
}

type Boot =
  | { status: "loading" }
  | { status: "outside"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; me: MeResponse; api: Api; webApp: TelegramWebApp | null };

export function LeagueApp() {
  const [boot, setBoot] = useState<Boot>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const webApp = await loadTelegram();
      if (cancelled) return;
      if (webApp?.initData) applyTelegramTheme(webApp);
      // Outside Telegram we send "dev"; the server accepts it only in development with opt-in.
      const api = createApi(webApp?.initData ? `tma ${webApp.initData}` : "dev");
      try {
        const me = await api.get<MeResponse>("/api/me");
        if (!cancelled) setBoot({ status: "ready", me, api, webApp });
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Couldn't load the league.";
        setBoot(e instanceof ApiError && e.status === 401 ? { status: "outside", message } : { status: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (boot.status === "loading") return <LoadingScreen />;
  if (boot.status === "outside") return <Message title="Open in Telegram" body={boot.message} />;
  if (boot.status === "error") return <Message title="Couldn’t load the league" body={boot.message} retry />;
  return <Ready initialMe={boot.me} api={boot.api} webApp={boot.webApp} />;
}

function Ready({ initialMe, api, webApp }: { initialMe: MeResponse; api: Api; webApp: TelegramWebApp | null }) {
  const [me, setMe] = useState(initialMe);
  const [tab, setTab] = useState<Tab>("home");
  const [league, setLeague] = useState<LeagueResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const seasonRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const wanted = seasonRef.current;
    try {
      const data = await api.get<LeagueResponse>(`/api/league${wanted ? `?season=${encodeURIComponent(wanted)}` : ""}`);
      if (seasonRef.current === wanted) {
        setLeague(data);
        setLoadError(null);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load the league.");
    }
  }, [api]);

  const setSeasonId = useCallback(
    (id: string) => {
      seasonRef.current = id;
      void reload();
    },
    [reload],
  );

  // Refresh when the app comes back into view and every 30s, so new results show up.
  useEffect(() => {
    if (!me.player) return;
    void reload();
    const onVisible = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(onVisible, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [me.player, reload]);

  const notify = useCallback(
    (text: string, tone: "ok" | "error") => {
      webApp?.HapticFeedback?.notificationOccurred(tone === "ok" ? "success" : "error");
      setToast({ text, tone });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 3200);
    },
    [webApp],
  );

  const run = useCallback(
    async (fn: () => Promise<unknown>, success?: string) => {
      try {
        await fn();
        await reload();
        if (success) notify(success, "ok");
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : "Something went wrong.", "error");
        return false;
      }
    },
    [notify, reload],
  );

  const confirm = useCallback((message: string) => confirmDialog(webApp, message), [webApp]);

  const goTo = useCallback((t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  }, []);

  if (!me.player) {
    return (
      <Shell dev={me.dev}>
        <div className="pt-6">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-3">{me.leagueName}</p>
          <h1 className="mt-2 font-display text-[40px] font-semibold uppercase leading-none">Join the league</h1>
          <p className="mt-2 text-[15px] text-ink-2">Tell us who you are. You only do this once.</p>
          <div className="mt-6">
            <ProfileForm
              api={api}
              me={me}
              submitLabel="Register"
              onSaved={(player) => setMe({ ...me, player })}
            />
          </div>
        </div>
      </Shell>
    );
  }

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "home", label: "Home", icon: <HomeIcon /> },
    { id: "matches", label: "Matches", icon: <BallIcon /> },
    { id: "table", label: "Table", icon: <TableIcon /> },
    ...(me.isAdmin ? [{ id: "admin" as const, label: "Admin", icon: <GearIcon /> }] : []),
  ];

  const value: LeagueCtx = {
    me,
    setMe,
    api,
    league,
    loadError,
    reload,
    setSeasonId,
    openPlayer: setPlayerId,
    goTo,
    confirm,
    run,
  };

  return (
    <Ctx.Provider value={value}>
      <Shell dev={me.dev}>
        {!league && !loadError ? (
          <LoadingBody />
        ) : !league ? (
          <div className="py-16 text-center">
            <p className="font-semibold">Couldn’t load the league</p>
            <p className="mt-1 text-sm text-ink-2">{loadError}</p>
            <button type="button" onClick={() => void reload()} className={buttonClass("primary", "md", "mt-4")}>
              Retry
            </button>
          </div>
        ) : (
          <>
            {tab === "home" && <HomeTab />}
            {tab === "matches" && <MatchesTab />}
            {tab === "table" && <TableTab />}
            {tab === "admin" && me.isAdmin && <AdminTab />}
          </>
        )}
      </Shell>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  if (t.id !== tab) webApp?.HapticFeedback?.selectionChanged();
                  goTo(t.id);
                }}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn("flex w-full flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-medium", tab === t.id ? "text-ink" : "text-ink-3")}
              >
                {t.icon}
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {toast && (
        <div
          role="status"
          className={cn(
            "fixed inset-x-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-md animate-fade-up rounded-xl px-4 py-3 text-sm font-medium shadow-lg",
            toast.tone === "ok" ? "bg-ink text-bg" : "bg-danger text-white",
          )}
        >
          {toast.text}
        </div>
      )}

      {playerId && league && <PlayerSheet playerId={playerId} onClose={() => setPlayerId(null)} />}
    </Ctx.Provider>
  );
}

function Shell({ dev, children }: { dev: boolean; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      {dev && <div className="bg-warn-soft px-4 py-1.5 text-center text-[12px] font-medium text-warn">Development mode · not opened from Telegram</div>}
      <main className="px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-4">{children}</main>
    </div>
  );
}

function LoadingBody() {
  return (
    <div className="space-y-4 pt-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-6">
      <LoadingBody />
    </div>
  );
}

function Message({ title, body, retry }: { title: string; body: string; retry?: boolean }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-xs">
        <span aria-hidden className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-accent">
          <span className="size-4 rounded-full bg-white" />
        </span>
        <p className="font-display text-[26px] font-semibold uppercase leading-tight">{title}</p>
        <p className="mt-2 text-sm text-ink-2">{body}</p>
        {retry && (
          <button type="button" className={buttonClass("primary", "md", "mt-6")} onClick={() => location.reload()}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const HomeIcon = () => (
  <Icon>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />
  </Icon>
);
const BallIcon = () => (
  <Icon>
    <circle cx="9" cy="9" r="5" />
    <path d="m12.5 12.5 6.5 6.5M16 21l5-5" />
  </Icon>
);
const TableIcon = () => (
  <Icon>
    <path d="M4 6h16M4 12h16M4 18h16M8 6v12" />
  </Icon>
);
const GearIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
);
