import { describe, expect, it, vi } from "vitest";
import { addDays, nextMatchDate } from "@/components/app/ui";
import type { Match } from "@/lib/league/types";

const day = (dayDate: string | null) => ({ dayDate }) as Match;

describe("match dates", () => {
  it("adds calendar days across months and years", () => {
    expect(addDays("2026-10-05", 1)).toBe("2026-10-06");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("suggests the day after the latest match day, never a past date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 18, 0));
    expect(nextMatchDate([])).toBe("2026-10-05");
    expect(nextMatchDate([day("2026-10-05"), day("2026-10-06")])).toBe("2026-10-07");
    expect(nextMatchDate([day("2026-09-20")])).toBe("2026-10-05");
    vi.useRealTimers();
  });
});
