import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEAM_META } from "../config/config.js";
import { exists, listDirectories, readJson, writeJson } from "../lib/fs-utils.js";
import { normalizeMatch } from "../lib/season.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const RAW_MATCH_ROOT = path.join(ROOT, "raw", "matches");
const OUT = path.join(ROOT, "generated", "normalized");

function normalizeEvent(matchId, event) {
  return {
    matchId: Number(matchId),
    eventId: event.id ?? null,
    minute: event.minute ?? null,
    globalMinute: event.global_minute ?? null,
    block: String(event.block || "").trim(),
    eventTypeId: event.event_type?.id ?? null,
    eventTypeName: event.event_type?.name ?? null,
    isGoal: Boolean(event.event_type?.is_goal),
    isSanction: Boolean(event.event_type?.is_sanction),
    playerId: event.player?.id ?? null,
    playerName: [event.player?.first_name, event.player?.last_name].filter(Boolean).join(" ").trim() || null,
    teamId: event.team?.id ?? null,
    teamName: event.team?.name ?? null,
    isHome: Boolean(event.is_home),
    timestamp: event.timestamp ?? null,
    value: event.value ?? null,
    scoreHome: event.score?.local ?? null,
    scoreAway: event.score?.visitor ?? null
  };
}

function normalizeAppearance(matchId, side, entry, isStaff = false) {
  return {
    matchId: Number(matchId),
    side,
    playerId: entry.player?.id ?? null,
    firstName: entry.player?.first_name ?? null,
    lastName: entry.player?.last_name ?? null,
    photoUrl: entry.player?.photo_url ?? null,
    number: entry.number ?? null,
    roleId: entry.role?.id ?? null,
    roleName: entry.role?.name ?? null,
    isStaff: Boolean(isStaff || entry.is_staff),
    isStarter: Boolean(entry.is_starter),
    isGoalkeeper: Boolean(entry.is_goalkeeper),
    isCaptain: Boolean(entry.is_captain),
    minutesPlayed: entry.minutes_played ?? null,
    goals: Number(entry.goals || 0),
    sevenMeterGoals: Number(entry.seven_meter_goals || 0),
    sevenMeterAttempts: Number(entry.seven_meter_attempts || 0),
    twoMinutes: Number(entry.two_minutes || 0),
    warning: entry.sanctions?.warning ?? null,
    disqualification: entry.sanctions?.disqualification ?? null
  };
}

async function main() {
  const ids = await listDirectories(RAW_MATCH_ROOT);
  const matches = [];
  const events = [];
  const appearances = [];
  const players = new Map();

  for (const matchId of ids) {
    const matchFile = path.join(RAW_MATCH_ROOT, matchId, "match.json");
    if (!(await exists(matchFile))) continue;

    const rawMatch = await readJson(matchFile);
    const match = normalizeMatch(rawMatch);
    const ownTeamId = TEAM_META[String(match.home.id)] ? String(match.home.id)
      : TEAM_META[String(match.away.id)] ? String(match.away.id)
      : null;

    matches.push({
      ...match,
      ownTeamId,
      ownTeam: ownTeamId ? TEAM_META[ownTeamId] : null
    });

    const eventsFile = path.join(RAW_MATCH_ROOT, matchId, "events.json");
    if (await exists(eventsFile)) {
      const payload = await readJson(eventsFile);
      for (const event of Array.isArray(payload.data) ? payload.data : []) {
        const normalized = normalizeEvent(matchId, event);
        events.push(normalized);
        if (normalized.playerId) {
          players.set(String(normalized.playerId), {
            id: normalized.playerId,
            name: normalized.playerName,
            photoUrl: event.player?.photo_url ?? null
          });
        }
      }
    }

    const lineupsFile = path.join(RAW_MATCH_ROOT, matchId, "lineups.json");
    if (await exists(lineupsFile)) {
      const payload = await readJson(lineupsFile);
      for (const [side, key] of [["home", "local"], ["away", "visitor"]]) {
        const group = payload.data?.[key] || {};
        for (const entry of Array.isArray(group.players) ? group.players : []) {
          appearances.push(normalizeAppearance(matchId, side, entry, false));
          if (entry.player?.id) {
            players.set(String(entry.player.id), {
              id: entry.player.id,
              name: [entry.player.first_name, entry.player.last_name].filter(Boolean).join(" ").trim(),
              photoUrl: entry.player.photo_url ?? null
            });
          }
        }
        for (const entry of Array.isArray(group.staff) ? group.staff : []) {
          appearances.push(normalizeAppearance(matchId, side, entry, true));
        }
      }
    }
  }

  matches.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  events.sort((a, b) => a.matchId - b.matchId || Number(a.globalMinute || 0) - Number(b.globalMinute || 0) || Number(a.eventId || 0) - Number(b.eventId || 0));

  await writeJson(path.join(OUT, "matches.json"), { generatedAt: new Date().toISOString(), matches });
  await writeJson(path.join(OUT, "events.json"), { generatedAt: new Date().toISOString(), events });
  await writeJson(path.join(OUT, "appearances.json"), { generatedAt: new Date().toISOString(), appearances });
  await writeJson(path.join(OUT, "players.json"), { generatedAt: new Date().toISOString(), players: [...players.values()] });

  console.log(`Normalized ${matches.length} matches, ${events.length} events, ${appearances.length} appearances.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
