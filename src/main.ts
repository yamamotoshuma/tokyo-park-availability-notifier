import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig, loadLineSecrets, loadSkytreeLeagueSecrets } from "./config.js";
import { buildTargetDates, formatYmd } from "./dateTargets.js";
import { LineNotifier } from "./lineNotifier.js";
import { buildAvailabilityMessage, buildSkytreeLeagueMessage } from "./message.js";
import { findNewItems, NotifiedStore } from "./notifiedStore.js";
import { SkytreeLeagueClient } from "./skytreeLeagueClient.js";
import { TokyoParksAvailabilityClient } from "./tokyoParksAvailabilityClient.js";
import type { AppConfig, NotifiableItem } from "./types.js";

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

async function sendLineNotification(options: {
  projectRoot: string;
  config: AppConfig;
  message: string;
  itemCount: number;
  label: string;
}): Promise<boolean> {
  if (options.config.notifications.dryRun) {
    console.log("[dry-run] LINE通知は送信しません。");
    console.log(options.message);
    return false;
  }

  const lineSecrets = await loadLineSecrets(options.projectRoot);
  if (!lineSecrets) {
    console.warn("LINE通知設定がないため、通知は送信しません。");
    console.log(options.message);
    return false;
  }

  await new LineNotifier(lineSecrets).send(options.message);
  console.log(`LINE通知を送信しました: ${options.label} ${options.itemCount}件`);
  return true;
}

async function saveDetectedItems<T extends NotifiableItem>(options: {
  store: NotifiedStore;
  items: T[];
  notifiedNewItems: T[];
  runAt: string;
  minYmdToKeep: string;
}): Promise<void> {
  await options.store.saveRun(options.items, options.notifiedNewItems, options.runAt, options.minYmdToKeep);
}

async function runTokyoParks(options: {
  projectRoot: string;
  config: AppConfig;
  store: NotifiedStore;
  now: Date;
  runAt: string;
  minYmdToKeep: string;
}): Promise<void> {
  const targets = buildTargetDates({
    referenceDate: options.now,
    occurrences: options.config.tokyoParks.targetSaturdayOccurrences,
    includeNextMonthFromDay: options.config.tokyoParks.includeNextMonthFromDay,
    includePastDates: options.config.tokyoParks.includePastDates,
  });

  if (targets.length === 0) {
    console.log("都立公園の検索対象日がありません。");
    return;
  }

  console.log(`都立公園 検索対象: ${targets.map((target) => target.isoDate).join(", ")}`);
  const state = await options.store.get();
  const client = new TokyoParksAvailabilityClient(options.config.tokyoParks);
  const slots = await client.search(targets);
  const newSlots = findNewItems(slots, state);
  let notifiedNewSlots = newSlots;

  if (newSlots.length > 0) {
    const message = buildAvailabilityMessage(newSlots);
    const sent = await sendLineNotification({
      projectRoot: options.projectRoot,
      config: options.config,
      message,
      itemCount: newSlots.length,
      label: "都立公園",
    });
    if (!sent) {
      notifiedNewSlots = [];
    }
  } else {
    console.log(`都立公園の新規通知対象はありません。検出空き: ${slots.length}件`);
  }

  await saveDetectedItems({
    store: options.store,
    items: slots,
    notifiedNewItems: notifiedNewSlots,
    runAt: options.runAt,
    minYmdToKeep: options.minYmdToKeep,
  });
}

async function runSkytreeLeague(options: {
  projectRoot: string;
  config: AppConfig;
  store: NotifiedStore;
  now: Date;
  runAt: string;
  minYmdToKeep: string;
}): Promise<void> {
  if (!options.config.skytreeLeague.enabled) {
    return;
  }

  const secrets = await loadSkytreeLeagueSecrets(options.projectRoot);
  if (!secrets) {
    console.warn("スカイツリーグ認証情報がないため、試合募集検索はスキップします。");
    return;
  }

  const targets = buildTargetDates({
    referenceDate: options.now,
    occurrences: options.config.skytreeLeague.targetSaturdayOccurrences,
    includeNextMonthWhenRemainingTargetDatesAtMost:
      options.config.skytreeLeague.includeNextMonthWhenRemainingTargetDatesAtMost,
    includePastDates: options.config.skytreeLeague.includePastDates,
  });

  if (targets.length === 0) {
    console.log("スカイツリーグの検索対象日がありません。");
    return;
  }

  const areaText =
    options.config.skytreeLeague.targetAreas.length > 0
      ? ` / 対象地域: ${options.config.skytreeLeague.targetAreas.join(", ")}`
      : "";
  console.log(`スカイツリーグ 検索対象: ${targets.map((target) => target.isoDate).join(", ")}${areaText}`);

  const state = await options.store.get();
  const client = new SkytreeLeagueClient(options.config.skytreeLeague, secrets);
  const listings = await client.search(targets, options.now);
  const newListings = findNewItems(listings, state);
  let notifiedNewListings = newListings;

  if (newListings.length > 0) {
    const message = buildSkytreeLeagueMessage(newListings);
    const sent = await sendLineNotification({
      projectRoot: options.projectRoot,
      config: options.config,
      message,
      itemCount: newListings.length,
      label: "スカイツリーグ",
    });
    if (!sent) {
      notifiedNewListings = [];
    }
  } else {
    console.log(`スカイツリーグの新規通知対象はありません。検出募集: ${listings.length}件`);
  }

  await saveDetectedItems({
    store: options.store,
    items: listings,
    notifiedNewItems: notifiedNewListings,
    runAt: options.runAt,
    minYmdToKeep: options.minYmdToKeep,
  });
}

async function runOnce(projectRoot: string): Promise<void> {
  const config = await loadConfig(projectRoot);
  const now = new Date();
  const runAt = new Date().toISOString();
  const minYmdToKeep = formatYmd(now);
  const store = NotifiedStore.fromProjectRoot(projectRoot, config.storage.notifiedPath);

  await runTokyoParks({
    projectRoot,
    config,
    store,
    now,
    runAt,
    minYmdToKeep,
  });
  await runSkytreeLeague({
    projectRoot,
    config,
    store,
    now,
    runAt,
    minYmdToKeep,
  });
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
