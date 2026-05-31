import type { TargetDate } from "./types.js";

const SATURDAY = 6;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatYmd(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function createTargetDate(date: Date, occurrence: number): TargetDate {
  return {
    ymd: formatYmd(date),
    isoDate: formatIsoDate(date),
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    occurrence,
  };
}

export function getNthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  occurrence: number,
): Date | null {
  if (!Number.isInteger(occurrence) || occurrence < 1) {
    return null;
  }

  let matched = 0;
  const cursor = new Date(year, monthIndex, 1, 12, 0, 0, 0);
  while (cursor.getMonth() === monthIndex) {
    if (cursor.getDay() === weekday) {
      matched += 1;
      if (matched === occurrence) {
        return new Date(cursor);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return null;
}

export function countRemainingTargetDatesInCurrentMonth(options: {
  referenceDate?: Date;
  occurrences: number[];
  weekday?: number;
}): number {
  const referenceDate = startOfLocalDay(options.referenceDate ?? new Date());
  const weekday = options.weekday ?? SATURDAY;
  let count = 0;

  for (const occurrence of options.occurrences) {
    const date = getNthWeekdayOfMonth(referenceDate.getFullYear(), referenceDate.getMonth(), weekday, occurrence);
    if (date && date > referenceDate) {
      count += 1;
    }
  }

  return count;
}

export function buildTargetDates(options: {
  referenceDate?: Date;
  occurrences: number[];
  includeNextMonthFromDay?: number;
  includeNextMonthWhenRemainingTargetDatesAtMost?: number;
  includePastDates: boolean;
}): TargetDate[] {
  const referenceDate = startOfLocalDay(options.referenceDate ?? new Date());
  const targetMonths = [{ year: referenceDate.getFullYear(), monthIndex: referenceDate.getMonth() }];

  const includeNextMonthByDay =
    typeof options.includeNextMonthFromDay === "number" && referenceDate.getDate() >= options.includeNextMonthFromDay;
  const includeNextMonthByRemainingTargets =
    typeof options.includeNextMonthWhenRemainingTargetDatesAtMost === "number" &&
    countRemainingTargetDatesInCurrentMonth({
      referenceDate,
      occurrences: options.occurrences,
    }) <= Math.max(0, Math.floor(options.includeNextMonthWhenRemainingTargetDatesAtMost));

  if (includeNextMonthByDay || includeNextMonthByRemainingTargets) {
    const nextMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1, 12, 0, 0, 0);
    targetMonths.push({ year: nextMonth.getFullYear(), monthIndex: nextMonth.getMonth() });
  }

  const targets: TargetDate[] = [];
  for (const month of targetMonths) {
    for (const occurrence of options.occurrences) {
      const date = getNthWeekdayOfMonth(month.year, month.monthIndex, SATURDAY, occurrence);
      if (!date) {
        continue;
      }
      if (!options.includePastDates && date < referenceDate) {
        continue;
      }
      targets.push(createTargetDate(date, occurrence));
    }
  }

  return targets.sort((left, right) => left.ymd.localeCompare(right.ymd));
}
