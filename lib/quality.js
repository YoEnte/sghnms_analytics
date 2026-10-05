import { DURATION_TOLERANCE_SECONDS, TEAM_META } from "../config/config.js";

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sameScore(a, b) {
  if (!a || !b) return null;
  const ah = numberOrNull(a.home);
  const aa = numberOrNull(a.away);
  const bh = numberOrNull(b.home);
  const ba = numberOrNull(b.away);
  if ([ah, aa, bh, ba].some((value) => value === null)) return null;
  return ah === bh && aa === ba;
}

function lineupGoalTotals(lineupSummary) {
  if (!lineupSummary?.home || !lineupSummary?.away) return null;

  return {
    home: (lineupSummary.home.players || []).reduce((sum, player) => sum + Number(player.goals || 0), 0),
    away: (lineupSummary.away.players || []).reduce((sum, player) => sum + Number(player.goals || 0), 0)
  };
}

function scorerLineupCoverage(eventAnalysis, lineupSummary) {
  if (!eventAnalysis?.scoreTimeline || !lineupSummary?.home || !lineupSummary?.away) return null;

  const ids = {
    home: new Set((lineupSummary.home.players || []).map((player) => String(player.playerId)).filter(Boolean)),
    away: new Set((lineupSummary.away.players || []).map((player) => String(player.playerId)).filter(Boolean))
  };

  let goalEvents = 0;
  let withPlayer = 0;
  let matched = 0;

  for (const goal of eventAnalysis.scoreTimeline) {
    goalEvents += 1;
    if (!goal.playerId) continue;
    withPlayer += 1;
    if (ids[goal.team]?.has(String(goal.playerId))) matched += 1;
  }

  return {
    goalEvents,
    goalEventsWithPlayer: withPlayer,
    matchedGoalEvents: matched,
    percentage: withPlayer ? Number(((matched / withPlayer) * 100).toFixed(1)) : 100
  };
}

export function ownTeamIdForMatch(match) {
  if (!match) return null;
  const homeId = String(match.home?.id ?? "");
  const awayId = String(match.away?.id ?? "");
  if (TEAM_META[homeId]) return homeId;
  if (TEAM_META[awayId]) return awayId;
  return null;
}

export function expectedDurationSecondsForMatch(match) {
  const teamId = ownTeamIdForMatch(match);
  const minutes = teamId ? Number(TEAM_META[teamId]?.matchMinutes) : NaN;
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : null;
}

export function buildMatchQuality({
  match,
  eventAnalysis = null,
  lineupSummary = null,
  eventsAvailable = false,
  lineupsAvailable = false
}) {
  const officialScore = match?.result?.home != null && match?.result?.away != null
    ? { home: Number(match.result.home), away: Number(match.result.away) }
    : null;
  const eventFinalScore = eventAnalysis?.finalScore ?? null;
  const lineupTotals = lineupsAvailable ? lineupGoalTotals(lineupSummary) : null;
  const expectedDurationSeconds = expectedDurationSecondsForMatch(match);
  const eventDurationSeconds = eventAnalysis?.eventDurationSeconds ?? null;
  const durationDeltaSeconds = expectedDurationSeconds != null && eventDurationSeconds != null
    ? Number(eventDurationSeconds) - Number(expectedDurationSeconds)
    : null;
  const durationMatchesExpected = durationDeltaSeconds == null
    ? null
    : Math.abs(durationDeltaSeconds) <= DURATION_TOLERANCE_SECONDS;
  const eventScoreMatchesOfficial = eventsAvailable ? sameScore(eventFinalScore, officialScore) : null;
  const lineupScoreMatchesOfficial = lineupsAvailable ? sameScore(lineupTotals, officialScore) : null;
  const lineupCoverage = lineupsAvailable ? scorerLineupCoverage(eventAnalysis, lineupSummary) : null;
  const halftimeAvailable = Boolean(eventAnalysis?.halftimeScore);
  const warnings = [];

  const warn = (code, message, severity = "warning") => {
    warnings.push({ code, severity, message });
  };

  if (!eventsAvailable) {
    warn("EVENTS_MISSING", "Events response is missing.", "critical");
  } else if (eventScoreMatchesOfficial === false) {
    warn(
      "EVENT_SCORE_MISMATCH",
      `Event score ${eventFinalScore?.home ?? "?"}:${eventFinalScore?.away ?? "?"} differs from official result ${officialScore?.home ?? "?"}:${officialScore?.away ?? "?"}.`,
      "critical"
    );
  }

  if (!lineupsAvailable) {
    warn("LINEUPS_MISSING", "Lineups response is missing.");
  } else if (lineupScoreMatchesOfficial === false) {
    warn(
      "LINEUP_SCORE_MISMATCH",
      `Lineup goal totals ${lineupTotals?.home ?? "?"}:${lineupTotals?.away ?? "?"} differ from official result ${officialScore?.home ?? "?"}:${officialScore?.away ?? "?"}.`
    );
  }

  if (!halftimeAvailable) {
    warn("HALFTIME_MISSING", "No halftime score could be determined from the event stream.");
  }

  if (durationMatchesExpected === false) {
    warn(
      "DURATION_MISMATCH",
      `Event duration ${eventDurationSeconds}s differs from expected duration ${expectedDurationSeconds}s by ${durationDeltaSeconds}s.`
    );
  }

  if (lineupCoverage && lineupCoverage.percentage < 100) {
    warn(
      "SCORER_LINEUP_MISMATCH",
      `${lineupCoverage.matchedGoalEvents}/${lineupCoverage.goalEventsWithPlayer} goal events with a player match the corresponding lineup.`
    );
  }

  const analyticsEligible = Boolean(eventsAvailable && officialScore && eventScoreMatchesOfficial === true);
  const lineupEligible = Boolean(
    lineupsAvailable &&
    lineupCoverage &&
    lineupCoverage.percentage === 100
  );
  const hasCritical = warnings.some((warning) => warning.severity === "critical");

  return {
    status: hasCritical ? "invalid" : warnings.length ? "warning" : "verified",
    eventsAvailable,
    lineupsAvailable,
    officialScore,
    eventFinalScore,
    lineupGoalTotals: lineupTotals,
    eventScoreMatchesOfficial,
    lineupScoreMatchesOfficial,
    scorerLineupCoverage: lineupCoverage,
    halftimeAvailable,
    halftimeSource: eventAnalysis?.halftimeSource ?? null,
    expectedDurationSeconds,
    eventDurationSeconds,
    durationDeltaSeconds,
    durationMatchesExpected,
    analyticsEligible,
    lineupEligible,
    warnings
  };
}
