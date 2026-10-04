"use client";

import { useEffect } from "react";
import { buttonClass } from "@/components/ui/primitives";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="text-[17px] font-semibold">Something went wrong</h1>
        <p className="mt-1 text-sm text-ink-2">{process.env.NODE_ENV === "development" ? error.message : "Please try again."}</p>
        <button type="button" onClick={reset} className={buttonClass("primary", "md", "mt-4")}>
          Try again
        </button>
      </div>
    </main>
  );
}
