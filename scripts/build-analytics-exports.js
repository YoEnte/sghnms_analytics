import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLUB_ID, TEAM_META } from "../config/config.js";
import { exists, readJson, writeJson } from "../lib/fs-utils.js";
import { buildMatchQuality } from "../lib/quality.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const NORMALIZED = path.join(ROOT, "generated", "normalized");
const ANALYSES = path.join(ROOT, "generated", "matches");
const PUBLIC = path.join(ROOT, "generated", "public");
const MATCH_ANALYTICS_DIR = path.join(PUBLIC, "match-analytics");

function ownPerspective(match) {
  const homeOwn = String(match.home?.clubId ?? "") === String(CLUB_ID) || Boolean(TEAM_META[String(match.home?.id)]);
  const awayOwn = String(match.away?.clubId ?? "") === String(CLUB_ID) || Boolean(TEAM_META[String(match.away?.id)]);
  if (!homeOwn && !awayOwn) return null;

  const isHome = Boolean(homeOwn);
  const teamId = String(isHome ? match.home.id : match.away.id);
  return {
    isHome,
    ownSide: isHome ? "home" : "away",
    opponentSide: isHome ? "away" : "home",
    teamId,
    team: TEAM_META[teamId] || null,
    opponent: isHome ? match.away : match.home
  };
}

function orientPair(value, perspective) {
  if (!value) return null;
  return {
    own: value[perspective.ownSide] ?? null,
    opponent: value[perspective.opponentSide] ?? null
  };
}

function orientScore(score, perspective) {
  if (!score) return null;
  return perspective.isHome
    ? { own: Number(score.home ?? 0), opponent: Number(score.away ?? 0) }
    : { own: Number(score.away ?? 0), opponent: Number(score.home ?? 0) };
}

function percent(part, whole) {
  return whole ? Number(((part / whole) * 100).toFixed(1)) : null;
}

function playerMapForSide(analysis, side) {
  const map = new Map();
  const lineup = analysis.lineupSummary?.[side]?.players || [];
  const scorers = analysis.eventAnalysis?.scorers?.[side] || [];
  const sevenMeters = analysis.eventAnalysis?.sevenMeterPlayers?.[side] || [];
  const discipline = analysis.eventAnalysis?.playerDiscipline?.[side] || [];

  const ensure = (playerId, name = "Unknown") => {
    const key = String(playerId ?? `unknown-${name}`);
    if (!map.has(key)) {
      map.set(key, {
        playerId: playerId ?? null,
        name: name || "Unknown",
        number: null,
        inLineup: false,
        goals: 0,
        sevenMeters: { goals: 0, misses: 0, attempts: 0, percentage: null },
        warnings: 0,
        twoMinutes: 0,
        disqualifications: 0
      });
    }
    return map.get(key);
  };

  for (const player of lineup) {
    const item = ensure(player.playerId, player.name);
    item.name = player.name || item.name;
    item.number = player.number ?? null;
    item.inLineup = true;
  }
  for (const player of scorers) {
    const item = ensure(player.playerId, player.name);
    item.goals = Number(player.goals || 0);
  }
  for (const player of sevenMeters) {
    const item = ensure(player.playerId, player.name);
    item.sevenMeters = {
      goals: Number(player.goals || 0),
      misses: Number(player.misses || 0),
      attempts: Number(player.attempts || 0),
      percentage: player.attempts ? Number(((Number(player.goals || 0) / Number(player.attempts)) * 100).toFixed(1)) : null
    };
  }
  for (const player of discipline) {
    const item = ensure(player.playerId, player.name);
    item.warnings = Number(player.warnings || 0);
    item.twoMinutes = Number(player.twoMinutes || 0);
    item.disqualifications = Number(player.disqualifications || 0);
  }

  return [...map.values()].sort((a, b) => b.goals - a.goals || (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name));
}

function orientNumericSituations(numeric, perspective) {
  if (!numeric) return null;

  const ownPowerKey = perspective.isHome ? "homePowerPlay" : "homeShortHanded";
  const ownShortKey = perspective.isHome ? "homeShortHanded" : "homePowerPlay";

  const goalsForKey = (key) => {
    const value = numeric.goals?.[key] || { home: 0, away: 0 };
    return orientScore(value, perspective);
  };

  return {
    suspensions: (numeric.suspensions || []).map((item) => ({
      ...item,
      side: item.side === perspective.ownSide ? "own" : "opponent"
    })),
    even: {
      seconds: Number(numeric.duration?.even || 0),
      goals: goalsForKey("even")
    },
    powerPlay: {
      seconds: Number(numeric.duration?.[ownPowerKey] || 0),
      goals: goalsForKey(ownPowerKey)
    },
    shortHanded: {
      seconds: Number(numeric.duration?.[ownShortKey] || 0),
      goals: goalsForKey(ownShortKey)
    }
  };
}

function publicMatchAnalytics(match, perspective, analysis, quality) {
  const event = analysis?.eventAnalysis || null;
  const base = {
    generatedAt: new Date().toISOString(),
    match: {
      id: match.id,
      date: match.date,
      time: match.time,
      competition: match.competition,
      phase: match.phase,
      venue: match.venue,
      home: match.home,
      away: match.away,
      result: match.result,
      ownTeamId: perspective.teamId,
      ownTeam: perspective.team,
      isHome: perspective.isHome,
      opponent: perspective.opponent
    },
    quality
  };

  if (!quality?.analyticsEligible || !event) {
    return { ...base, analytics: null };
  }

  const flow = (event.scoreTimeline || []).map((item) => ({
    eventId: item.eventId,
    seconds: item.seconds,
    clock: item.clock,
    side: item.team === perspective.ownSide ? "own" : "opponent",
    playerId: item.playerId,
    playerName: item.playerName,
    isSevenMeter: Boolean(item.isSevenMeter),
    score: orientScore(item.score, perspective)
  }));

  const splits = (event.fiveMinuteSplits || []).map((item) => ({
    startSeconds: item.startSeconds,
    endSeconds: item.endSeconds,
    label: item.label,
    goals: orientScore(item.goals, perspective),
    scoreEnd: orientScore(item.scoreEnd, perspective),
    goalDifference: perspective.isHome ? Number(item.goalDifference || 0) : -Number(item.goalDifference || 0)
  }));

  const timeouts = (event.timeouts || []).map((item) => ({
    side: item.team === perspective.ownSide ? "own" : "opponent",
    seconds: item.seconds,
    clock: item.clock,
    score: orientScore(item.score, perspective),
    windowSeconds: item.windowSeconds,
    scoreAfterWindow: orientScore(item.scoreAfterWindow, perspective),
    goalsAfter: orientScore(item.goalsAfter, perspective)
  }));

  const ownPlayers = playerMapForSide(analysis, perspective.ownSide);
  const opponentPlayers = playerMapForSide(analysis, perspective.opponentSide);

  return {
    ...base,
    analytics: {
      duration: {
        expectedSeconds: quality.expectedDurationSeconds,
        eventSeconds: event.eventDurationSeconds,
        analysisSeconds: event.analysisDurationSeconds,
        analysisClock: event.analysisDuration
      },
      score: {
        final: orientScore(event.finalScore, perspective),
        halftime: orientScore(event.halftimeScore, perspective),
        halftimeSource: event.halftimeSource
      },
      matchFlow: flow,
      fiveMinuteSplits: splits,
      sevenMeters: orientPair(event.sevenMeters, perspective),
      sanctions: orientPair(event.sanctions, perspective),
      longestRuns: orientPair(event.longestRuns, perspective),
      scoringDroughts: orientPair(event.scoringDroughts, perspective),
      timeouts,
      numericSituations: orientNumericSituations(event.numericSituations, perspective),
      players: {
        own: ownPlayers,
        opponent: opponentPlayers
      }
    }
  };
}

function blankTeamAnalytics(id, meta) {
  return {
    id,
    ...meta,
    finishedMatches: 0,
    analyticsMatches: 0,
    coveragePercent: null,
    sevenMeters: { goals: 0, misses: 0, attempts: 0, percentage: null },
    sanctions: { warnings: 0, twoMinutes: 0, disqualifications: 0 },
    timeouts: {
      own: { count: 0, goalsForAfter: 0, goalsAgainstAfter: 0 },
      opponent: { count: 0, goalsForAfter: 0, goalsAgainstAfter: 0 }
    },
    numericSituations: {
      even: { seconds: 0, goalsFor: 0, goalsAgainst: 0 },
      powerPlay: { seconds: 0, goalsFor: 0, goalsAgainst: 0 },
      shortHanded: { seconds: 0, goalsFor: 0, goalsAgainst: 0 }
    },
    fiveMinuteSplits: {},
    longestRun: null,
    longestDrought: null,
    players: {}
  };
}

function addPlayerAggregate(team, player) {
  const key = String(player.playerId ?? `unknown-${player.name}`);
  const current = team.players[key] || {
    playerId: player.playerId ?? null,
    name: player.name,
    number: player.number ?? null,
    appearances: 0,
    goals: 0,
    goalsPerAppearance: null,
    goalSharePercent: null,
    sevenMeters: { goals: 0, misses: 0, attempts: 0, percentage: null },
    warnings: 0,
    twoMinutes: 0,
    disqualifications: 0
  };

  if (player.inLineup) current.appearances += 1;
  if (current.number == null && player.number != null) current.number = player.number;
  current.goals += Number(player.goals || 0);
  current.sevenMeters.goals += Number(player.sevenMeters?.goals || 0);
  current.sevenMeters.misses += Number(player.sevenMeters?.misses || 0);
  current.sevenMeters.attempts += Number(player.sevenMeters?.attempts || 0);
  current.warnings += Number(player.warnings || 0);
  current.twoMinutes += Number(player.twoMinutes || 0);
  current.disqualifications += Number(player.disqualifications || 0);
  team.players[key] = current;
}

function addMatchToTeamAnalytics(team, detail) {
  const analytics = detail.analytics;
  if (!analytics) return;
  team.analyticsMatches += 1;

  const seven = analytics.sevenMeters?.own || {};
  team.sevenMeters.goals += Number(seven.goals || 0);
  team.sevenMeters.misses += Number(seven.misses || 0);
  team.sevenMeters.attempts += Number(seven.attempts || 0);

  const sanctions = analytics.sanctions?.own || {};
  team.sanctions.warnings += Number(sanctions.warnings || 0);
  team.sanctions.twoMinutes += Number(sanctions.twoMinutes || 0);
  team.sanctions.disqualifications += Number(sanctions.disqualifications || 0);

  for (const timeout of analytics.timeouts || []) {
    const bucket = timeout.side === "own" ? team.timeouts.own : team.timeouts.opponent;
    bucket.count += 1;
    bucket.goalsForAfter += Number(timeout.goalsAfter?.own || 0);
    bucket.goalsAgainstAfter += Number(timeout.goalsAfter?.opponent || 0);
  }

  for (const key of ["even", "powerPlay", "shortHanded"]) {
    const situation = analytics.numericSituations?.[key];
    if (!situation) continue;
    team.numericSituations[key].seconds += Number(situation.seconds || 0);
    team.numericSituations[key].goalsFor += Number(situation.goals?.own || 0);
    team.numericSituations[key].goalsAgainst += Number(situation.goals?.opponent || 0);
  }

  for (const split of analytics.fiveMinuteSplits || []) {
    const current = team.fiveMinuteSplits[split.label] || {
      label: split.label,
      startSeconds: split.startSeconds,
      endSeconds: split.endSeconds,
      games: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0
    };
    current.games += 1;
    current.goalsFor += Number(split.goals?.own || 0);
    current.goalsAgainst += Number(split.goals?.opponent || 0);
    current.goalDifference += Number(split.goalDifference || 0);
    team.fiveMinuteSplits[split.label] = current;
  }

  const run = analytics.longestRuns?.own;
  if (run && (!team.longestRun || Number(run.goals || 0) > Number(team.longestRun.goals || 0))) {
    team.longestRun = {
      matchId: detail.match.id,
      date: detail.match.date,
      opponent: detail.match.opponent?.name || null,
      goals: Number(run.goals || 0),
      start: run.start,
      end: run.end
    };
  }

  const drought = analytics.scoringDroughts?.own;
  if (drought && (!team.longestDrought || Number(drought.seconds || 0) > Number(team.longestDrought.seconds || 0))) {
    team.longestDrought = {
      matchId: detail.match.id,
      date: detail.match.date,
      opponent: detail.match.opponent?.name || null,
      seconds: Number(drought.seconds || 0),
      duration: drought.duration,
      start: drought.start,
      end: drought.end
    };
  }

  for (const player of analytics.players?.own || []) addPlayerAggregate(team, player);
}

function finalizeTeamAnalytics(team) {
  team.coveragePercent = percent(team.analyticsMatches, team.finishedMatches);
  team.sevenMeters.percentage = percent(team.sevenMeters.goals, team.sevenMeters.attempts);

  for (const bucket of [team.timeouts.own, team.timeouts.opponent]) {
    bucket.goalDifferenceAfter = bucket.goalsForAfter - bucket.goalsAgainstAfter;
    bucket.goalsForPerTimeout = bucket.count ? Number((bucket.goalsForAfter / bucket.count).toFixed(2)) : null;
    bucket.goalsAgainstPerTimeout = bucket.count ? Number((bucket.goalsAgainstAfter / bucket.count).toFixed(2)) : null;
  }

  team.fiveMinuteSplits = Object.values(team.fiveMinuteSplits)
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .map((item) => ({
      ...item,
      goalsForPerGame: item.games ? Number((item.goalsFor / item.games).toFixed(2)) : null,
      goalsAgainstPerGame: item.games ? Number((item.goalsAgainst / item.games).toFixed(2)) : null,
      goalDifferencePerGame: item.games ? Number((item.goalDifference / item.games).toFixed(2)) : null
    }));

  const totalGoals = Object.values(team.players).reduce((sum, player) => sum + Number(player.goals || 0), 0);
  team.players = Object.values(team.players)
    .map((player) => ({
      ...player,
      goalsPerAppearance: player.appearances ? Number((player.goals / player.appearances).toFixed(2)) : null,
      goalSharePercent: totalGoals ? Number(((player.goals / totalGoals) * 100).toFixed(1)) : null,
      sevenMeters: {
        ...player.sevenMeters,
        percentage: percent(player.sevenMeters.goals, player.sevenMeters.attempts)
      }
    }))
    .sort((a, b) => b.goals - a.goals || b.appearances - a.appearances || a.name.localeCompare(b.name));

  return team;
}

async function resolveQuality(match, analysis) {
  if (analysis?.quality) return analysis.quality;
  const eventsAvailable = Boolean(analysis?.eventAnalysis);
  const lineupsAvailable = Boolean(analysis?.lineupSummary);
  return buildMatchQuality({
    match,
    eventAnalysis: analysis?.eventAnalysis || null,
    lineupSummary: analysis?.lineupSummary || null,
    eventsAvailable,
    lineupsAvailable
  });
}

async function main() {
  const matchesFile = path.join(NORMALIZED, "matches.json");
  if (!(await exists(matchesFile))) throw new Error("Run npm run normalize first.");

  const { matches = [] } = await readJson(matchesFile);
  const finished = matches.filter((match) => match.status?.finished && match.result?.home != null && match.result?.away != null);
  const teams = Object.fromEntries(Object.entries(TEAM_META).map(([id, meta]) => [id, blankTeamAnalytics(id, meta)]));
  const index = [];

  await fs.rm(MATCH_ANALYTICS_DIR, { recursive: true, force: true });
  await fs.mkdir(MATCH_ANALYTICS_DIR, { recursive: true });

  for (const match of finished) {
    const perspective = ownPerspective(match);
    if (!perspective?.team) continue;
    teams[perspective.teamId].finishedMatches += 1;

    const analysisFile = path.join(ANALYSES, `${match.id}.analysis.json`);
    const analysis = await exists(analysisFile) ? await readJson(analysisFile) : null;
    const quality = await resolveQuality(match, analysis);
    const detail = publicMatchAnalytics(match, perspective, analysis, quality);
    const filename = `${match.id}.json`;
    await writeJson(path.join(MATCH_ANALYTICS_DIR, filename), detail);

    index.push({
      id: match.id,
      date: match.date,
      time: match.time,
      ownTeamId: perspective.teamId,
      opponent: perspective.opponent?.name || null,
      analyticsEligible: Boolean(quality?.analyticsEligible),
      qualityStatus: quality?.status || null,
      path: `match-analytics/${filename}`
    });

    if (detail.analytics) addMatchToTeamAnalytics(teams[perspective.teamId], detail);
  }

  const teamList = Object.values(teams).map(finalizeTeamAnalytics);
  const players = teamList.flatMap((team) => team.players.map((player) => ({
    teamId: team.id,
    teamName: team.name,
    ...player
  })));

  await writeJson(path.join(MATCH_ANALYTICS_DIR, "index.json"), {
    generatedAt: new Date().toISOString(),
    matches: index
  });
  await writeJson(path.join(PUBLIC, "team-analytics.json"), {
    generatedAt: new Date().toISOString(),
    teams: teamList
  });
  await writeJson(path.join(PUBLIC, "players.json"), {
    generatedAt: new Date().toISOString(),
    players
  });

  const matchesPublicFile = path.join(PUBLIC, "matches.json");
  if (await exists(matchesPublicFile)) {
    const payload = await readJson(matchesPublicFile);
    const byId = new Map(index.map((item) => [String(item.id), item]));
    payload.matches = (payload.matches || []).map((match) => {
      const detail = byId.get(String(match.id));
      return {
        ...match,
        analyticsAvailable: Boolean(detail?.analyticsEligible),
        analyticsPath: detail?.path || null
      };
    });
    await writeJson(matchesPublicFile, payload);
  }

  const eligible = index.filter((item) => item.analyticsEligible).length;
  console.log(`Built detailed analytics exports for ${index.length} finished matches.`);
  console.log(`Analytics eligible: ${eligible}/${index.length}`);
  console.log(`Team analytics: ${teamList.length} teams; player rows: ${players.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
