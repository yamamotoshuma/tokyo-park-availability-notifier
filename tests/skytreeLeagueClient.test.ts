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
  competitionTypes: ["LG"],
  excludeWithinDays: 7,
  excludeStartingAtOrAfter: "19:00",
  excludedHostTeams: ["ORDERMADEBASEBALLclub"],
  ownTeamNames: ["ORDERMADE BASEBALL CLUB"],
  excludeDatesWithOwnTeamActivity: true,
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
      referenceDate: new Date(2026, 4, 20, 12),
    });

    expect(listings.map((listing) => listing.id)).toEqual(["1"]);
    expect(listings[0]?.key).toBe("skytreeLeague|1");
  });

  it("normalizes target areas for spaced wards and prefecture suffixes", () => {
    const listings = __privateForTests.filterListings({
      rows: [
        row({ id: "1", area: "北　区", groundName: "中央公園野球場" }),
        row({ id: "2", area: "埼玉", groundName: "所沢航空記念公園" }),
        row({ id: "3", area: "大田区", groundName: "多摩川緑地" }),
      ] as never,
      targets: [target("20260606")],
      config: {
        ...baseConfig,
        targetAreas: ["北区", "埼玉県"],
      },
      detectedAt: "2026-05-31T00:00:00.000Z",
      referenceDate: new Date(2026, 4, 20, 12),
    });

    expect(listings.map((listing) => listing.id)).toEqual(["1", "2"]);
  });

  it("excludes listings within the configured lead time", () => {
    const listings = __privateForTests.filterListings({
      rows: [
        row({ id: "1", dateTimeText: "2026シーズン 2026年06月06日 (土) 9： 00 -11： 00" }),
        row({ id: "2", dateTimeText: "2026シーズン 2026年06月13日 (土) 9： 00 -11： 00" }),
      ] as never,
      targets: [target("20260606"), target("20260613")],
      config: baseConfig,
      detectedAt: "2026-05-31T00:00:00.000Z",
      referenceDate: new Date(2026, 4, 31, 12),
    });

    expect(listings.map((listing) => listing.id)).toEqual(["2"]);
  });

  it("filters competition types when configured", () => {
    const listings = __privateForTests.filterListings({
      rows: [
        row({ id: "1", competitionType: "LG" }),
        row({ id: "2", competitionType: "RC" }),
      ] as never,
      targets: [target("20260606")],
      config: {
        ...baseConfig,
        competitionTypes: ["LG"],
      },
      detectedAt: "2026-05-31T00:00:00.000Z",
      referenceDate: new Date(2026, 4, 20, 12),
    });

    expect(listings.map((listing) => listing.id)).toEqual(["1"]);
  });

  it("excludes listings starting at or after the configured time", () => {
    const listings = __privateForTests.filterListings({
      rows: [
        row({ id: "1", dateTimeText: "2026年06月06日 (土) 18： 30 -20： 30" }),
        row({ id: "2", dateTimeText: "2026年06月06日 (土) 19： 00 -21： 00" }),
        row({ id: "3", dateTimeText: "2026年06月06日 (土) 21： 00 -23： 00" }),
      ] as never,
      targets: [target("20260606")],
      config: baseConfig,
      detectedAt: "2026-05-31T00:00:00.000Z",
      referenceDate: new Date(2026, 4, 20, 12),
    });

    expect(listings.map((listing) => listing.id)).toEqual(["1"]);
  });

  it("excludes configured host teams with normalized spelling", () => {
    const listings = __privateForTests.filterListings({
      rows: [
        row({ id: "1", hostTeam: "ORDERMADEBASEBALLclub" }),
        row({ id: "2", hostTeam: "Ordermade Baseball Club" }),
        row({ id: "3", hostTeam: "東京ペンギンズ" }),
      ] as never,
      targets: [target("20260606")],
      config: baseConfig,
      detectedAt: "2026-05-31T00:00:00.000Z",
      referenceDate: new Date(2026, 4, 20, 12),
    });

    expect(listings.map((listing) => listing.id)).toEqual(["3"]);
  });

  it("excludes every listing on an own-team occupied date", () => {
    const listings = __privateForTests.filterListings({
      rows: [
        row({ id: "1", hostTeam: "東京ペンギンズ" }),
        row({
          id: "2",
          dateTimeText: "2026年06月20日 (土) 13： 00 -15： 00",
          hostTeam: "東京ジュピターズ",
        }),
      ] as never,
      targets: [target("20260606"), target("20260620")],
      config: baseConfig,
      detectedAt: "2026-05-31T00:00:00.000Z",
      referenceDate: new Date(2026, 4, 20, 12),
      excludedYmds: ["20260620"],
    });

    expect(listings.map((listing) => listing.id)).toEqual(["1"]);
  });
});

describe("findOwnTeamOccupiedYmds", () => {
  it("finds dates where the own team is either host or applicant", () => {
    const occupiedYmds = __privateForTests.findOwnTeamOccupiedYmds(
      [
        {
          dateTimeText: "2026年06月20日 (土) 17： 00 -19： 00",
          hostTeam: "ORDERMADE BASEBALL CLUB",
          applicantTeam: null,
        },
        {
          dateTimeText: "2026年07月04日 (土) 9： 00 -11： 00",
          hostTeam: "東京ペンギンズ",
          applicantTeam: "Ordermade Baseball Club",
        },
        {
          dateTimeText: "2026年07月18日 (土) 9： 00 -11： 00",
          hostTeam: "東京ペンギンズ",
          applicantTeam: "別チーム",
        },
      ],
      ["ORDERMADEBASEBALLclub"],
    );

    expect(occupiedYmds).toEqual(["20260620", "20260704"]);
  });
});
