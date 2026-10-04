"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { BACHELOR_YEARS, degreeOfMajor, MAJORS, type Degree, type MeResponse, type Profile, type Year } from "@/lib/league/types";
import { buttonClass } from "@/components/ui/primitives";
import type { Api } from "./telegram";
import { Segmented } from "./ui";

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

function YearPicker({ value, onChange }: { value: Year | ""; onChange: (y: Year) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Year">
      {BACHELOR_YEARS.map((y) => (
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

export interface Study {
  major: string;
  year: Year | "";
}

/** Bachelor's or Master's, then a major from that list; bachelor's students also pick a year. */
export function StudyFields({ value, onChange }: { value: Study; onChange: (v: Study) => void }) {
  const [degree, setDegree] = useState<Degree>(degreeOfMajor(value.major) ?? (value.year === "masters" ? "masters" : "bachelors"));
  const choose = (d: Degree) => {
    setDegree(d);
    onChange({
      major: degreeOfMajor(value.major) === d ? value.major : "",
      year: d === "masters" ? "masters" : value.year === "masters" ? "" : value.year,
    });
  };

  return (
    <>
      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Degree</span>
        <Segmented
          value={degree}
          onChange={choose}
          options={[
            { value: "bachelors", label: "Bachelor’s" },
            { value: "masters", label: "Master’s" },
          ]}
        />
      </div>
      <Field label="Major">
        <select required value={value.major} onChange={(e) => onChange({ ...value, major: e.target.value })} className={inputClass}>
          <option value="" disabled>
            Choose your major
          </option>
          {MAJORS[degree].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      {degree === "bachelors" && (
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Year</span>
          <YearPicker value={value.year} onChange={(year) => onChange({ ...value, year })} />
        </div>
      )}
    </>
  );
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
  const [study, setStudy] = useState<Study>({
    major: degreeOfMajor(me.player?.major ?? "") ? me.player!.major : "",
    year: me.player?.year ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!study.major) return setError("Choose your major.");
        if (!study.year) return setError("Choose your year.");
        setBusy(true);
        setError(null);
        try {
          const { player } = await api.post<{ player: Profile }>("/api/me", { name, ...study });
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
      <StudyFields value={study} onChange={setStudy} />
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
