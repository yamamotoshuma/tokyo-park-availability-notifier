import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AvailabilitySlot, NotifiedRecord, NotifiedState } from "./types.js";

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
      notified: Array.isArray(parsed.notified) ? parsed.notified : [],
    };
  }

  async saveRun(slots: AvailabilitySlot[], newSlots: AvailabilitySlot[], now: string, minYmdToKeep: string): Promise<void> {
    await this.withWriteLock(async () => {
      const current = await this.get();
      const byKey = new Map<string, NotifiedRecord>();

      for (const record of current.notified) {
        if (record.slot.ymd >= minYmdToKeep) {
          byKey.set(record.key, record);
        }
      }

      for (const slot of slots) {
        const currentRecord = byKey.get(slot.key);
        if (currentRecord) {
          byKey.set(slot.key, {
            ...currentRecord,
            lastSeenAt: now,
            slot,
          });
        }
      }

      for (const slot of newSlots) {
        if (!byKey.has(slot.key)) {
          byKey.set(slot.key, {
            key: slot.key,
            firstNotifiedAt: now,
            lastSeenAt: now,
            slot,
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

export function findNewSlots(slots: AvailabilitySlot[], state: NotifiedState): AvailabilitySlot[] {
  const knownKeys = new Set(state.notified.map((record) => record.key));
  return slots.filter((slot) => !knownKeys.has(slot.key));
}
