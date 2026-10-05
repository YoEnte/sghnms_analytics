import path from "node:path";
import { fileURLToPath } from "node:url";
import { DETAIL_FETCH_DELAY_MS } from "../config/config.js";
import { fetchMatchEvents, fetchMatchLineups } from "../lib/handball-client.js";
import { exists, readJson, sleep, writeJson } from "../lib/fs-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const INDEX_FILE = path.join(ROOT, "raw", "season", "index.json");
const MATCH_ROOT = path.join(ROOT, "raw", "matches");
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const force = process.argv.includes("--force");
const matchArg = argValue("--match");

async function markerIsFresh(filePath) {
  if (!(await exists(filePath))) return false;
  const marker = await readJson(filePath);
  const at = Date.parse(marker.checkedAt || "");
  return Number.isFinite(at) && Date.now() - at < RETRY_AFTER_MS;
}

async function fetchEndpoint({ label, file, marker, fetcher, matchId }) {
  if (!force && await exists(file)) return { status: "cached" };
  if (!force && await markerIsFresh(marker)) return { status: "recently-unavailable" };

  try {
    const payload = await fetcher(matchId);
    await writeJson(file, payload);
    return { status: "fetched" };
  } catch (error) {
    if (error?.status !== 404) throw error;

    await writeJson(marker, {
      checkedAt: new Date().toISOString(),
      matchId,
      endpoint: label,
      status: error.status,
      message: error.message
    });
    return { status: "unavailable", error };
  }
}

async function fetchOne(match) {
  const dir = path.join(MATCH_ROOT, String(match.id));
  const eventsFile = path.join(dir, "events.json");
  const lineupsFile = path.join(dir, "lineups.json");
  const eventsMarker = path.join(dir, "events.unavailable.json");
  const lineupsMarker = path.join(dir, "lineups.unavailable.json");

  if (!match.status?.finished && !matchArg) {
    return { fetched: 0, skipped: 1, unavailable: 0 };
  }

  console.log(`${match.id}: checking details ...`);

  const events = await fetchEndpoint({
    label: "events",
    file: eventsFile,
    marker: eventsMarker,
    fetcher: fetchMatchEvents,
    matchId: match.id
  });
  await sleep(DETAIL_FETCH_DELAY_MS);

  const lineups = await fetchEndpoint({
    label: "lineups",
    file: lineupsFile,
    marker: lineupsMarker,
    fetcher: fetchMatchLineups,
    matchId: match.id
  });
  await sleep(DETAIL_FETCH_DELAY_MS);

  for (const [name, result] of [["events", events], ["lineups", lineups]]) {
    console.log(`  ${name}: ${result.status}`);
    if (result.error) console.log(`    ${result.error.message}`);
  }

  const statuses = [events.status, lineups.status];
  return {
    fetched: statuses.filter((status) => status === "fetched").length,
    skipped: statuses.filter((status) => status === "cached" || status === "recently-unavailable").length,
    unavailable: statuses.filter((status) => status === "unavailable").length
  };
}

async function main() {
  if (!(await exists(INDEX_FILE))) {
    throw new Error("raw/season/index.json missing. Run npm run fetch:season first.");
  }

  const season = await readJson(INDEX_FILE);
  let matches = Array.isArray(season.matches) ? season.matches : [];

  if (matchArg) {
    matches = matches.filter((match) => String(match.id) === String(matchArg));
    if (!matches.length) throw new Error(`Match ${matchArg} not found in season index.`);
  } else {
    matches = matches.filter((match) => match.status?.finished);
  }

  let fetched = 0;
  let skipped = 0;
  let unavailable = 0;

  for (const match of matches) {
    const result = await fetchOne(match);
    fetched += result.fetched;
    skipped += result.skipped;
    unavailable += result.unavailable;
  }

  console.log(`Done. fetched=${fetched}, skipped=${skipped}, unavailable=${unavailable}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
