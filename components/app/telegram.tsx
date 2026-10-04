"use client";

// Telegram Mini App runtime: https://core.telegram.org/bots/webapps

export interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  onEvent(event: "themeChanged", cb: () => void): void;
  isVersionAtLeast?(version: string): boolean;
  showConfirm?(message: string, cb: (ok: boolean) => void): void;
  HapticFeedback?: { notificationOccurred(type: "success" | "error"): void; selectionChanged(): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SCRIPT_SRC = "https://telegram.org/js/telegram-web-app.js";

export function loadTelegram(): Promise<TelegramWebApp | null> {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    const done = () => resolve(window.Telegram?.WebApp ?? null);
    s.src = SCRIPT_SRC;
    s.async = true;
    s.addEventListener("load", done, { once: true });
    s.addEventListener("error", () => resolve(null), { once: true });
    document.head.appendChild(s);
    setTimeout(done, 4000);
  });
}

export function applyTelegramTheme(webApp: TelegramWebApp) {
  const apply = () => (document.documentElement.dataset.theme = webApp.colorScheme);
  webApp.ready();
  webApp.expand();
  apply();
  webApp.onEvent("themeChanged", apply);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface Api {
  get<T>(path: string): Promise<T>;
  post<T = { ok: true }>(path: string, body: unknown): Promise<T>;
}

export function createApi(authHeader: string): Api {
  const request = async <T,>(path: string, init: RequestInit): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(path, { ...init, cache: "no-store", headers: { ...init.headers, authorization: authHeader } });
    } catch {
      throw new ApiError("No connection. Check your internet and try again.", 0);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError((body as { error?: string } | null)?.error ?? "Something went wrong.", res.status);
    return body as T;
  };
  return {
    get: (path) => request(path, {}),
    post: (path, body) => request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  };
}

// window.confirm is blocked in some Telegram clients; use the native popup when available.
export function confirmDialog(webApp: TelegramWebApp | null, message: string): Promise<boolean> {
  if (webApp?.initData && webApp.showConfirm && webApp.isVersionAtLeast?.("6.2")) {
    return new Promise((resolve) => webApp.showConfirm!(message, resolve));
  }
  return Promise.resolve(window.confirm(message));
}
