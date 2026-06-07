import { chromium, type Browser, type Page } from "playwright";
import type {
  SkytreeLeagueConfig,
  SkytreeLeagueListingStatus,
  SkytreeLeagueMatchListing,
  SkytreeLeagueSearchResult,
  SkytreeLeagueSecrets,
  TargetDate,
} from "./types.js";

const STATUS_LABELS: Record<SkytreeLeagueListingStatus, string> = {
  openWithGround: "募集中（グランド有り）",
  openWithoutGround: "募集中（グランドなし）",
};

interface ParsedDateTime {
  ymd: string;
  date: string;
  weekday: string;
  startTime: string;
  endTime: string;
}

interface RawSkytreeLeagueListingRow {
  listingStatus: SkytreeLeagueListingStatus;
  id: string;
  competitionType: string;
  dateTimeText: string;
  area: string;
  groundName: string;
  hostTeam: string;
  hostTeamUrl: string | null;
  className: string;
  applicantTeam: string | null;
  note: string;
  deadlineText: string;
  detailUrl: string;
}

interface RawOwnTeamActivityRow {
  dateTimeText: string;
  hostTeam: string;
  applicantTeam: string | null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeComparableText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").trim().toLowerCase();
}

export function parseJapaneseDateTime(value: string): ParsedDateTime | null {
  const normalized = value.normalize("NFKC");
  const dateMatch = normalized.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日\s*\(([^)]+)\)/);
  const timeMatch = normalized.match(/(\d{1,2})\s*:\s*(\d{1,2})\s*-\s*(\d{1,2})\s*:\s*(\d{1,2})/);
  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number.parseInt(dateMatch[1] ?? "", 10);
  const month = Number.parseInt(dateMatch[2] ?? "", 10);
  const day = Number.parseInt(dateMatch[3] ?? "", 10);
  const startHour = Number.parseInt(timeMatch[1] ?? "", 10);
  const startMinute = Number.parseInt(timeMatch[2] ?? "", 10);
  const endHour = Number.parseInt(timeMatch[3] ?? "", 10);
  const endMinute = Number.parseInt(timeMatch[4] ?? "", 10);
  if (![year, month, day, startHour, startMinute, endHour, endMinute].every(Number.isFinite)) {
    return null;
  }

  const ymd = `${year}${pad2(month)}${pad2(day)}`;
  return {
    ymd,
    date: `${year}-${pad2(month)}-${pad2(day)}`,
    weekday: normalizeDisplayText(dateMatch[4] ?? ""),
    startTime: `${pad2(startHour)}:${pad2(startMinute)}`,
    endTime: `${pad2(endHour)}:${pad2(endMinute)}`,
  };
}

function listingKey(id: string): string {
  return `skytreeLeague|${id}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function dateStringToLocalDay(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

export function normalizeAreaFilterText(value: string): string {
  return normalizeComparableText(value).replace(/[都道府県]$/u, "");
}

function shouldExcludeDeadline(deadlineText: string, excludeDeadlineLabels: string[]): boolean {
  const normalizedDeadline = normalizeComparableText(deadlineText);
  return excludeDeadlineLabels.some((label) => normalizedDeadline.includes(normalizeComparableText(label)));
}

function isWithinExcludedLeadTime(date: string, referenceDate: Date, excludeWithinDays: number): boolean {
  const listingDate = dateStringToLocalDay(date);
  if (!listingDate) {
    return false;
  }

  const normalizedReferenceDate = startOfLocalDay(referenceDate);
  const daysFromReference = Math.floor(
    (listingDate.getTime() - normalizedReferenceDate.getTime()) / (24 * 60 * 60 * 1000),
  );
  return daysFromReference <= Math.max(-1, Math.floor(excludeWithinDays));
}

function rawRowToListing(row: RawSkytreeLeagueListingRow, detectedAt: string): SkytreeLeagueMatchListing | null {
  const parsedDateTime = parseJapaneseDateTime(row.dateTimeText);
  if (!parsedDateTime || row.id === "") {
    return null;
  }

  return {
    key: listingKey(row.id),
    id: row.id,
    ...parsedDateTime,
    competitionType: normalizeDisplayText(row.competitionType),
    listingStatus: row.listingStatus,
    listingStatusLabel: STATUS_LABELS[row.listingStatus],
    area: normalizeDisplayText(row.area),
    groundName: normalizeDisplayText(row.groundName),
    hostTeam: normalizeDisplayText(row.hostTeam),
    hostTeamUrl: row.hostTeamUrl,
    className: normalizeDisplayText(row.className),
    applicantTeam: row.applicantTeam ? normalizeDisplayText(row.applicantTeam) : null,
    note: normalizeDisplayText(row.note),
    deadlineText: normalizeDisplayText(row.deadlineText),
    detailUrl: row.detailUrl,
    detectedAt,
  };
}

function filterListings(options: {
  rows: RawSkytreeLeagueListingRow[];
  targets: TargetDate[];
  config: SkytreeLeagueConfig;
  detectedAt: string;
  referenceDate: Date;
  excludedYmds?: string[];
}): SkytreeLeagueMatchListing[] {
  const targetYmds = new Set(options.targets.map((target) => target.ymd));
  const excludedYmds = new Set(options.excludedYmds ?? []);
  const targetAreas = options.config.targetAreas.map(normalizeAreaFilterText);
  const competitionTypes = options.config.competitionTypes.map(normalizeComparableText);
  const excludedHostTeams = options.config.excludedHostTeams.map(normalizeComparableText);
  const listings: SkytreeLeagueMatchListing[] = [];

  for (const row of options.rows) {
    const listing = rawRowToListing(row, options.detectedAt);
    if (!listing || !targetYmds.has(listing.ymd)) {
      continue;
    }
    if (excludedYmds.has(listing.ymd)) {
      continue;
    }
    if (isWithinExcludedLeadTime(listing.date, options.referenceDate, options.config.excludeWithinDays)) {
      continue;
    }
    if (targetAreas.length > 0 && !targetAreas.includes(normalizeAreaFilterText(listing.area))) {
      continue;
    }
    if (competitionTypes.length > 0 && !competitionTypes.includes(normalizeComparableText(listing.competitionType))) {
      continue;
    }
    if (
      options.config.excludeStartingAtOrAfter &&
      listing.startTime >= options.config.excludeStartingAtOrAfter
    ) {
      continue;
    }
    if (excludedHostTeams.includes(normalizeComparableText(listing.hostTeam))) {
      continue;
    }
    if (shouldExcludeDeadline(listing.deadlineText, options.config.excludeDeadlineLabels)) {
      continue;
    }

    listings.push(listing);
  }

  return listings.sort((left, right) =>
    `${left.ymd}${left.startTime}${left.area}${left.groundName}${left.id}`.localeCompare(
      `${right.ymd}${right.startTime}${right.area}${right.groundName}${right.id}`,
    ),
  );
}

function findOwnTeamOccupiedYmds(rows: RawOwnTeamActivityRow[], ownTeamNames: string[]): string[] {
  const normalizedOwnTeamNames = new Set(ownTeamNames.map(normalizeComparableText));
  if (normalizedOwnTeamNames.size === 0) {
    return [];
  }

  const occupiedYmds = new Set<string>();
  for (const row of rows) {
    const isOwnTeamHost = normalizedOwnTeamNames.has(normalizeComparableText(row.hostTeam));
    const isOwnTeamApplicant =
      row.applicantTeam !== null && normalizedOwnTeamNames.has(normalizeComparableText(row.applicantTeam));
    if (!isOwnTeamHost && !isOwnTeamApplicant) {
      continue;
    }

    const parsed = parseJapaneseDateTime(row.dateTimeText);
    if (parsed) {
      occupiedYmds.add(parsed.ymd);
    }
  }

  return Array.from(occupiedYmds).sort();
}

async function login(page: Page, config: SkytreeLeagueConfig, secrets: SkytreeLeagueSecrets): Promise<void> {
  await page.goto(config.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.navigationTimeoutMs,
  });
  await page.fill("#userid", secrets.userId);
  await page.fill("#password", secrets.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: config.navigationTimeoutMs }).catch(() => null),
    page.click("#login2"),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

  const loginFieldCount = await page.locator("#userid").count().catch(() => 0);
  if (loginFieldCount > 0) {
    throw new Error("スカイツリーグのログインに失敗しました");
  }
}

async function openSchedule(page: Page, config: SkytreeLeagueConfig): Promise<void> {
  await page.goto(config.scheduleUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.navigationTimeoutMs,
  });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForSelector(".tabStTmWrap", { state: "attached", timeout: config.navigationTimeoutMs });
  await page.waitForTimeout(Math.max(config.settleMs, 3_000));
}

async function extractRawRows(
  page: Page,
  statuses: SkytreeLeagueListingStatus[],
): Promise<RawSkytreeLeagueListingRow[]> {
  return page.evaluate((targetStatuses) => {
    const normalize = (value: string | null | undefined) => (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
    const getText = (element: Element | null | undefined) => normalize((element as HTMLElement | null)?.innerText);
    const getUrl = (element: Element | null | undefined, selector: string) => {
      const link = element?.querySelector<HTMLAnchorElement>(selector);
      const href = link?.getAttribute("href");
      return href ? new URL(href, location.href).href : null;
    };
    const getDetailUrl = (row: HTMLTableRowElement, id: string) => {
      const form = row.querySelector<HTMLFormElement>("form[action]");
      const action = form?.getAttribute("action") || "schedule_view.php";
      const url = new URL(action, location.href);
      if (id) {
        url.searchParams.set("Id", id);
      }
      return url.href;
    };

    const wraps = Array.from(document.querySelectorAll<HTMLElement>(".tabStTmWrap"));
    const rows: RawSkytreeLeagueListingRow[] = [];
    for (const status of targetStatuses) {
      const wrapIndex = status === "openWithGround" ? 0 : 1;
      const wrap = wraps[wrapIndex];
      if (!wrap) {
        continue;
      }

      const isWithoutGround = status === "openWithoutGround";
      const noteIndex = isWithoutGround ? 7 : 6;
      const deadlineIndex = isWithoutGround ? 8 : 7;
      for (const row of Array.from(wrap.querySelectorAll<HTMLTableRowElement>("table tr"))) {
        const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
        if (cells.length <= deadlineIndex) {
          continue;
        }

        const id = row.querySelector<HTMLInputElement>('input[name="Id"]')?.value?.trim() ?? "";
        rows.push({
          listingStatus: status,
          id,
          competitionType: getText(cells[0]),
          dateTimeText: getText(cells[1]),
          area: getText(cells[2]),
          groundName: getText(cells[3]),
          hostTeam: getText(cells[4]),
          hostTeamUrl: getUrl(cells[4], 'a[href*="/team/"]'),
          className: getText(cells[5]),
          applicantTeam: isWithoutGround ? getText(cells[6]) : null,
          note: getText(cells[noteIndex]),
          deadlineText: getText(cells[deadlineIndex]),
          detailUrl: getDetailUrl(row, id),
        });
      }
    }

    return rows;
  }, statuses);
}

async function extractOwnTeamActivityRows(page: Page): Promise<RawOwnTeamActivityRow[]> {
  return page.evaluate(() => {
    const normalize = (value: string | null | undefined) => (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
    const getText = (element: Element | null | undefined) => normalize(element?.textContent);
    const rows: RawOwnTeamActivityRow[] = [];

    for (const table of Array.from(document.querySelectorAll<HTMLTableElement>(".tabStTmWrap table"))) {
      const headerCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("tr th"));
      const headers = headerCells.map(getText);
      const dateTimeIndex = headers.findIndex((header) => header.includes("募集日/時間"));
      const hostTeamIndex = headers.findIndex((header) => header.includes("グランド取得チーム"));
      const applicantTeamIndex = headers.findIndex((header) => header.includes("対戦申込チーム"));
      if (dateTimeIndex < 0 || hostTeamIndex < 0) {
        continue;
      }

      for (const row of Array.from(table.querySelectorAll<HTMLTableRowElement>("tr"))) {
        const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td"));
        if (cells.length <= Math.max(dateTimeIndex, hostTeamIndex, applicantTeamIndex)) {
          continue;
        }
        rows.push({
          dateTimeText: getText(cells[dateTimeIndex]),
          hostTeam: getText(cells[hostTeamIndex]),
          applicantTeam: applicantTeamIndex >= 0 ? getText(cells[applicantTeamIndex]) || null : null,
        });
      }
    }

    return rows;
  });
}

export class SkytreeLeagueClient {
  private browser: Browser | null = null;

  constructor(
    private readonly config: SkytreeLeagueConfig,
    private readonly secrets: SkytreeLeagueSecrets,
  ) {}

  async search(targets: TargetDate[], referenceDate = new Date()): Promise<SkytreeLeagueSearchResult> {
    this.browser = await chromium.launch({
      headless: this.config.headless,
    });
    const context = await this.browser.newContext({
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      viewport: { width: 1440, height: 1200 },
    });

    try {
      const page = await context.newPage();
      page.setDefaultTimeout(this.config.navigationTimeoutMs);
      page.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);

      await login(page, this.config, this.secrets);
      await openSchedule(page, this.config);
      const detectedAt = new Date().toISOString();
      const rows = await extractRawRows(page, this.config.listingStatuses);
      const ownTeamOccupiedYmds = this.config.excludeDatesWithOwnTeamActivity
        ? findOwnTeamOccupiedYmds(await extractOwnTeamActivityRows(page), this.config.ownTeamNames)
        : [];
      return {
        listings: filterListings({
          rows,
          targets,
          config: this.config,
          detectedAt,
          referenceDate,
          excludedYmds: ownTeamOccupiedYmds,
        }),
        ownTeamOccupiedYmds,
      };
    } finally {
      await context.close().catch(() => undefined);
      await this.close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}

export const __privateForTests = {
  listingKey,
  rawRowToListing,
  filterListings,
  shouldExcludeDeadline,
  isWithinExcludedLeadTime,
  findOwnTeamOccupiedYmds,
};
