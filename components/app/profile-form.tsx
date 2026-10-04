"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { YEARS, type MeResponse, type Profile, type Year } from "@/lib/league/types";
import { buttonClass } from "@/components/ui/primitives";
import type { Api } from "./telegram";

export const inputClass =
  "h-12 w-full rounded-xl bg-surface px-3.5 text-[16px] text-ink ring-1 ring-inset ring-line-strong placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ink";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
    </label>
  );
}

export function YearPicker({ value, onChange }: { value: Year | ""; onChange: (y: Year) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Year">
      {YEARS.map((y) => (
        <button
          key={y.value}
          type="button"
          role="radio"
          aria-checked={value === y.value}
          onClick={() => onChange(y.value)}
          className={cn(
            "h-11 rounded-xl text-[13px] font-medium ring-1 ring-inset transition-colors",
            value === y.value ? "bg-ink text-bg ring-ink" : "bg-surface text-ink ring-line-strong",
          )}
        >
          {y.label}
        </button>
      ))}
    </div>
  );
}

export function MajorInput({ value, onChange, majors }: { value: string; onChange: (v: string) => void; majors: string[] }) {
  if (majors.length) {
    return (
      <select required value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="" disabled>
          Choose your major
        </option>
        {majors.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    );
  }
  return <input required minLength={2} maxLength={60} value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. Computer Science" className={inputClass} />;
}

export function ProfileForm({
  api,
  me,
  submitLabel,
  onSaved,
}: {
  api: Api;
  me: MeResponse;
  submitLabel: string;
  onSaved: (player: Profile) => void;
}) {
  const [name, setName] = useState(me.player?.name ?? [me.firstName, me.lastName].filter(Boolean).join(" "));
  const [major, setMajor] = useState(me.player?.major ?? "");
  const [year, setYear] = useState<Year | "">(me.player?.year ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!year) return setError("Choose your year.");
        setBusy(true);
        setError(null);
        try {
          const { player } = await api.post<{ player: Profile }>("/api/me", { name, major, year });
          onSaved(player);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't save.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Full name">
        <input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inputClass} />
      </Field>
      <Field label="Major">
        <MajorInput value={major} onChange={setMajor} majors={me.majors} />
      </Field>
      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Year</span>
        <YearPicker value={year} onChange={setYear} />
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={buttonClass("primary", "lg", "w-full")}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
