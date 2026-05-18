import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig, loadLineSecrets } from "./config.js";
import { buildTargetDates, formatYmd } from "./dateTargets.js";
import { LineNotifier } from "./lineNotifier.js";
import { buildAvailabilityMessage } from "./message.js";
import { findNewSlots, NotifiedStore } from "./notifiedStore.js";
import { TokyoParksAvailabilityClient } from "./tokyoParksAvailabilityClient.js";

const DEFAULT_INTERVAL_MINUTES = 60;

function parseIntervalMs(): number {
  const raw = process.env.CHECK_INTERVAL_MINUTES;
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_INTERVAL_MINUTES;
  const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MINUTES;
  return minutes * 60 * 1000;
}

function isWatchMode(): boolean {
  return process.argv.includes("--watch");
}

async function runOnce(projectRoot: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  const now = new Date();
  const targets = buildTargetDates({
    referenceDate: now,
    occurrences: config.tokyoParks.targetSaturdayOccurrences,
    includeNextMonthFromDay: config.tokyoParks.includeNextMonthFromDay,
    includePastDates: config.tokyoParks.includePastDates,
  });

  if (targets.length === 0) {
    console.log("検索対象日がありません。");
    return;
  }

  console.log(`検索対象: ${targets.map((target) => target.isoDate).join(", ")}`);
  const store = NotifiedStore.fromProjectRoot(projectRoot, config.storage.notifiedPath);
  const state = await store.get();

  const client = new TokyoParksAvailabilityClient(config.tokyoParks);
  const slots = await client.search(targets);
  const newSlots = findNewSlots(slots, state);
  const runAt = new Date().toISOString();
  const minYmdToKeep = formatYmd(now);
  let notifiedNewSlots = newSlots;

  if (newSlots.length > 0) {
    const message = buildAvailabilityMessage(newSlots);
    if (config.notifications.dryRun) {
      console.log("[dry-run] LINE通知は送信しません。");
      console.log(message);
      notifiedNewSlots = [];
    } else {
      const lineSecrets = await loadLineSecrets(projectRoot);
      if (!lineSecrets) {
        console.warn("LINE通知設定がないため、通知は送信しません。");
        console.log(message);
        notifiedNewSlots = [];
      } else {
        await new LineNotifier(lineSecrets).send(message);
        console.log(`LINE通知を送信しました: ${newSlots.length}件`);
      }
    }
  } else {
    console.log(`新規通知対象はありません。検出空き: ${slots.length}件`);
  }

  await store.saveRun(slots, notifiedNewSlots, runAt, minYmdToKeep);
}

async function main(): Promise<void> {
  const projectRoot = resolve(process.cwd());
  if (!isWatchMode()) {
    await runOnce(projectRoot);
    return;
  }

  const intervalMs = parseIntervalMs();
  console.log(`watch mode: ${Math.round(intervalMs / 60_000)}分ごとに検索します。`);
  for (;;) {
    try {
      await runOnce(projectRoot);
    } catch (error) {
      console.error(error instanceof Error ? error.stack ?? error.message : error);
    }
    await sleep(intervalMs);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
