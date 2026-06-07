import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function loadConfigFrom(config: unknown) {
  const root = await mkdtemp(join(tmpdir(), "availability-config-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "config"));
  await writeFile(join(root, "config", "availability.config.json"), JSON.stringify(config));
  return loadConfig(root);
}

describe("loadConfig", () => {
  it("normalizes time filters and allows optional filters to be disabled", async () => {
    const config = await loadConfigFrom({
      tokyoParks: {
        excludeStartingAtOrAfter: "9:00",
      },
      skytreeLeague: {
        excludeStartingAtOrAfter: null,
        excludedHostTeams: [],
        ownTeamNames: ["ORDERMADE BASEBALL CLUB"],
        excludeDatesWithOwnTeamActivity: false,
        targetAreas: [],
        competitionTypes: [],
      },
    });

    expect(config.tokyoParks.excludeStartingAtOrAfter).toBe("09:00");
    expect(config.skytreeLeague.excludeStartingAtOrAfter).toBeNull();
    expect(config.skytreeLeague.excludedHostTeams).toEqual([]);
    expect(config.skytreeLeague.ownTeamNames).toEqual(["ORDERMADE BASEBALL CLUB"]);
    expect(config.skytreeLeague.excludeDatesWithOwnTeamActivity).toBe(false);
    expect(config.skytreeLeague.targetAreas).toEqual([]);
    expect(config.skytreeLeague.competitionTypes).toEqual([]);
  });
});
