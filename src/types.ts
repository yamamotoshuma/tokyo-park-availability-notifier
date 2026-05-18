export interface TokyoParksConfig {
  baseUrl: string;
  purposeValue: string;
  purposeLabel: string;
  parkName: string;
  parkValue: string | null;
  facilityName: string | null;
  targetSaturdayOccurrences: number[];
  includeNextMonthFromDay: number;
  includePastDates: boolean;
  headless: boolean;
  navigationTimeoutMs: number;
  settleMs: number;
}

export interface StorageConfig {
  notifiedPath: string;
}

export interface NotificationConfig {
  dryRun: boolean;
}

export interface AppConfig {
  tokyoParks: TokyoParksConfig;
  storage: StorageConfig;
  notifications: NotificationConfig;
}

export interface LineNotificationSecrets {
  apiUrl: string;
  accessToken: string;
  recipientId: string;
}

export interface TargetDate {
  ymd: string;
  isoDate: string;
  year: number;
  month: number;
  day: number;
  occurrence: number;
}

export interface AvailabilitySlot {
  key: string;
  date: string;
  ymd: string;
  weekday: string;
  parkName: string;
  facilityName: string;
  purposeLabel: string;
  startTime: string;
  endTime: string;
  availableCount: number | null;
  rawReserveValue: string | null;
  pageUrl: string;
  detectedAt: string;
}

export interface NotifiedRecord {
  key: string;
  firstNotifiedAt: string;
  lastSeenAt: string;
  slot: AvailabilitySlot;
}

export interface NotifiedState {
  lastRunAt: string | null;
  notified: NotifiedRecord[];
}
