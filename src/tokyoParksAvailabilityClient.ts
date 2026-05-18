import { chromium, type Browser, type Page } from "playwright";
import type { AvailabilitySlot, TargetDate, TokyoParksConfig } from "./types.js";

const JP_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").trim();
}

function formatTimeFromDigits(value: string): string {
  const digits = value.replace(/[^0-9]/g, "").padStart(4, "0");
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function addHours(time: string, hours: number): string {
  const [hourRaw, minuteRaw] = time.split(":");
  const hour = Number.parseInt(hourRaw ?? "0", 10);
  const minute = Number.parseInt(minuteRaw ?? "0", 10);
  const date = new Date(2000, 0, 1, hour, minute, 0, 0);
  date.setHours(date.getHours() + hours);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function slotKey(slot: Omit<AvailabilitySlot, "key">): string {
  return [slot.parkName, slot.facilityName, slot.purposeLabel, slot.ymd, slot.startTime, slot.endTime].join("|");
}

async function waitForParkOptions(page: Page, parkName: string, timeoutMs: number): Promise<void> {
  await page.waitForFunction(
    (label) => {
      const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, "");
      const expected = normalize(String(label));
      return Array.from(document.querySelectorAll<HTMLOptionElement>("#bname-home option")).some((option) =>
        normalize(option.textContent || "").includes(expected),
      );
    },
    parkName,
    { timeout: timeoutMs },
  );
}

async function selectPark(page: Page, config: TokyoParksConfig): Promise<void> {
  if (config.parkValue) {
    await page.selectOption("#bname-home", config.parkValue);
    return;
  }

  const parkValue = await page.$$eval(
    "#bname-home option",
    (options, parkName) => {
      const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, "");
      const expected = normalize(String(parkName));
      const match = options.find((option) => normalize(option.textContent || "").includes(expected));
      return match instanceof HTMLOptionElement ? match.value : null;
    },
    config.parkName,
  );
  if (!parkValue) {
    throw new Error(`公園 "${config.parkName}" の候補が見つかりません`);
  }

  await page.selectOption("#bname-home", parkValue);
}

async function openSearchResult(page: Page, config: TokyoParksConfig, target: TargetDate): Promise<void> {
  await page.goto(config.baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.navigationTimeoutMs,
  });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

  await page.evaluate((isoDate) => {
    const homeDate = document.querySelector<HTMLInputElement>("#daystart-home");
    const modalDate = document.querySelector<HTMLInputElement>("#daystart");
    if (homeDate) {
      homeDate.value = isoDate;
      homeDate.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (modalDate) {
      modalDate.value = isoDate;
      modalDate.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, target.isoDate);

  await page.selectOption("#purpose-home", config.purposeValue);
  await waitForParkOptions(page, config.parkName, config.navigationTimeoutMs);
  await selectPark(page, config);

  await page.click("#btn-go");
  await page.waitForLoadState("domcontentloaded", { timeout: config.navigationTimeoutMs }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForSelector("#week-info", { timeout: config.navigationTimeoutMs });
  await page.waitForTimeout(config.settleMs);
}

async function extractAvailabilitySlots(
  page: Page,
  config: TokyoParksConfig,
  target: TargetDate,
  detectedAt: string,
): Promise<AvailabilitySlot[]> {
  return page.evaluate(
    ({ targetYmd, fallbackParkName, fallbackFacilityName, purposeLabel, detectedAtValue }) => {
      const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").trim();
      const formatTimeFromDigits = (value: string) => {
        const digits = value.replace(/[^0-9]/g, "").padStart(4, "0");
        return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
      };
      const addHours = (time: string, hours: number) => {
        const [hourRaw, minuteRaw] = time.split(":");
        const date = new Date(2000, 0, 1, Number(hourRaw), Number(minuteRaw), 0, 0);
        date.setHours(date.getHours() + hours);
        return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      };
      const slotKey = (slot: Omit<AvailabilitySlot, "key">) =>
        [slot.parkName, slot.facilityName, slot.purposeLabel, slot.ymd, slot.startTime, slot.endTime].join("|");

      const parkSelect = document.querySelector<HTMLSelectElement>("#mansion-select");
      const facilitySelect = document.querySelector<HTMLSelectElement>("#facility-select");
      const parkName = normalize(parkSelect?.selectedOptions?.[0]?.textContent || "") || fallbackParkName;
      const facilityName = normalize(facilitySelect?.selectedOptions?.[0]?.textContent || "") || fallbackFacilityName || "施設";
      if (fallbackFacilityName && !facilityName.includes(fallbackFacilityName)) {
        return [];
      }

      const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>("#week-info tbody tr"));
      const rowStartTimes = rows.map((row) => {
        const label = normalize(row.querySelector("th")?.textContent || "");
        return label ? formatTimeFromDigits(label) : null;
      });

      const slots: AvailabilitySlot[] = [];
      for (const [rowIndex, row] of rows.entries()) {
        const startFromRow = rowStartTimes[rowIndex];
        const endFromNextRow = rowStartTimes[rowIndex + 1] ?? null;
        for (const cell of Array.from(row.querySelectorAll<HTMLTableCellElement>("td.available"))) {
          const match = cell.id.match(/^(\d{8})_(\d+)$/);
          if (!match || match[1] !== targetYmd) {
            continue;
          }

          const availabilityInput = cell.querySelector<HTMLInputElement>(`#A_${cell.id}`);
          const reserveInput = cell.querySelector<HTMLInputElement>(`#P_${cell.id}`);
          const reserveParts = (reserveInput?.value || "").split("_");
          const startTime = reserveParts[2] ? formatTimeFromDigits(reserveParts[2]) : startFromRow;
          if (!startTime) {
            continue;
          }

          const availableCountRaw = availabilityInput?.value ?? cell.querySelector(".calendar-availability")?.textContent ?? "";
          const availableCount = Number.parseInt(availableCountRaw.replace(/[^0-9]/g, ""), 10);
          const date = `${targetYmd.slice(0, 4)}-${targetYmd.slice(4, 6)}-${targetYmd.slice(6, 8)}`;
          const parsedDate = new Date(`${date}T12:00:00+09:00`);
          const weekday = ["日", "月", "火", "水", "木", "金", "土"][parsedDate.getDay()] ?? "";
          const slotWithoutKey: Omit<AvailabilitySlot, "key"> = {
            date,
            ymd: targetYmd,
            weekday,
            parkName,
            facilityName,
            purposeLabel,
            startTime,
            endTime: endFromNextRow && endFromNextRow > startTime ? endFromNextRow : addHours(startTime, 2),
            availableCount: Number.isFinite(availableCount) ? availableCount : null,
            rawReserveValue: reserveInput?.value ?? null,
            pageUrl: location.href,
            detectedAt: detectedAtValue,
          };
          slots.push({
            ...slotWithoutKey,
            key: slotKey(slotWithoutKey),
          });
        }
      }

      return slots;
    },
    {
      targetYmd: target.ymd,
      fallbackParkName: config.parkName,
      fallbackFacilityName: config.facilityName,
      purposeLabel: config.purposeLabel,
      detectedAtValue: detectedAt,
    },
  );
}

export class TokyoParksAvailabilityClient {
  private browser: Browser | null = null;

  constructor(private readonly config: TokyoParksConfig) {}

  async search(targets: TargetDate[]): Promise<AvailabilitySlot[]> {
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

      const allSlots: AvailabilitySlot[] = [];
      for (const target of targets) {
        const detectedAt = new Date().toISOString();
        await openSearchResult(page, this.config, target);
        allSlots.push(...(await extractAvailabilitySlots(page, this.config, target, detectedAt)));
      }

      return allSlots.sort((left, right) =>
        `${left.ymd}${left.startTime}${left.facilityName}`.localeCompare(
          `${right.ymd}${right.startTime}${right.facilityName}`,
        ),
      );
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
  normalizeText,
  formatTimeFromDigits,
  addHours,
  slotKey,
  weekdays: JP_WEEKDAYS,
};
