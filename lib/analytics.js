function eventArray(payload) {
  return Array.isArray(payload?.data) ? payload.data : [];
}

function parseClock(value) {
  const match = String(value || "").trim().match(/^(\d+):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizedBlock(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function blockOffsets(events) {
  const offsets = new Map();

  for (const event of events) {
    const block = normalizedBlock(event.block);
    if (!block || offsets.has(block)) continue;

    const typeId = Number(event.event_type?.id);
    if (typeId === 10000) {
      offsets.set(block, Number(event.global_minute || 0) * 60);
    }
  }

  if (!offsets.has("1. Halbzeit")) offsets.set("1. Halbzeit", 0);

  const secondHalf = events.find((event) => normalizedBlock(event.block) === "2. Halbzeit");
  if (secondHalf && !offsets.has("2. Halbzeit")) {
    const localSeconds = parseClock(secondHalf.minute);
    const globalFloor = Number(secondHalf.global_minute || 0) * 60;
    offsets.set("2. Halbzeit", Math.max(0, globalFloor - Math.floor(localSeconds / 60) * 60));
  }

  return offsets;
}

export function eventAbsoluteSeconds(events, event) {
  const offsets = blockOffsets(events);
  const block = normalizedBlock(event.block);
  const localSeconds = parseClock(event.minute);

  if (offsets.has(block)) {
    return offsets.get(block) + localSeconds;
  }

  const globalMinute = Number(event.global_minute);
  if (Number.isFinite(globalMinute)) {
    return globalMinute * 60 + (localSeconds % 60);
  }

  return localSeconds;
}

export function formatClock(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const secs = value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function teamKey(event) {
  return event?.is_home ? "home" : "away";
}

function eventDurationSeconds(events) {
  const end = [...events].reverse().find((event) => Number(event.event_type?.id) === 10001)
    || [...events].reverse().find((event) => Number(event.event_type?.id) === 10002)
    || events.at(-1);
  return end ? eventAbsoluteSeconds(events, end) : 0;
}

function scoreAt(events, seconds) {
  const timed = events
    .map((event) => ({ event, seconds: eventAbsoluteSeconds(events, event) }))
    .filter((item) => item.seconds <= seconds && item.event.score)
    .sort((a, b) => a.seconds - b.seconds || Number(a.event.id || 0) - Number(b.event.id || 0));

  const last = timed.at(-1)?.event;
  return {
    home: Number(last?.score?.local ?? 0),
    away: Number(last?.score?.visitor ?? 0)
  };
}

function scoreDelta(before, after) {
  return {
    home: after.home - before.home,
    away: after.away - before.away
  };
}

function playerName(player) {
  return [player?.first_name, player?.last_name].filter(Boolean).join(" ").trim();
}

function groupScorers(goalEvents) {
  const teams = { home: new Map(), away: new Map() };

  for (const event of goalEvents) {
    const side = teamKey(event);
    const id = String(event.player?.id ?? `unknown-${event.id}`);
    const current = teams[side].get(id) || {
      playerId: event.player?.id ?? null,
      name: playerName(event.player) || "Unknown",
      goals: 0,
      sevenMeterGoals: 0
    };

    current.goals += 1;
    if (Number(event.event_type?.id) === 39) current.sevenMeterGoals += 1;
    teams[side].set(id, current);
  }

  const sort = (map) => [...map.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
  return { home: sort(teams.home), away: sort(teams.away) };
}

function sevenMeters(events) {
  const result = {
    home: { goals: 0, misses: 0, attempts: 0, percentage: null },
    away: { goals: 0, misses: 0, attempts: 0, percentage: null }
  };

  for (const event of events) {
    const id = Number(event.event_type?.id);
    if (id !== 39 && id !== 1004) continue;
    const side = teamKey(event);
    if (id === 39) result[side].goals += 1;
    if (id === 1004) result[side].misses += 1;
    result[side].attempts += 1;
  }

  for (const side of ["home", "away"]) {
    const item = result[side];
    item.percentage = item.attempts ? Number(((item.goals / item.attempts) * 100).toFixed(1)) : null;
  }

  return result;
}

function sanctions(events) {
  const result = {
    home: { warnings: 0, twoMinutes: 0, disqualifications: 0 },
    away: { warnings: 0, twoMinutes: 0, disqualifications: 0 }
  };

  for (const event of events) {
    if (!event.event_type?.is_sanction) continue;
    const side = teamKey(event);
    const id = Number(event.event_type?.id);
    const name = String(event.event_type?.name || "").toLowerCase();
    if (id === 2 || name.includes("verwarn")) result[side].warnings += 1;
    else if (id === 13 || name.includes("zwei minuten")) result[side].twoMinutes += 1;
    else if (name.includes("disqual")) result[side].disqualifications += 1;
  }

  return result;
}

function halftimeScoreInfo(events) {
  const explicit = events.find(
    (event) => Number(event.event_type?.id) === 10002 && normalizedBlock(event.block) === "1. Halbzeit"
  );

  if (explicit?.score) {
    return {
      score: {
        home: Number(explicit.score.local ?? 0),
        away: Number(explicit.score.visitor ?? 0)
      },
      source: "event"
    };
  }

  const firstHalfWithScore = events
    .filter((event) => normalizedBlock(event.block) === "1. Halbzeit" && event.score)
    .map((event) => ({ event, seconds: eventAbsoluteSeconds(events, event) }))
    .sort((a, b) => a.seconds - b.seconds || Number(a.event.id || 0) - Number(b.event.id || 0));

  const last = firstHalfWithScore.at(-1)?.event;
  if (!last?.score) return { score: null, source: null };

  return {
    score: {
      home: Number(last.score.local ?? 0),
      away: Number(last.score.visitor ?? 0)
    },
    source: "derived"
  };
}

function goalEvents(events) {
  return events
    .filter((event) => Boolean(event.event_type?.is_goal))
    .map((event) => ({ ...event, absoluteSeconds: eventAbsoluteSeconds(events, event) }))
    .sort((a, b) => a.absoluteSeconds - b.absoluteSeconds || Number(a.id || 0) - Number(b.id || 0));
}

function longestRuns(goals) {
  const best = { home: null, away: null };
  let current = null;

  const finish = () => {
    if (!current) return;
    const existing = best[current.side];
    if (!existing || current.goals > existing.goals) best[current.side] = { ...current };
  };

  for (const goal of goals) {
    const side = teamKey(goal);
    if (!current || current.side !== side) {
      finish();
      current = {
        side,
        goals: 1,
        startSeconds: goal.absoluteSeconds,
        endSeconds: goal.absoluteSeconds,
        startScore: {
          home: Number(goal.score?.local ?? 0) - (side === "home" ? 1 : 0),
          away: Number(goal.score?.visitor ?? 0) - (side === "away" ? 1 : 0)
        },
        endScore: {
          home: Number(goal.score?.local ?? 0),
          away: Number(goal.score?.visitor ?? 0)
        }
      };
    } else {
      current.goals += 1;
      current.endSeconds = goal.absoluteSeconds;
      current.endScore = {
        home: Number(goal.score?.local ?? 0),
        away: Number(goal.score?.visitor ?? 0)
      };
    }
  }

  finish();

  for (const side of ["home", "away"]) {
    if (best[side]) {
      best[side].start = formatClock(best[side].startSeconds);
      best[side].end = formatClock(best[side].endSeconds);
    }
  }

  return best;
}

function scoringDroughts(goals, durationSeconds) {
  const result = {};

  for (const side of ["home", "away"]) {
    const times = goals
      .filter((goal) => teamKey(goal) === side && goal.absoluteSeconds <= durationSeconds)
      .map((goal) => goal.absoluteSeconds);
    const points = [0, ...times, durationSeconds].sort((a, b) => a - b);
    let best = { seconds: 0, startSeconds: 0, endSeconds: 0 };

    for (let i = 1; i < points.length; i += 1) {
      const gap = points[i] - points[i - 1];
      if (gap > best.seconds) {
        best = { seconds: gap, startSeconds: points[i - 1], endSeconds: points[i] };
      }
    }

    result[side] = {
      ...best,
      duration: formatClock(best.seconds),
      start: formatClock(best.startSeconds),
      end: formatClock(best.endSeconds)
    };
  }

  return result;
}

function fiveMinuteSplits(events, durationSeconds) {
  const bins = [];
  const interval = 5 * 60;

  for (let start = 0; start < durationSeconds; start += interval) {
    const end = Math.min(durationSeconds, start + interval);
    const before = scoreAt(events, start === 0 ? 0 : start - 0.001);
    const after = scoreAt(events, end);
    bins.push({
      startSeconds: start,
      endSeconds: end,
      label: `${Math.floor(start / 60)}-${Math.ceil(end / 60)}`,
      scoreEnd: after,
      goals: scoreDelta(before, after),
      goalDifference: (after.home - before.home) - (after.away - before.away)
    });
  }

  return bins;
}

function timeoutAnalysis(events, durationSeconds, windowSeconds = 180) {
  return events
    .filter((event) => Number(event.event_type?.id) === 30)
    .map((event) => {
      const at = eventAbsoluteSeconds(events, event);
      const score = {
        home: Number(event.score?.local ?? 0),
        away: Number(event.score?.visitor ?? 0)
      };
      const windowEnd = Math.min(durationSeconds, at + windowSeconds);
      const after = scoreAt(events, windowEnd);
      return {
        team: teamKey(event),
        seconds: at,
        clock: formatClock(at),
        score,
        windowSeconds: Math.max(0, windowEnd - at),
        scoreAfterWindow: after,
        goalsAfter: scoreDelta(score, after)
      };
    });
}


function sevenMeterPlayers(events) {
  const result = { home: new Map(), away: new Map() };

  for (const event of events) {
    const id = Number(event.event_type?.id);
    if (id !== 39 && id !== 1004) continue;

    const side = teamKey(event);
    const playerId = event.player?.id ?? null;
    if (playerId == null) continue;

    const key = String(playerId);
    const current = result[side].get(key) || {
      playerId,
      name: playerName(event.player) || "Unknown",
      goals: 0,
      misses: 0,
      attempts: 0,
      percentage: null
    };

    if (id === 39) current.goals += 1;
    if (id === 1004) current.misses += 1;
    current.attempts += 1;
    result[side].set(key, current);
  }

  const finalize = (map) => [...map.values()]
    .map((item) => ({
      ...item,
      percentage: item.attempts ? Number(((item.goals / item.attempts) * 100).toFixed(1)) : null
    }))
    .sort((a, b) => b.attempts - a.attempts || b.goals - a.goals || a.name.localeCompare(b.name));

  return { home: finalize(result.home), away: finalize(result.away) };
}

function playerDiscipline(events) {
  const result = { home: new Map(), away: new Map() };

  for (const event of events) {
    if (!event.event_type?.is_sanction) continue;
    const playerId = event.player?.id ?? null;
    if (playerId == null) continue;

    const side = teamKey(event);
    const key = String(playerId);
    const current = result[side].get(key) || {
      playerId,
      name: playerName(event.player) || "Unknown",
      warnings: 0,
      twoMinutes: 0,
      disqualifications: 0
    };

    const id = Number(event.event_type?.id);
    const name = String(event.event_type?.name || "").toLowerCase();
    if (id === 2 || name.includes("verwarn")) current.warnings += 1;
    else if (id === 13 || name.includes("zwei minuten")) current.twoMinutes += 1;
    else if (name.includes("disqual")) current.disqualifications += 1;
    result[side].set(key, current);
  }

  const finalize = (map) => [...map.values()]
    .sort((a, b) => b.twoMinutes - a.twoMinutes || b.warnings - a.warnings || a.name.localeCompare(b.name));

  return { home: finalize(result.home), away: finalize(result.away) };
}

function numericSituations(events, goals, durationSeconds) {
  const suspensions = events
    .filter((event) => Number(event.event_type?.id) === 13)
    .map((event) => {
      const startSeconds = eventAbsoluteSeconds(events, event);
      return {
        eventId: event.id ?? null,
        side: teamKey(event),
        playerId: event.player?.id ?? null,
        playerName: playerName(event.player) || null,
        startSeconds,
        endSeconds: Math.min(durationSeconds, startSeconds + 120),
        start: formatClock(startSeconds),
        end: formatClock(Math.min(durationSeconds, startSeconds + 120))
      };
    })
    .filter((item) => item.startSeconds < durationSeconds && item.endSeconds > item.startSeconds)
    .sort((a, b) => a.startSeconds - b.startSeconds || Number(a.eventId || 0) - Number(b.eventId || 0));

  const activeCount = (side, seconds, eventId = null) => suspensions.filter((item) => {
    if (item.side !== side) return false;
    const startsBefore = item.startSeconds < seconds;
    const startsSameAndEarlier = item.startSeconds === seconds && (
      eventId == null || item.eventId == null || Number(item.eventId) <= Number(eventId)
    );
    return (startsBefore || startsSameAndEarlier) && item.endSeconds > seconds;
  }).length;

  const classify = (seconds, eventId = null) => {
    const homeSuspended = activeCount("home", seconds, eventId);
    const awaySuspended = activeCount("away", seconds, eventId);
    if (homeSuspended < awaySuspended) return { key: "homePowerPlay", homeSuspended, awaySuspended };
    if (homeSuspended > awaySuspended) return { key: "homeShortHanded", homeSuspended, awaySuspended };
    return { key: "even", homeSuspended, awaySuspended };
  };

  const result = {
    suspensions,
    duration: {
      even: 0,
      homePowerPlay: 0,
      homeShortHanded: 0
    },
    goals: {
      even: { home: 0, away: 0 },
      homePowerPlay: { home: 0, away: 0 },
      homeShortHanded: { home: 0, away: 0 }
    }
  };

  const boundaries = new Set([0, durationSeconds]);
  for (const item of suspensions) {
    boundaries.add(Math.max(0, item.startSeconds));
    boundaries.add(Math.min(durationSeconds, item.endSeconds));
  }
  const sorted = [...boundaries].sort((a, b) => a - b);
  for (let index = 1; index < sorted.length; index += 1) {
    const start = sorted[index - 1];
    const end = sorted[index];
    if (end <= start) continue;
    const midpoint = start + (end - start) / 2;
    const { key } = classify(midpoint);
    result.duration[key] += end - start;
  }

  for (const goal of goals) {
    if (goal.absoluteSeconds > durationSeconds) continue;
    const { key } = classify(goal.absoluteSeconds, goal.id ?? null);
    result.goals[key][teamKey(goal)] += 1;
  }

  return result;
}

export function analyzeEvents(eventsPayload, { analysisDurationSeconds = null } = {}) {
  const events = eventArray(eventsPayload);
  const goals = goalEvents(events);
  const rawDurationSeconds = eventDurationSeconds(events);
  const durationSeconds = Number.isFinite(Number(analysisDurationSeconds)) && Number(analysisDurationSeconds) > 0
    ? Number(analysisDurationSeconds)
    : rawDurationSeconds;
  const finalEvent = [...events].reverse().find((event) => event.score);
  const finalScore = {
    home: Number(finalEvent?.score?.local ?? 0),
    away: Number(finalEvent?.score?.visitor ?? 0)
  };
  const halftime = halftimeScoreInfo(events);

  const scoreTimeline = goals.map((goal) => ({
    eventId: goal.id ?? null,
    seconds: goal.absoluteSeconds,
    clock: formatClock(goal.absoluteSeconds),
    team: teamKey(goal),
    playerId: goal.player?.id ?? null,
    playerName: playerName(goal.player) || null,
    isSevenMeter: Number(goal.event_type?.id) === 39,
    score: {
      home: Number(goal.score?.local ?? 0),
      away: Number(goal.score?.visitor ?? 0)
    }
  }));

  return {
    eventCount: events.length,
    eventDurationSeconds: rawDurationSeconds,
    eventDuration: formatClock(rawDurationSeconds),
    analysisDurationSeconds: durationSeconds,
    analysisDuration: formatClock(durationSeconds),
    finalScore,
    scoreTimeline,
    halftimeScore: halftime.score,
    halftimeSource: halftime.source,
    scorers: groupScorers(goals),
    sevenMeters: sevenMeters(events),
    sevenMeterPlayers: sevenMeterPlayers(events),
    sanctions: sanctions(events),
    playerDiscipline: playerDiscipline(events),
    numericSituations: numericSituations(events, goals, durationSeconds),
    longestRuns: longestRuns(goals),
    scoringDroughts: scoringDroughts(goals, durationSeconds),
    fiveMinuteSplits: fiveMinuteSplits(events, durationSeconds),
    timeouts: timeoutAnalysis(events, durationSeconds),
    eventTypes: Object.values(events.reduce((acc, event) => {
      const id = String(event.event_type?.id ?? "unknown");
      if (!acc[id]) {
        acc[id] = { id: event.event_type?.id ?? null, name: event.event_type?.name ?? "Unknown", count: 0 };
      }
      acc[id].count += 1;
      return acc;
    }, {})).sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)))
  };
}

export function summarizeLineups(lineupsPayload) {
  const data = lineupsPayload?.data || {};
  const result = {};

  for (const [side, key] of [["home", "local"], ["away", "visitor"]]) {
    const group = data[key] || {};
    const players = Array.isArray(group.players) ? group.players : [];
    const staff = Array.isArray(group.staff) ? group.staff : [];
    result[side] = {
      team: group.team || null,
      playerCount: players.length,
      staffCount: staff.length,
      players: players.map((entry) => ({
        playerId: entry.player?.id ?? null,
        name: playerName(entry.player),
        number: entry.number ?? null,
        isGoalkeeper: Boolean(entry.is_goalkeeper),
        isCaptain: Boolean(entry.is_captain),
        isStarter: Boolean(entry.is_starter),
        minutesPlayed: entry.minutes_played ?? null,
        goals: Number(entry.goals || 0),
        sevenMeterGoals: Number(entry.seven_meter_goals || 0),
        sevenMeterAttempts: Number(entry.seven_meter_attempts || 0),
        twoMinutes: Number(entry.two_minutes || 0),
        sanctions: entry.sanctions || {}
      })),
      staff: staff.map((entry) => ({
        playerId: entry.player?.id ?? null,
        name: playerName(entry.player),
        role: entry.role?.name ?? null
      }))
    };
  }

  return result;
}

export function formatMatchReport(match, eventAnalysis, lineupSummary, quality = null) {
  const homeName = match?.home?.name || lineupSummary?.home?.team?.name || "Home";
  const awayName = match?.away?.name || lineupSummary?.away?.team?.name || "Away";
  const lines = [];
  const score = eventAnalysis.finalScore;

  lines.push(`${homeName} - ${awayName}`);
  lines.push(`${score.home}:${score.away}`);
  if (eventAnalysis.halftimeScore) {
    lines.push(`Halftime: ${eventAnalysis.halftimeScore.home}:${eventAnalysis.halftimeScore.away} (${eventAnalysis.halftimeSource})`);
  }
  if (quality) {
    lines.push(`Analytics eligible: ${quality.analyticsEligible ? "yes" : "no"}`);
    lines.push(`Quality status: ${quality.status}`);
    if (quality.warnings.length) {
      lines.push("Warnings:");
      quality.warnings.forEach((warning) => lines.push(`- ${warning.code}: ${warning.message}`));
    }
  }
  lines.push("");
  lines.push("Scorers - Home");
  eventAnalysis.scorers.home.forEach((item) => lines.push(`${item.name}: ${item.goals}${item.sevenMeterGoals ? ` (${item.sevenMeterGoals} 7m)` : ""}`));
  lines.push("");
  lines.push("Scorers - Away");
  eventAnalysis.scorers.away.forEach((item) => lines.push(`${item.name}: ${item.goals}${item.sevenMeterGoals ? ` (${item.sevenMeterGoals} 7m)` : ""}`));
  lines.push("");
  lines.push(`7m Home: ${eventAnalysis.sevenMeters.home.goals}/${eventAnalysis.sevenMeters.home.attempts}`);
  lines.push(`7m Away: ${eventAnalysis.sevenMeters.away.goals}/${eventAnalysis.sevenMeters.away.attempts}`);
  lines.push(`2min Home: ${eventAnalysis.sanctions.home.twoMinutes}`);
  lines.push(`2min Away: ${eventAnalysis.sanctions.away.twoMinutes}`);
  lines.push("");
  lines.push("Longest runs");
  for (const side of ["home", "away"]) {
    const run = eventAnalysis.longestRuns[side];
    lines.push(`${side}: ${run ? `${run.goals}:0 (${run.start}-${run.end})` : "n/a"}`);
  }
  lines.push("");
  lines.push("5-minute splits");
  for (const split of eventAnalysis.fiveMinuteSplits) {
    lines.push(`${split.label}: ${split.goals.home}:${split.goals.away} -> ${split.scoreEnd.home}:${split.scoreEnd.away}`);
  }
  lines.push("");
  lines.push("Timeouts");
  for (const timeout of eventAnalysis.timeouts) {
    lines.push(`${timeout.team} ${timeout.clock} at ${timeout.score.home}:${timeout.score.away}; next 3m ${timeout.goalsAfter.home}:${timeout.goalsAfter.away}`);
  }

  return `${lines.join("\n")}\n`;
}
