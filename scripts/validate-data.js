import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEAM_META } from "../config/config.js";
import { exists, readJson } from "../lib/fs-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "generated", "public");

async function main() {
  const coverageFile = path.join(PUBLIC, "coverage.json");
  const teamAnalyticsFile = path.join(PUBLIC, "team-analytics.json");
  const playersFile = path.join(PUBLIC, "players.json");
  const matchIndexFile = path.join(PUBLIC, "match-analytics", "index.json");

  for (const file of [coverageFile, teamAnalyticsFile, playersFile, matchIndexFile]) {
    if (!(await exists(file))) {
      throw new Error(`${path.relative(ROOT, file)} missing. Run npm run refresh.`);
    }
  }

  const coverage = await readJson(coverageFile);
  const teamAnalytics = await readJson(teamAnalyticsFile);
  const players = await readJson(playersFile);
  const matchIndex = await readJson(matchIndexFile);
  const errors = [];

  if (!Number.isInteger(coverage.finishedMatches) || coverage.finishedMatches < 0) {
    errors.push("finishedMatches is invalid.");
  }

  const endpoint = coverage.endpointCoverage || {};
  const verified = coverage.verifiedAnalytics || {};

  for (const key of ["eventsAvailable", "lineupsAvailable", "bothAvailable"]) {
    if (!Number.isInteger(endpoint[key]) || endpoint[key] < 0 || endpoint[key] > coverage.finishedMatches) {
      errors.push(`endpointCoverage.${key} is invalid.`);
    }
  }

  if (!Number.isInteger(verified.eligibleMatches) || verified.eligibleMatches < 0 || verified.eligibleMatches > coverage.finishedMatches) {
    errors.push("verifiedAnalytics.eligibleMatches is invalid.");
  }

  if (verified.eligibleMatches + verified.excludedMatches !== coverage.finishedMatches) {
    errors.push("verifiedAnalytics totals do not match finishedMatches.");
  }

  const matchRows = Array.isArray(matchIndex.matches) ? matchIndex.matches : [];
  if (matchRows.length !== coverage.finishedMatches) {
    errors.push(`match-analytics/index.json has ${matchRows.length} rows, expected ${coverage.finishedMatches}.`);
  }
  const eligibleRows = matchRows.filter((item) => item.analyticsEligible).length;
  if (eligibleRows !== verified.eligibleMatches) {
    errors.push(`match analytics eligible count ${eligibleRows} differs from coverage ${verified.eligibleMatches}.`);
  }

  const teams = Array.isArray(teamAnalytics.teams) ? teamAnalytics.teams : [];
  if (teams.length !== Object.keys(TEAM_META).length) {
    errors.push(`team-analytics.json has ${teams.length} teams, expected ${Object.keys(TEAM_META).length}.`);
  }

  for (const team of teams) {
    if (team.analyticsMatches > team.finishedMatches) {
      errors.push(`${team.id}: analyticsMatches exceeds finishedMatches.`);
    }
    if (team.sevenMeters?.attempts !== Number(team.sevenMeters?.goals || 0) + Number(team.sevenMeters?.misses || 0)) {
      errors.push(`${team.id}: 7m attempts do not equal goals + misses.`);
    }
  }

  if (!Array.isArray(players.players)) errors.push("players.json players is not an array.");

  if (errors.length) {
    console.error("Data validation failed:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log("Data validation OK");
  console.log(`Finished matches: ${coverage.finishedMatches}`);
  console.log(`API coverage: ${endpoint.bothAvailable}/${coverage.finishedMatches} (${endpoint.bothPercent}%)`);
  console.log(`Verified analytics: ${verified.eligibleMatches}/${coverage.finishedMatches} (${verified.percent}%)`);
  console.log(`Detailed match exports: ${matchRows.length}`);
  console.log(`Team analytics exports: ${teams.length}`);
  console.log(`Player rows: ${players.players.length}`);

  const warnings = coverage.warningSummary || [];
  if (warnings.length) {
    console.log("Warnings:");
    warnings.forEach((item) => console.log(`- ${item.code}: ${item.count}`));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
