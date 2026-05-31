import { describe, expect, it } from "vitest";
import { __privateForTests, parseJapaneseDateTime } from "../src/skytreeLeagueClient.js";
import type { SkytreeLeagueConfig, TargetDate } from "../src/types.js";

const baseConfig: SkytreeLeagueConfig = {
  enabled: true,
  loginUrl: "https://ts-league.com/team/order-made/login.php",
  scheduleUrl: "https://ts-league.com/team/order-made/schedule.php",
  targetSaturdayOccurrences: [1, 3, 5],
  includeNextMonthWhenRemainingTargetDatesAtMost: 1,
  includePastDates: false,
  targetAreas: [],
  listingStatuses: ["openWithGround"],
  excludeDeadlineLabels: ["締切", "終了", "調整中"],
  headless: true,
  navigationTimeoutMs: 45_000,
  settleMs: 1_000,
};

function target(ymd: string): TargetDate {
  return {
    ymd,
    isoDate: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
    year: Number(ymd.slice(0, 4)),
    month: Number(ymd.slice(4, 6)),
    day: Number(ymd.slice(6, 8)),
    occurrence: 1,
  };
}

function row(overrides: Record<string, unknown>) {
  return {
    listingStatus: "openWithGround",
    id: "23125",
    competitionType: "LG",
    dateTimeText: "2026シーズン 2026年06月06日 (土) 13： 00 -15： 00",
    area: "足立区",
    groundName: "上沼田東公園",
    hostTeam: "東京ペンギンズ",
    hostTeamUrl: "https://ts-league.com/team/penguins",
    className: "MIYABI D3",
    applicantTeam: null,
    note: "お世話になります。",
    deadlineText: "残り4日",
    detailUrl: "https://ts-league.com/team/order-made/schedule_view.php?Id=23125",
    ...overrides,
  };
}

describe("parseJapaneseDateTime", () => {
  it("parses full-width date and time text from Skytree League rows", () => {
    expect(parseJapaneseDateTime("2026シーズン\n2026年06月06日 (土)\n9： 00 -11： 00")).toEqual({
      ymd: "20260606",
      date: "2026-06-06",
      weekday: "土",
      startTime: "09:00",
      endTime: "11:00",
    });
  });
});

describe("filterListings", () => {
  it("keeps target dates and areas while excluding closed deadline labels", () => {
    const listings = __privateForTests.filterListings({
      rows: [
        row({ id: "1", area: "練馬区", groundName: "光ヶ丘公園", deadlineText: "残り6日" }),
        row({ id: "2", area: "大田区", groundName: "大井ふ頭海浜公園B", deadlineText: "残り4日" }),
        row({ id: "3", area: "練馬区", groundName: "光が丘公園", deadlineText: "締　切" }),
      ] as never,
      targets: [target("20260606")],
      config: {
        ...baseConfig,
        targetAreas: ["練馬区"],
      },
      detectedAt: "2026-05-31T00:00:00.000Z",
    });

    expect(listings.map((listing) => listing.id)).toEqual(["1"]);
    expect(listings[0]?.key).toBe("skytreeLeague|1");
  });
});
