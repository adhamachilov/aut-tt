import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Shared, server-safe building blocks (no hooks). */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type ButtonSize = "sm" | "md" | "lg";

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[background,color,box-shadow,transform] duration-150",
    "disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] select-none whitespace-nowrap",
    size === "sm" && "h-8 px-3 text-[13px]",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-5 text-[15px]",
    variant === "primary" && "bg-ink text-bg hover:bg-ink/85",
    variant === "secondary" && "bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2",
    variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
    variant === "quiet" && "bg-surface-2 text-ink hover:bg-surface-3",
    variant === "danger" && "bg-danger text-white hover:bg-danger/90",
    extra,
  );
}

export function Card({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <Tag className={cn("rounded-2xl bg-surface ring-1 ring-line", className)}>{children}</Tag>;
}

export function SectionHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h2>
      {action}
    </div>
  );
}

export function PageTitle({ title, eyebrow, action, description }: { title: ReactNode; eyebrow?: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[13px] font-medium text-ink-3">{eyebrow}</div>}
        <h1 className="font-display text-[34px] font-semibold uppercase leading-none tracking-[0.01em] text-ink sm:text-[40px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-ink-2">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, body, action, className }: { title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center", className)}>
      <div aria-hidden className="mb-4 grid size-11 place-items-center rounded-full bg-surface-2">
        <span className="size-3 rounded-full bg-ink-3/60" />
      </div>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <div className="mt-1 max-w-sm text-sm text-ink-2">{body}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-shimmer rounded-lg bg-surface-3", className)} />;
}

export function StatCard({ label, value, hint, emphasis }: { label: string; value: ReactNode; hint?: ReactNode; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-2xl p-4 ring-1", emphasis ? "bg-ink text-bg ring-ink" : "bg-surface ring-line")}>
      <div className={cn("text-[12px] font-medium uppercase tracking-[0.08em]", emphasis ? "text-bg/60" : "text-ink-3")}>{label}</div>
      <div className="num mt-2 font-display text-[32px] font-semibold leading-none">{value}</div>
      {hint && <div className={cn("mt-1.5 text-[13px]", emphasis ? "text-bg/70" : "text-ink-2")}>{hint}</div>}
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="text-ink-2">{label}</span>
        <span className="num font-medium text-ink">
          {value} / {max} <span className="text-ink-3">· {pct}%</span>
        </span>
      </div>
      <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label} className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium", TONES[tone], className)}>{children}</span>
  );
}

export type Tone = "neutral" | "win" | "live" | "warn" | "muted" | "forfeit" | "accent" | "danger" | "ink";

export const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  win: "bg-win-soft text-win",
  live: "bg-live-soft text-live",
  warn: "bg-warn-soft text-warn",
  muted: "bg-surface-2 text-ink-3",
  forfeit: "bg-forfeit-soft text-forfeit",
  accent: "bg-accent-soft text-accent",
  danger: "bg-danger-soft text-danger",
  ink: "bg-ink text-bg",
};

export function Alert({ tone = "neutral", title, children }: { tone?: "neutral" | "warn" | "danger" | "win"; title?: string; children?: ReactNode }) {
  const t = { neutral: "bg-surface-2 text-ink-2", warn: "bg-warn-soft text-warn", danger: "bg-danger-soft text-danger", win: "bg-win-soft text-win" }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-xl px-4 py-3 text-sm", t)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
    </div>
  );
}
