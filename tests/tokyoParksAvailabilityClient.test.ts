import { describe, expect, it } from "vitest";
import { __privateForTests } from "../src/tokyoParksAvailabilityClient.js";
import type { AvailabilitySlot, TokyoParksConfig } from "../src/types.js";

const baseConfig: TokyoParksConfig = {
  baseUrl: "https://kouen.sports.metro.tokyo.lg.jp/web/index.jsp",
  purposeValue: "1000_1000",
  purposeLabel: "野球",
  parkName: "浮間公園",
  parkValue: "1100",
  facilityName: "野球場",
  targetSaturdayOccurrences: [1, 3, 5],
  includeNextMonthFromDay: 22,
  includePastDates: false,
  excludeStartingAtOrAfter: "19:00",
  headless: true,
  navigationTimeoutMs: 45_000,
  settleMs: 2_500,
};

function slot(startTime: string): AvailabilitySlot {
  return {
    key: startTime,
    date: "2026-06-06",
    ymd: "20260606",
    weekday: "土",
    parkName: "浮間公園",
    facilityName: "野球場",
    purposeLabel: "野球",
    startTime,
    endTime: "21:00",
    availableCount: 1,
    rawReserveValue: null,
    pageUrl: "https://example.com",
    detectedAt: "2026-05-31T00:00:00.000Z",
  };
}

describe("filterAvailabilitySlots", () => {
  it("excludes slots starting at or after the configured time", () => {
    const slots = [slot("17:00"), slot("19:00"), slot("21:00")];

    expect(__privateForTests.filterAvailabilitySlots(slots, baseConfig).map((item) => item.startTime)).toEqual([
      "17:00",
    ]);
  });

  it("keeps all slots when the time filter is disabled", () => {
    const slots = [slot("17:00"), slot("19:00")];

    expect(
      __privateForTests
        .filterAvailabilitySlots(slots, { ...baseConfig, excludeStartingAtOrAfter: null })
        .map((item) => item.startTime),
    ).toEqual(["17:00", "19:00"]);
  });
});
