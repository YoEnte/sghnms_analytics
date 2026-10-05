import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchClubMatchesPage } from "../lib/handball-client.js";
import { getSeasonRange, normalizeMatch } from "../lib/season.js";
import { writeJson } from "../lib/fs-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const RAW_SEASON = path.join(ROOT, "raw", "season");
const RAW_MATCHES = path.join(ROOT, "raw", "matches");

function sortKey(match) {
  return `${match.date}T${match.time}`;
}

async function main() {
  const season = getSeasonRange();
  await fs.rm(path.join(RAW_SEASON, "pages"), { recursive: true, force: true });
  await fs.mkdir(path.join(RAW_SEASON, "pages"), { recursive: true });
  await fs.mkdir(RAW_MATCHES, { recursive: true });

  const normalized = [];
  let page = 1;
  let lastPage = 1;

  console.log(`Fetching SG season ${season.dateFrom} to ${season.dateTo} ...`);

  do {
    const payload = await fetchClubMatchesPage({
      dateFrom: season.dateFrom,
      dateTo: season.dateTo,
      page
    });

    await writeJson(path.join(RAW_SEASON, "pages", `page-${String(page).padStart(3, "0")}.json`), payload);

    const rows = Array.isArray(payload.data) ? payload.data : [];
    for (const rawMatch of rows) {
      const match = normalizeMatch(rawMatch);
      normalized.push(match);
      await writeJson(path.join(RAW_MATCHES, String(match.id), "match.json"), rawMatch);
    }

    lastPage = Number(payload.pagination?.last_page || 1);
    console.log(`Page ${page}/${lastPage}: ${rows.length} matches`);
    page += 1;
  } while (page <= lastPage);

  normalized.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  await writeJson(path.join(RAW_SEASON, "index.json"), {
    generatedAt: new Date().toISOString(),
    season,
    matches: normalized
  });

  console.log(`Stored ${normalized.length} matches.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
