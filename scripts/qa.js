import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TEAM_META } from "../config/config.js";
import { exists } from "../lib/fs-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

const required = [
  "config/config.js",
  "lib/handball-client.js",
  "lib/season.js",
  "lib/analytics.js",
  "lib/quality.js",
  "scripts/fetch-season.js",
  "scripts/fetch-match-details.js",
  "scripts/normalize.js",
  "scripts/analyze-match.js",
  "scripts/analyze-all.js",
  "scripts/build-exports.js",
  "scripts/build-analytics-exports.js",
  "scripts/validate-data.js"
];

async function main() {
  const errors = [];

  for (const file of required) {
    if (!(await exists(path.join(ROOT, file)))) errors.push(`Missing: ${file}`);
  }

  for (const file of required.filter((file) => file.endsWith(".js"))) {
    const result = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], { encoding: "utf8" });
    if (result.status !== 0) errors.push(`${file}: ${result.stderr.trim()}`);
  }

  for (const [teamId, meta] of Object.entries(TEAM_META)) {
    if (!Number.isFinite(Number(meta.matchMinutes)) || Number(meta.matchMinutes) <= 0) {
      errors.push(`TEAM_META ${teamId} has invalid matchMinutes.`);
    }
    if (!["senior", "youth"].includes(meta.ageGroup)) {
      errors.push(`TEAM_META ${teamId} has invalid ageGroup.`);
    }
    if (!["male", "female"].includes(meta.gender)) {
      errors.push(`TEAM_META ${teamId} has invalid gender.`);
    }
  }

  if (errors.length) {
    console.error("QA failed:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(`QA OK (${Object.keys(TEAM_META).length} configured teams)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
