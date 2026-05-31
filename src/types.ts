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

export type SkytreeLeagueListingStatus = "openWithGround" | "openWithoutGround";

export interface SkytreeLeagueConfig {
  enabled: boolean;
  loginUrl: string;
  scheduleUrl: string;
  targetSaturdayOccurrences: number[];
  includeNextMonthWhenRemainingTargetDatesAtMost: number;
  includePastDates: boolean;
  targetAreas: string[];
  competitionTypes: string[];
  excludeWithinDays: number;
  listingStatuses: SkytreeLeagueListingStatus[];
  excludeDeadlineLabels: string[];
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
  skytreeLeague: SkytreeLeagueConfig;
  storage: StorageConfig;
  notifications: NotificationConfig;
}

export interface LineNotificationSecrets {
  apiUrl: string;
  accessToken: string;
  recipientId: string;
}

export interface SkytreeLeagueSecrets {
  userId: string;
  password: string;
}

export interface TargetDate {
  ymd: string;
  isoDate: string;
  year: number;
  month: number;
  day: number;
  occurrence: number;
}

export interface NotifiableItem {
  key: string;
  ymd: string;
}

export interface AvailabilitySlot extends NotifiableItem {
  date: string;
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

export interface SkytreeLeagueMatchListing extends NotifiableItem {
  id: string;
  date: string;
  weekday: string;
  startTime: string;
  endTime: string;
  competitionType: string;
  listingStatus: SkytreeLeagueListingStatus;
  listingStatusLabel: string;
  area: string;
  groundName: string;
  hostTeam: string;
  hostTeamUrl: string | null;
  className: string;
  applicantTeam: string | null;
  note: string;
  deadlineText: string;
  detailUrl: string;
  detectedAt: string;
}

export type NotificationItem = AvailabilitySlot | SkytreeLeagueMatchListing;

export interface NotifiedRecord<T extends NotifiableItem = NotifiableItem> {
  key: string;
  firstNotifiedAt: string;
  lastSeenAt: string;
  item?: T;
  slot?: AvailabilitySlot;
}

export interface NotifiedState<T extends NotifiableItem = NotifiableItem> {
  lastRunAt: string | null;
  notified: NotifiedRecord<T>[];
}
