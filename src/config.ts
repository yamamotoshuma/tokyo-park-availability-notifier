import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  AppConfig,
  LineNotificationSecrets,
  SkytreeLeagueListingStatus,
  SkytreeLeagueSecrets,
} from "./types.js";

const DEFAULT_CONFIG: AppConfig = {
  tokyoParks: {
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
  },
  skytreeLeague: {
    enabled: true,
    loginUrl: "https://ts-league.com/team/order-made/login.php",
    scheduleUrl: "https://ts-league.com/team/order-made/schedule.php",
    targetSaturdayOccurrences: [1, 3, 5],
    includeNextMonthWhenRemainingTargetDatesAtMost: 1,
    includePastDates: false,
    targetAreas: [
      "北区",
      "板橋区",
      "練馬区",
      "豊島区",
      "文京区",
      "千代田区",
      "新宿区",
      "中野区",
      "杉並区",
      "埼玉県",
    ],
    competitionTypes: ["LG"],
    excludeWithinDays: 7,
    excludeStartingAtOrAfter: "19:00",
    excludedHostTeams: ["ORDERMADEBASEBALLclub"],
    listingStatuses: ["openWithGround"],
    excludeDeadlineLabels: ["締切", "終了", "調整中"],
    headless: true,
    navigationTimeoutMs: 45_000,
    settleMs: 1_000,
  },
  storage: {
    notifiedPath: "data/notified.json",
  },
  notifications: {
    dryRun: false,
  },
};

export class ConfigError extends Error {}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function readNullableString(value: unknown, fallback: string | null): string | null {
  if (value === null) {
    return null;
  }
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function readNullableTime(value: unknown, fallback: string | null): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return fallback;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return fallback;
  }

  const hour = Number.parseInt(match[1] ?? "", 10);
  const minute = Number.parseInt(match[2] ?? "", 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readNumberArray(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((entry) => (typeof entry === "number" ? entry : Number.NaN))
    .filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 5);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry !== "");

  return Array.from(new Set(normalized));
}

function readListingStatusArray(value: unknown, fallback: SkytreeLeagueListingStatus[]): SkytreeLeagueListingStatus[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const allowed = new Set<SkytreeLeagueListingStatus>(["openWithGround", "openWithoutGround"]);
  const normalized = value.filter((entry): entry is SkytreeLeagueListingStatus => {
    return typeof entry === "string" && allowed.has(entry as SkytreeLeagueListingStatus);
  });

  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
}

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function loadConfig(projectRoot: string): Promise<AppConfig> {
  const configPath = process.env.AVAILABILITY_CONFIG
    ? resolve(projectRoot, process.env.AVAILABILITY_CONFIG)
    : join(projectRoot, "config", "availability.config.json");
  const raw = (await readJsonIfExists(configPath)) ?? {};

  const tokyoParksRaw = asRecord(raw.tokyoParks);
  const skytreeLeagueRaw = asRecord(raw.skytreeLeague);
  const storageRaw = asRecord(raw.storage);
  const notificationsRaw = asRecord(raw.notifications);

  return {
    tokyoParks: {
      baseUrl: readString(tokyoParksRaw.baseUrl, DEFAULT_CONFIG.tokyoParks.baseUrl),
      purposeValue: readString(tokyoParksRaw.purposeValue, DEFAULT_CONFIG.tokyoParks.purposeValue),
      purposeLabel: readString(tokyoParksRaw.purposeLabel, DEFAULT_CONFIG.tokyoParks.purposeLabel),
      parkName: readString(tokyoParksRaw.parkName, DEFAULT_CONFIG.tokyoParks.parkName),
      parkValue: readNullableString(tokyoParksRaw.parkValue, DEFAULT_CONFIG.tokyoParks.parkValue),
      facilityName: readNullableString(tokyoParksRaw.facilityName, DEFAULT_CONFIG.tokyoParks.facilityName),
      targetSaturdayOccurrences: readNumberArray(
        tokyoParksRaw.targetSaturdayOccurrences,
        DEFAULT_CONFIG.tokyoParks.targetSaturdayOccurrences,
      ),
      includeNextMonthFromDay: readNumber(
        tokyoParksRaw.includeNextMonthFromDay,
        DEFAULT_CONFIG.tokyoParks.includeNextMonthFromDay,
      ),
      includePastDates: readBoolean(tokyoParksRaw.includePastDates, DEFAULT_CONFIG.tokyoParks.includePastDates),
      excludeStartingAtOrAfter: readNullableTime(
        tokyoParksRaw.excludeStartingAtOrAfter,
        DEFAULT_CONFIG.tokyoParks.excludeStartingAtOrAfter,
      ),
      headless: readBoolean(tokyoParksRaw.headless, DEFAULT_CONFIG.tokyoParks.headless),
      navigationTimeoutMs: readNumber(tokyoParksRaw.navigationTimeoutMs, DEFAULT_CONFIG.tokyoParks.navigationTimeoutMs),
      settleMs: readNumber(tokyoParksRaw.settleMs, DEFAULT_CONFIG.tokyoParks.settleMs),
    },
    skytreeLeague: {
      enabled: readBoolean(skytreeLeagueRaw.enabled, DEFAULT_CONFIG.skytreeLeague.enabled),
      loginUrl: readString(skytreeLeagueRaw.loginUrl, DEFAULT_CONFIG.skytreeLeague.loginUrl),
      scheduleUrl: readString(skytreeLeagueRaw.scheduleUrl, DEFAULT_CONFIG.skytreeLeague.scheduleUrl),
      targetSaturdayOccurrences: readNumberArray(
        skytreeLeagueRaw.targetSaturdayOccurrences,
        DEFAULT_CONFIG.skytreeLeague.targetSaturdayOccurrences,
      ),
      includeNextMonthWhenRemainingTargetDatesAtMost: readNumber(
        skytreeLeagueRaw.includeNextMonthWhenRemainingTargetDatesAtMost,
        DEFAULT_CONFIG.skytreeLeague.includeNextMonthWhenRemainingTargetDatesAtMost,
      ),
      includePastDates: readBoolean(skytreeLeagueRaw.includePastDates, DEFAULT_CONFIG.skytreeLeague.includePastDates),
      targetAreas: readStringArray(skytreeLeagueRaw.targetAreas, DEFAULT_CONFIG.skytreeLeague.targetAreas),
      competitionTypes: readStringArray(
        skytreeLeagueRaw.competitionTypes,
        DEFAULT_CONFIG.skytreeLeague.competitionTypes,
      ),
      excludeWithinDays: readNumber(skytreeLeagueRaw.excludeWithinDays, DEFAULT_CONFIG.skytreeLeague.excludeWithinDays),
      excludeStartingAtOrAfter: readNullableTime(
        skytreeLeagueRaw.excludeStartingAtOrAfter,
        DEFAULT_CONFIG.skytreeLeague.excludeStartingAtOrAfter,
      ),
      excludedHostTeams: readStringArray(
        skytreeLeagueRaw.excludedHostTeams,
        DEFAULT_CONFIG.skytreeLeague.excludedHostTeams,
      ),
      listingStatuses: readListingStatusArray(
        skytreeLeagueRaw.listingStatuses,
        DEFAULT_CONFIG.skytreeLeague.listingStatuses,
      ),
      excludeDeadlineLabels: readStringArray(
        skytreeLeagueRaw.excludeDeadlineLabels,
        DEFAULT_CONFIG.skytreeLeague.excludeDeadlineLabels,
      ),
      headless: readBoolean(skytreeLeagueRaw.headless, DEFAULT_CONFIG.skytreeLeague.headless),
      navigationTimeoutMs: readNumber(
        skytreeLeagueRaw.navigationTimeoutMs,
        DEFAULT_CONFIG.skytreeLeague.navigationTimeoutMs,
      ),
      settleMs: readNumber(skytreeLeagueRaw.settleMs, DEFAULT_CONFIG.skytreeLeague.settleMs),
    },
    storage: {
      notifiedPath: readString(storageRaw.notifiedPath, DEFAULT_CONFIG.storage.notifiedPath),
    },
    notifications: {
      dryRun: readBoolean(notificationsRaw.dryRun, DEFAULT_CONFIG.notifications.dryRun),
    },
  };
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`notifications.local.json: missing string field "${field}"`);
  }
  return value.trim();
}

export async function loadLineSecrets(projectRoot: string): Promise<LineNotificationSecrets | null> {
  const raw = await readJsonIfExists(join(projectRoot, "secrets", "notifications.local.json"));
  if (!raw) {
    return null;
  }

  const notifications = asRecord(raw.notifications ?? raw);
  const line = asRecord(notifications.line ?? notifications);
  if (!("accessToken" in line) && !("recipientId" in line)) {
    return null;
  }

  const accessToken = assertString(line.accessToken, "line.accessToken");
  const recipientId = assertString(line.recipientId, "line.recipientId");
  if (accessToken === "SET_LOCALLY" || recipientId === "SET_LOCALLY") {
    return null;
  }

  return {
    apiUrl: readString(line.apiUrl, "https://api.line.me/v2/bot/message/push"),
    accessToken,
    recipientId,
  };
}

export async function loadSkytreeLeagueSecrets(projectRoot: string): Promise<SkytreeLeagueSecrets | null> {
  const raw = await readJsonIfExists(join(projectRoot, "secrets", "notifications.local.json"));
  if (!raw) {
    return null;
  }

  const notifications = asRecord(raw.notifications ?? raw);
  const skytreeLeague = asRecord(notifications.skytreeLeague ?? raw.skytreeLeague);
  const userIdRaw = skytreeLeague.userId ?? skytreeLeague.userid;
  const passwordRaw = skytreeLeague.password;
  if (!userIdRaw && !passwordRaw) {
    return null;
  }

  const userId = assertString(userIdRaw, "skytreeLeague.userId");
  const password = assertString(passwordRaw, "skytreeLeague.password");
  if (userId === "SET_LOCALLY" || password === "SET_LOCALLY") {
    return null;
  }

  return {
    userId,
    password,
  };
}
