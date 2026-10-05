import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLUB_ID, TEAM_META } from "../config/config.js";
import { exists, readJson, writeJson } from "../lib/fs-utils.js";
import { buildMatchQuality } from "../lib/quality.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const NORMALIZED = path.join(ROOT, "generated", "normalized");
const PUBLIC = path.join(ROOT, "generated", "public");
const ANALYSES = path.join(ROOT, "generated", "matches");

function blankStats() {
  return {
    games: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    winRate: null
  };
}

function finishStats(stats) {
  stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
  stats.winRate = stats.games ? Number(((stats.wins / stats.games) * 100).toFixed(1)) : null;
  return stats;
}

function blankCoverage(meta = {}) {
  return {
    ...meta,
    finishedMatches: 0,
    eventsAvailable: 0,
    lineupsAvailable: 0,
    bothAvailable: 0,
    analyticsEligible: 0,
    analyticsExcluded: 0,
    analyticsPercent: 0,
    warnings: 0
  };
}

function finishCoverage(coverage) {
  coverage.analyticsExcluded = coverage.finishedMatches - coverage.analyticsEligible;
  coverage.analyticsPercent = coverage.finishedMatches
    ? Number(((coverage.analyticsEligible / coverage.finishedMatches) * 100).toFixed(1))
    : 0;
  return coverage;
}

function ownPerspective(match) {
  const homeOwn = String(match.home?.clubId ?? "") === String(CLUB_ID) || TEAM_META[String(match.home?.id)];
  const awayOwn = String(match.away?.clubId ?? "") === String(CLUB_ID) || TEAM_META[String(match.away?.id)];
  if (!homeOwn && !awayOwn) return null;

  const isHome = Boolean(homeOwn);
  const teamId = String(isHome ? match.home.id : match.away.id);
  const team = TEAM_META[teamId] || null;
  const goalsFor = Number(isHome ? match.result?.home : match.result?.away);
  const goalsAgainst = Number(isHome ? match.result?.away : match.result?.home);

  return {
    isHome,
    teamId,
    team,
    goalsFor,
    goalsAgainst,
    opponent: isHome ? match.away : match.home
  };
}

function addMatch(stats, perspective) {
  stats.games += 1;
  stats.goalsFor += perspective.goalsFor;
  stats.goalsAgainst += perspective.goalsAgainst;
  if (perspective.goalsFor > perspective.goalsAgainst) stats.wins += 1;
  else if (perspective.goalsFor < perspective.goalsAgainst) stats.losses += 1;
  else stats.draws += 1;
}

function percentage(part, whole) {
  return whole ? Number(((part / whole) * 100).toFixed(1)) : 0;
}

async function readAnalysis(matchId) {
  const file = path.join(ANALYSES, `${matchId}.analysis.json`);
  return await exists(file) ? readJson(file) : null;
}

function incrementWarningSummary(summary, warnings = []) {
  for (const warning of warnings) {
    const code = warning?.code || "UNKNOWN";
    if (!summary[code]) {
      summary[code] = {
        code,
        severity: warning?.severity || "warning",
        count: 0
      };
    }
    summary[code].count += 1;
  }
}

async function resolveQuality(match, analysis) {
  const base = path.join(ROOT, "raw", "matches", String(match.id));
  const eventsAvailable = analysis?.quality?.eventsAvailable ?? (Boolean(analysis?.eventAnalysis) || await exists(path.join(base, "events.json")));
  const lineupsAvailable = analysis?.quality?.lineupsAvailable ?? (Boolean(analysis?.lineupSummary) || await exists(path.join(base, "lineups.json")));

  if (analysis?.quality) {
    return {
      quality: analysis.quality,
      eventsAvailable,
      lineupsAvailable
    };
  }

  return {
    quality: buildMatchQuality({
      match,
      eventAnalysis: analysis?.eventAnalysis || null,
      lineupSummary: analysis?.lineupSummary || null,
      eventsAvailable,
      lineupsAvailable
    }),
    eventsAvailable,
    lineupsAvailable
  };
}

async function main() {
  const matchesFile = path.join(NORMALIZED, "matches.json");
  if (!(await exists(matchesFile))) throw new Error("Run npm run normalize first.");

  const { matches = [] } = await readJson(matchesFile);
  const finished = matches.filter((match) => match.status?.finished && match.result?.home != null && match.result?.away != null);

  const scopes = {
    overall: blankStats(),
    seniors: blankStats(),
    juniors: blankStats(),
    male: blankStats(),
    female: blankStats()
  };

  const teamStats = Object.fromEntries(
    Object.entries(TEAM_META).map(([id, meta]) => [id, { id, ...meta, ...blankStats() }])
  );
  const teamCoverage = Object.fromEntries(
    Object.entries(TEAM_META).map(([id, meta]) => [id, blankCoverage({ id, ...meta })])
  );

  const endpointCoverage = {
    eventsAvailable: 0,
    lineupsAvailable: 0,
    bothAvailable: 0
  };
  const verification = {
    eventScoreMatchesOfficial: 0,
    lineupScoreMatchesOfficial: 0,
    halftimeAvailable: 0,
    halftimeEvent: 0,
    halftimeDerived: 0,
    durationMatchesExpected: 0,
    scorerLineupCoverage100: 0
  };
  const qualityMatches = [];
  const warningSummary = {};
  const analysisByMatch = new Map();
  const qualityByMatch = new Map();
  let analysesAvailable = 0;
  let analyticsEligible = 0;

  for (const match of finished) {
    const perspective = ownPerspective(match);
    if (perspective?.team) {
      addMatch(scopes.overall, perspective);
      addMatch(scopes[perspective.team.ageGroup === "senior" ? "seniors" : "juniors"], perspective);
      addMatch(scopes[perspective.team.gender], perspective);
      addMatch(teamStats[perspective.teamId], perspective);
      teamCoverage[perspective.teamId].finishedMatches += 1;
    }

    const analysis = await readAnalysis(match.id);
    analysisByMatch.set(String(match.id), analysis);
    if (analysis) analysesAvailable += 1;

    const resolved = await resolveQuality(match, analysis);
    const { quality, eventsAvailable, lineupsAvailable } = resolved;
    qualityByMatch.set(String(match.id), quality);

    if (eventsAvailable) endpointCoverage.eventsAvailable += 1;
    if (lineupsAvailable) endpointCoverage.lineupsAvailable += 1;
    if (eventsAvailable && lineupsAvailable) endpointCoverage.bothAvailable += 1;

    if (perspective?.team && teamCoverage[perspective.teamId]) {
      const coverage = teamCoverage[perspective.teamId];
      if (eventsAvailable) coverage.eventsAvailable += 1;
      if (lineupsAvailable) coverage.lineupsAvailable += 1;
      if (eventsAvailable && lineupsAvailable) coverage.bothAvailable += 1;
      if (quality.analyticsEligible) coverage.analyticsEligible += 1;
      coverage.warnings += quality.warnings.length;
    }

    if (quality.analyticsEligible) analyticsEligible += 1;
    if (quality.eventScoreMatchesOfficial === true) verification.eventScoreMatchesOfficial += 1;
    if (quality.lineupScoreMatchesOfficial === true) verification.lineupScoreMatchesOfficial += 1;
    if (quality.halftimeAvailable) verification.halftimeAvailable += 1;
    if (quality.halftimeSource === "event") verification.halftimeEvent += 1;
    if (quality.halftimeSource === "derived") verification.halftimeDerived += 1;
    if (quality.durationMatchesExpected === true) verification.durationMatchesExpected += 1;
    if (quality.scorerLineupCoverage?.percentage === 100) verification.scorerLineupCoverage100 += 1;

    incrementWarningSummary(warningSummary, quality.warnings);

    qualityMatches.push({
      id: match.id,
      date: match.date,
      ownTeamId: perspective?.teamId ?? null,
      ownTeam: perspective?.team ?? null,
      quality
    });
  }

  Object.values(scopes).forEach(finishStats);
  Object.values(teamStats).forEach(finishStats);
  Object.values(teamCoverage).forEach(finishCoverage);

  const endpoint = {
    eventsAvailable: endpointCoverage.eventsAvailable,
    eventsPercent: percentage(endpointCoverage.eventsAvailable, finished.length),
    lineupsAvailable: endpointCoverage.lineupsAvailable,
    lineupsPercent: percentage(endpointCoverage.lineupsAvailable, finished.length),
    bothAvailable: endpointCoverage.bothAvailable,
    bothPercent: percentage(endpointCoverage.bothAvailable, finished.length)
  };

  const verifiedAnalytics = {
    eligibleMatches: analyticsEligible,
    excludedMatches: finished.length - analyticsEligible,
    percent: percentage(analyticsEligible, finished.length)
  };

  const coverage = {
    generatedAt: new Date().toISOString(),
    finishedMatches: finished.length,
    analysesAvailable,
    endpointCoverage: endpoint,
    verifiedAnalytics,
    verification: {
      ...verification,
      eventScorePercent: percentage(verification.eventScoreMatchesOfficial, finished.length),
      lineupScorePercent: percentage(verification.lineupScoreMatchesOfficial, finished.length),
      halftimePercent: percentage(verification.halftimeAvailable, finished.length),
      durationPercent: percentage(verification.durationMatchesExpected, finished.length),
      scorerLineupCoverage100Percent: percentage(verification.scorerLineupCoverage100, finished.length)
    },
    warningSummary: Object.values(warningSummary).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    teams: Object.values(teamCoverage)
  };

  await writeJson(path.join(PUBLIC, "overview.json"), {
    generatedAt: new Date().toISOString(),
    scopes
  });
  await writeJson(path.join(PUBLIC, "teams.json"), {
    generatedAt: new Date().toISOString(),
    teams: Object.values(teamStats)
  });
  await writeJson(path.join(PUBLIC, "coverage.json"), coverage);
  await writeJson(path.join(PUBLIC, "quality.json"), {
    generatedAt: new Date().toISOString(),
    matches: qualityMatches
  });
  await writeJson(path.join(PUBLIC, "matches.json"), {
    generatedAt: new Date().toISOString(),
    matches: finished.map((match) => {
      const perspective = ownPerspective(match);
      return {
        id: match.id,
        date: match.date,
        time: match.time,
        home: match.home,
        away: match.away,
        result: match.result,
        competition: match.competition,
        phase: match.phase,
        venue: match.venue,
        ownTeamId: perspective?.teamId ?? null,
        ownTeam: perspective?.team ?? null,
        quality: qualityByMatch.get(String(match.id)) || null
      };
    })
  });

  console.log(`Built public exports for ${finished.length} finished matches.`);
  console.log(`API coverage: ${endpoint.bothAvailable}/${finished.length} (${endpoint.bothPercent}%)`);
  console.log(`Verified analytics: ${verifiedAnalytics.eligibleMatches}/${finished.length} (${verifiedAnalytics.percent}%)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
