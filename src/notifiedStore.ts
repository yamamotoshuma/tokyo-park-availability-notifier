import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AvailabilitySlot, NotifiableItem, NotifiedRecord, NotifiedState } from "./types.js";

const EMPTY_STATE: NotifiedState = {
  lastRunAt: null,
  notified: [],
};

export class NotifiedStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  static fromProjectRoot(projectRoot: string, relativePath: string): NotifiedStore {
    return new NotifiedStore(resolve(projectRoot, relativePath));
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      await readFile(this.filePath, "utf8");
    } catch {
      await this.writeAll(EMPTY_STATE);
    }
  }

  async get(): Promise<NotifiedState> {
    await this.initialize();
    const raw = await readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<NotifiedState>;
    return {
      lastRunAt: typeof parsed.lastRunAt === "string" ? parsed.lastRunAt : null,
      notified: Array.isArray(parsed.notified) ? parsed.notified.flatMap((record) => normalizeRecord(record)) : [],
    };
  }

  async saveRun(
    items: NotifiableItem[],
    newItems: NotifiableItem[],
    now: string,
    minYmdToKeep: string,
  ): Promise<void> {
    await this.withWriteLock(async () => {
      const current = await this.get();
      const byKey = new Map<string, NotifiedRecord>();

      for (const record of current.notified) {
        const item = getRecordItem(record);
        if (item && item.ymd >= minYmdToKeep) {
          byKey.set(record.key, record);
        }
      }

      for (const item of items) {
        const currentRecord = byKey.get(item.key);
        if (currentRecord) {
          byKey.set(item.key, {
            ...currentRecord,
            lastSeenAt: now,
            ...createItemFields(item),
          });
        }
      }

      for (const item of newItems) {
        if (!byKey.has(item.key)) {
          byKey.set(item.key, {
            key: item.key,
            firstNotifiedAt: now,
            lastSeenAt: now,
            ...createItemFields(item),
          });
        }
      }

      await this.writeAll({
        lastRunAt: now,
        notified: Array.from(byKey.values()).sort((left, right) => left.key.localeCompare(right.key)),
      });
    });
  }

  private async writeAll(state: NotifiedState): Promise<void> {
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }

  private async withWriteLock(callback: () => Promise<void>): Promise<void> {
    const nextWrite = this.writeChain.then(callback);
    this.writeChain = nextWrite.catch(() => undefined);
    await nextWrite;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNotifiableItem(value: unknown): value is NotifiableItem {
  return isRecord(value) && typeof value.key === "string" && typeof value.ymd === "string";
}

function isAvailabilitySlot(value: NotifiableItem): value is AvailabilitySlot {
  return "parkName" in value && "startTime" in value && "facilityName" in value;
}

function normalizeRecord(value: unknown): NotifiedRecord[] {
  if (!isRecord(value) || typeof value.key !== "string") {
    return [];
  }

  const item = isNotifiableItem(value.item) ? value.item : isNotifiableItem(value.slot) ? value.slot : null;
  if (!item) {
    return [];
  }

  const record: NotifiedRecord = {
    key: value.key,
    firstNotifiedAt: typeof value.firstNotifiedAt === "string" ? value.firstNotifiedAt : "",
    lastSeenAt: typeof value.lastSeenAt === "string" ? value.lastSeenAt : "",
    item,
  };
  if (isNotifiableItem(value.slot) && isAvailabilitySlot(value.slot)) {
    record.slot = value.slot;
  }

  return [record];
}

function getRecordItem(record: NotifiedRecord): NotifiableItem | null {
  return record.item ?? record.slot ?? null;
}

function createItemFields(item: NotifiableItem): Pick<NotifiedRecord, "item" | "slot"> {
  return {
    item,
    ...(isAvailabilitySlot(item) ? { slot: item } : {}),
  };
}

export function findNewItems<T extends NotifiableItem>(items: T[], state: NotifiedState): T[] {
  const knownKeys = new Set(state.notified.map((record) => record.key));
  return items.filter((item) => !knownKeys.has(item.key));
}

export const findNewSlots = findNewItems;
