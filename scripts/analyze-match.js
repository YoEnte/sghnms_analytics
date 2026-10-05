import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeEvents, formatMatchReport, summarizeLineups } from "../lib/analytics.js";
import { exists, readJson, writeJson } from "../lib/fs-utils.js";
import { buildMatchQuality, expectedDurationSecondsForMatch } from "../lib/quality.js";
import { normalizeMatch } from "../lib/season.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function analyze(matchId, { quiet = false } = {}) {
  const dir = path.join(ROOT, "raw", "matches", String(matchId));
  const matchFile = path.join(dir, "match.json");
  const eventsFile = path.join(dir, "events.json");
  const lineupsFile = path.join(dir, "lineups.json");

  if (!(await exists(matchFile))) {
    throw new Error(`Missing file: ${path.relative(ROOT, matchFile)}`);
  }

  const eventsAvailable = await exists(eventsFile);
  const lineupsAvailable = await exists(lineupsFile);

  if (!eventsAvailable) {
    throw new Error(`Missing file: ${path.relative(ROOT, eventsFile)}`);
  }

  const rawMatch = await readJson(matchFile);
  const eventsPayload = await readJson(eventsFile);
  const lineupsPayload = lineupsAvailable
    ? await readJson(lineupsFile)
    : { data: {} };
  const match = normalizeMatch(rawMatch);
  const expectedDurationSeconds = expectedDurationSecondsForMatch(match);
  const eventAnalysis = analyzeEvents(eventsPayload, {
    analysisDurationSeconds: expectedDurationSeconds
  });
  const lineupSummary = summarizeLineups(lineupsPayload);
  const quality = buildMatchQuality({
    match,
    eventAnalysis,
    lineupSummary,
    eventsAvailable,
    lineupsAvailable
  });

  const output = {
    generatedAt: new Date().toISOString(),
    match,
    quality,
    eventAnalysis,
    lineupSummary
  };

  const outJson = path.join(ROOT, "generated", "matches", `${matchId}.analysis.json`);
  const outTxt = path.join(ROOT, "generated", "matches", `${matchId}.report.txt`);
  await writeJson(outJson, output);
  const report = formatMatchReport(match, eventAnalysis, lineupSummary, quality);
  await fs.mkdir(path.dirname(outTxt), { recursive: true });
  await fs.writeFile(outTxt, report, "utf8");

  if (!quiet) process.stdout.write(report);
  return output;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  const matchId = argValue("--match") || process.argv[2];
  if (!matchId) {
    console.error("Usage: npm run analyze:match -- --match 677910");
    process.exitCode = 1;
  } else {
    analyze(matchId).catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  }
}

export { analyze };
