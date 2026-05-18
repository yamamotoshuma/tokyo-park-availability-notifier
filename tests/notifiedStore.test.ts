import { describe, expect, it } from "vitest";
import { findNewSlots } from "../src/notifiedStore.js";
import type { AvailabilitySlot, NotifiedState } from "../src/types.js";

function createSlot(key: string): AvailabilitySlot {
  return {
    key,
    date: "2026-05-30",
    ymd: "20260530",
    weekday: "土",
    parkName: "浮間公園",
    facilityName: "野球場",
    purposeLabel: "野球",
    startTime: "09:00",
    endTime: "11:00",
    availableCount: 1,
    rawReserveValue: "11000010_20260530_900_0",
    pageUrl: "https://example.test",
    detectedAt: "2026-05-18T00:00:00.000Z",
  };
}

describe("findNewSlots", () => {
  it("does not return already notified availability slots", () => {
    const known = createSlot("known");
    const next = createSlot("next");
    const state: NotifiedState = {
      lastRunAt: "2026-05-18T00:00:00.000Z",
      notified: [
        {
          key: known.key,
          firstNotifiedAt: "2026-05-18T00:00:00.000Z",
          lastSeenAt: "2026-05-18T00:00:00.000Z",
          slot: known,
        },
      ],
    };

    expect(findNewSlots([known, next], state).map((slot) => slot.key)).toEqual(["next"]);
  });
});
