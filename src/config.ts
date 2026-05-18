import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AppConfig, LineNotificationSecrets } from "./types.js";

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
    headless: true,
    navigationTimeoutMs: 45_000,
    settleMs: 2_500,
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
      headless: readBoolean(tokyoParksRaw.headless, DEFAULT_CONFIG.tokyoParks.headless),
      navigationTimeoutMs: readNumber(tokyoParksRaw.navigationTimeoutMs, DEFAULT_CONFIG.tokyoParks.navigationTimeoutMs),
      settleMs: readNumber(tokyoParksRaw.settleMs, DEFAULT_CONFIG.tokyoParks.settleMs),
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
