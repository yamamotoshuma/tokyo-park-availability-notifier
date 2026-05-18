import { describe, expect, it } from "vitest";
import { buildTargetDates, getNthWeekdayOfMonth } from "../src/dateTargets.js";

describe("getNthWeekdayOfMonth", () => {
  it("returns the fifth Saturday only when it exists", () => {
    expect(getNthWeekdayOfMonth(2026, 4, 6, 5)?.getDate()).toBe(30);
    expect(getNthWeekdayOfMonth(2026, 5, 6, 5)).toBeNull();
  });
});

describe("buildTargetDates", () => {
  it("uses current month first, third, and fifth Saturdays and skips past dates", () => {
    const targets = buildTargetDates({
      referenceDate: new Date(2026, 4, 18, 12),
      occurrences: [1, 3, 5],
      includeNextMonthFromDay: 22,
      includePastDates: false,
    });

    expect(targets.map((target) => target.isoDate)).toEqual(["2026-05-30"]);
  });

  it("includes next month from the official open-booking day", () => {
    const targets = buildTargetDates({
      referenceDate: new Date(2026, 4, 22, 12),
      occurrences: [1, 3, 5],
      includeNextMonthFromDay: 22,
      includePastDates: false,
    });

    expect(targets.map((target) => target.isoDate)).toEqual(["2026-05-30", "2026-06-06", "2026-06-20"]);
  });
});
