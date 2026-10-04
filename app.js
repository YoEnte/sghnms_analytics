const CLUB_ID = "1yrb3n9";

const state = {
  overview: null,
  teams: [],
  matches: [],
  coverage: null,
  quality: null,
  teamAnalytics: [],
  players: [],
  matchAnalyticsIndex: [],
  matchAnalyticsCache: new Map(),
  clubScope: "overall",
  clubTeamId: null,
  trainerTeamId: null,
  selectedMatchId: null,
  trainerTab: "overview",
  product: "club",
  clubSort: {
    players: { key: "goals", dir: "desc" },
    offense: { key: "goalsForPer10", dir: "desc" },
    defense: { key: "goalsAgainstPer10", dir: "asc" }
  }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function deNumber(value, digits = 0) {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(Number(value || 0));
}

function percent(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "–";
  return `${deNumber(value, digits)} %`;
}

function signed(value, digits = 0) {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : ""}${deNumber(number, digits)}`;
}

function clockFromSeconds(seconds) {
  const s = Math.max(0, Math.round(Number(seconds || 0)));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function dateShort(iso) {
  if (!iso) return "–";
  const date = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(date);
}

function dateLong(iso) {
  if (!iso) return "–";
  const date = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function generatedText(iso) {
  if (!iso) return "Datenstand unbekannt";
  const date = new Date(iso);
  return `Stand ${new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date)}`;
}

function perspective(match) {
  const isHome = String(match.home?.clubId) === CLUB_ID;
  const own = isHome ? Number(match.result?.home) : Number(match.result?.away);
  const opp = isHome ? Number(match.result?.away) : Number(match.result?.home);
  return {
    isHome,
    own,
    opp,
    opponent: isHome ? match.away?.name : match.home?.name,
    result: own > opp ? "W" : own < opp ? "L" : "D"
  };
}

function teamMatches(teamId) {
  return state.matches.filter(match => String(match.ownTeamId) === String(teamId));
}

function scopeMatches(scope = state.clubScope) {
  if (scope === "team") return teamMatches(state.clubTeamId);
  return state.matches.filter(match => {
    const t = match.ownTeam || {};
    if (scope === "seniors") return t.ageGroup === "senior";
    if (scope === "juniors") return t.ageGroup === "youth";
    if (scope === "male") return t.gender === "male";
    if (scope === "female") return t.gender === "female";
    return true;
  });
}

function summarize(matches) {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const match of matches) {
    const p = perspective(match);
    goalsFor += p.own;
    goalsAgainst += p.opp;
    if (p.result === "W") wins += 1;
    else if (p.result === "D") draws += 1;
    else losses += 1;
  }

  const games = matches.length;
  return {
    games,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    winRate: games ? (wins / games) * 100 : 0,
    goalsForAvg: games ? goalsFor / games : 0,
    goalsAgainstAvg: games ? goalsAgainst / games : 0,
    goalDifferenceAvg: games ? (goalsFor - goalsAgainst) / games : 0
  };
}

function scopeTeams() {
  const scope = state.clubScope;
  if (scope === "team") return state.teams.filter(team => String(team.id) === String(state.clubTeamId));
  return state.teams.filter(team => {
    if (scope === "seniors") return team.ageGroup === "senior";
    if (scope === "juniors") return team.ageGroup === "youth";
    if (scope === "male") return team.gender === "male";
    if (scope === "female") return team.gender === "female";
    return true;
  });
}

function scopeName() {
  const names = {
    overall: "SG gesamt",
    seniors: "Senioren",
    juniors: "Junioren",
    male: "Männlich",
    female: "Weiblich"
  };
  if (state.clubScope === "team") {
    return state.teams.find(t => String(t.id) === String(state.clubTeamId))?.name || "Mannschaft";
  }
  return names[state.clubScope] || "SG gesamt";
}

function teamAnalytics(teamId = state.trainerTeamId) {
  return state.teamAnalytics.find(team => String(team.id) === String(teamId)) || null;
}

function qualityForMatch(matchId) {
  return state.quality?.matches?.find(match => String(match.id) === String(matchId))?.quality || null;
}

function matchIndexEntry(matchId) {
  return state.matchAnalyticsIndex.find(match => String(match.id) === String(matchId)) || null;
}

function kpiHtml(label, value, sub, tone = "") {
  return `<article class="kpi ${tone ? `kpi--${tone}` : ""}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-sub">${sub}</div>
  </article>`;
}

function renderKpis(target, summary) {
  const gdTone = summary.goalDifference > 0 ? "positive" : summary.goalDifference < 0 ? "negative" : "";
  $(target).innerHTML = [
    kpiHtml("Spiele", summary.games, `${summary.wins} S · ${summary.draws} U · ${summary.losses} N`),
    kpiHtml("Siegquote", percent(summary.winRate), `${summary.wins} Siege`),
    kpiHtml("Tore", deNumber(summary.goalsFor), `${deNumber(summary.goalsForAvg, 1)} / Spiel`),
    kpiHtml("Gegentore", deNumber(summary.goalsAgainst), `${deNumber(summary.goalsAgainstAvg, 1)} / Spiel`),
    kpiHtml("Tordifferenz", signed(summary.goalDifference), `${signed(summary.goalDifferenceAvg, 1)} / Spiel`, gdTone),
    kpiHtml("Bilanz", `${summary.wins}-${summary.draws}-${summary.losses}`, "Sieg · Remis · Niederlage")
  ].join("");
}

function formForTeam(teamId, limit = 5) {
  return teamMatches(teamId)
    .slice()
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))
    .slice(-limit)
    .map(m => perspective(m).result);
}

function formHtml(form) {
  if (!form.length) return "–";
  return `<div class="form">${form.map(r => `<span class="form-dot form-${r.toLowerCase()}">${r}</span>`).join("")}</div>`;
}

function renderTeamTable() {
  const teams = scopeTeams().slice().sort((a, b) =>
    b.winRate - a.winRate || b.goalDifference - a.goalDifference || a.name.localeCompare(b.name, "de")
  );

  $("#team-table-body").innerHTML = teams.map(team => {
    const gdAvg = team.games ? team.goalDifference / team.games : 0;
    return `<tr>
      <td class="team-cell"><strong>${team.name}</strong><span>${team.label}</span></td>
      <td>${team.games}</td>
      <td>${team.wins}-${team.draws}-${team.losses}</td>
      <td>${signed(gdAvg, 1)}</td>
      <td class="rate">${percent(team.winRate)}</td>
      <td>${formHtml(formForTeam(team.id))}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="6">Keine Daten.</td></tr>`;
}

function scopedTeamIds() {
  return new Set(scopeTeams().map(team => String(team.id)));
}

function scopePlayers() {
  const ids = scopedTeamIds();
  const grouped = new Map();

  for (const row of state.players) {
    if (!ids.has(String(row.teamId))) continue;
    const key = String(row.playerId || `${row.name}:${row.teamId}`);
    if (!grouped.has(key)) {
      grouped.set(key, {
        playerId: row.playerId || null,
        name: row.name || "Unbekannt",
        appearances: 0,
        goals: 0,
        sevenMeterGoals: 0,
        sevenMeterAttempts: 0,
        teamNames: new Set()
      });
    }
    const player = grouped.get(key);
    player.appearances += Number(row.appearances || 0);
    player.goals += Number(row.goals || 0);
    player.sevenMeterGoals += Number(row.sevenMeters?.goals || 0);
    player.sevenMeterAttempts += Number(row.sevenMeters?.attempts || 0);
    if (row.teamName) player.teamNames.add(row.teamName);
  }

  return [...grouped.values()].map(player => ({
    ...player,
    teamNames: [...player.teamNames].sort((a, b) => a.localeCompare(b, "de")),
    goalsPerAppearance: player.appearances ? player.goals / player.appearances : 0,
    sevenMeterPercentage: player.sevenMeterAttempts
      ? (player.sevenMeterGoals / player.sevenMeterAttempts) * 100
      : null
  }));
}

function teamRankingRows() {
  return scopeTeams().map(team => {
    const games = Number(team.games || 0);
    const matchMinutes = Number(team.matchMinutes || 0);
    const totalMinutes = games * matchMinutes;
    return {
      ...team,
      games,
      goalsFor: Number(team.goalsFor || 0),
      goalsAgainst: Number(team.goalsAgainst || 0),
      goalsForAvg: games ? Number(team.goalsFor || 0) / games : null,
      goalsAgainstAvg: games ? Number(team.goalsAgainst || 0) / games : null,
      goalsForPer10: totalMinutes ? Number(team.goalsFor || 0) * 10 / totalMinutes : null,
      goalsAgainstPer10: totalMinutes ? Number(team.goalsAgainst || 0) * 10 / totalMinutes : null
    };
  });
}

function compareSortValue(a, b, key, dir) {
  const av = a[key];
  const bv = b[key];
  const aMissing = av === null || av === undefined || Number.isNaN(av);
  const bMissing = bv === null || bv === undefined || Number.isNaN(bv);

  // Fehlende Werte bleiben unabhängig von der Sortierrichtung am Tabellenende.
  if (aMissing || bMissing) {
    if (aMissing && bMissing) return String(a.name || "").localeCompare(String(b.name || ""), "de");
    return aMissing ? 1 : -1;
  }

  let result = 0;
  if (typeof av === "string" || typeof bv === "string") result = String(av).localeCompare(String(bv), "de");
  else result = Number(av) - Number(bv);

  if (result === 0 && key !== "name") result = String(a.name || "").localeCompare(String(b.name || ""), "de");
  return dir === "asc" ? result : -result;
}

function updateSortIndicators(tableName) {
  const spec = state.clubSort[tableName];
  $$(`[data-sort-table="${tableName}"]`).forEach(button => {
    const active = button.dataset.sortKey === spec.key;
    button.classList.toggle("is-active", active);
    button.dataset.sortDir = active ? spec.dir : "";
    button.setAttribute("aria-sort", active ? (spec.dir === "asc" ? "ascending" : "descending") : "none");
  });
}

function renderClubPlayers() {
  const spec = state.clubSort.players;
  const players = scopePlayers()
    .sort((a, b) => compareSortValue(a, b, spec.key, spec.dir))
    .slice(0, 20);

  $("#club-player-table-body").innerHTML = players.map(player => {
    const teams = player.teamNames.join(" · ");
    const seven = `${player.sevenMeterGoals}/${player.sevenMeterAttempts}`;
    return `<tr>
      <td class="team-cell"><strong>${player.name}</strong><span>${teams || "–"}</span></td>
      <td>${player.appearances}</td>
      <td class="rate">${player.goals}</td>
      <td>${deNumber(player.goalsPerAppearance, 2)}</td>
      <td>${seven}</td>
      <td>${player.sevenMeterPercentage === null ? "–" : percent(player.sevenMeterPercentage)}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="6">Keine Spielerdaten im gewählten Filter.</td></tr>`;

  updateSortIndicators("players");
}

function rankingTableHtml(rows) {
  return rows.map(team => `<tr>
    <td class="team-cell"><strong>${team.name}</strong><span>${team.matchMinutes} Min. Spielzeit</span></td>
    <td>${team.games}</td>
    <td>${team.goalsFor}</td>
    <td>${team.goalsAgainst}</td>
    <td>${team.goalsForAvg === null ? "–" : deNumber(team.goalsForAvg, 2)}</td>
    <td>${team.goalsAgainstAvg === null ? "–" : deNumber(team.goalsAgainstAvg, 2)}</td>
    <td class="rate">${team.goalsForPer10 === null ? "–" : deNumber(team.goalsForPer10, 2)}</td>
    <td>${team.goalsAgainstPer10 === null ? "–" : deNumber(team.goalsAgainstPer10, 2)}</td>
  </tr>`).join("") || `<tr><td colspan="8">Keine Mannschaftsdaten im gewählten Filter.</td></tr>`;
}

function renderClubTeamRankings() {
  const rows = teamRankingRows();
  for (const tableName of ["offense", "defense"]) {
    const spec = state.clubSort[tableName];
    const sorted = rows.slice().sort((a, b) => compareSortValue(a, b, spec.key, spec.dir));
    $(`#club-${tableName}-table-body`).innerHTML = rankingTableHtml(sorted);
    updateSortIndicators(tableName);
  }
}

function toggleClubSort(tableName, key, defaultDir = "desc") {
  const current = state.clubSort[tableName];
  if (!current) return;
  if (current.key === key) current.dir = current.dir === "asc" ? "desc" : "asc";
  else state.clubSort[tableName] = { key, dir: defaultDir };

  if (tableName === "players") renderClubPlayers();
  else renderClubTeamRankings();
}

function matchRow(match, { showTeam = true, selectable = false } = {}) {
  const p = perspective(match);
  const teamName = match.ownTeam?.name || match.ownTeam?.label || "SG";
  const idx = matchIndexEntry(match.id);
  const qualityStatus = idx?.qualityStatus || qualityForMatch(match.id)?.status || "unknown";
  const eligible = idx?.analyticsEligible ?? qualityForMatch(match.id)?.analyticsEligible;
  const selected = String(state.selectedMatchId) === String(match.id);

  return `<button class="match-row ${selectable ? "match-row--button" : ""} ${selected ? "is-selected" : ""}" ${selectable ? `data-match-id="${match.id}"` : "disabled"} type="button">
    <div class="match-date">${dateShort(match.date)}<br>${match.time || ""}</div>
    <div>
      ${showTeam ? `<div class="match-team">${teamName} · ${p.isHome ? "Heim" : "Auswärts"}</div>` : `<div class="match-team">${p.isHome ? "Heim" : "Auswärts"}</div>`}
      <div class="match-opponent">${p.opponent || "Gegner"}</div>
      ${selectable ? `<div class="quality-inline quality-${qualityStatus}">${eligible === false ? "Analytics ausgeschlossen" : qualityStatus === "warning" ? "Hinweis" : "verifiziert"}</div>` : ""}
    </div>
    <div class="match-result"><span class="result-score">${p.own}:${p.opp}</span><span class="result-badge result-${p.result.toLowerCase()}">${p.result}</span></div>
  </button>`;
}

function renderRecentMatches() {
  const matches = scopeMatches()
    .slice()
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`))
    .slice(0, 8);

  $("#recent-matches").innerHTML = matches.map(m => matchRow(m, { showTeam: state.clubScope !== "team" })).join("") || `<div class="chart-empty">Keine Spiele.</div>`;
}

function coverageRow(name, value, total, extra = "") {
  const rate = total ? Math.min(100, (value / total) * 100) : 0;
  return `<div class="coverage-row">
    <span class="coverage-name">${name}</span>
    <span class="coverage-value">${value}/${total}${extra ? ` · ${extra}` : ""}</span>
    <div class="coverage-bar"><span style="width:${rate}%"></span></div>
  </div>`;
}

function renderCoverage() {
  const c = state.coverage || {};
  const finished = Number(c.finishedMatches || 0);
  const endpoint = c.endpointCoverage || {};
  const verified = c.verifiedAnalytics || {};

  const warnings = (c.warningSummary || []).map(item =>
    `<span class="warning-pill warning-${item.severity}">${item.code}: ${item.count}</span>`
  ).join("");

  $("#coverage-content").innerHTML = `
    <div class="coverage-grid">
      ${coverageRow("Events", Number(endpoint.eventsAvailable || 0), finished, percent(endpoint.eventsPercent || 0))}
      ${coverageRow("Lineups", Number(endpoint.lineupsAvailable || 0), finished, percent(endpoint.lineupsPercent || 0))}
      ${coverageRow("Verifizierte Analytics", Number(verified.eligibleMatches || 0), finished, percent(verified.percent || 0))}
    </div>
    <div class="coverage-note">API-Abdeckung und analytische Verwendbarkeit werden getrennt ausgewiesen. Spiele mit inkonsistentem Event-Endstand fließen weiterhin in Ergebnisstatistiken ein, aber nicht in Event-Analytics.</div>
    ${warnings ? `<div class="warning-row">${warnings}</div>` : ""}
  `;
}

function renderTrend(target, matches, { trainer = false } = {}) {
  const root = $(target);
  const sorted = matches.slice().sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  if (!sorted.length) {
    root.innerHTML = `<div class="chart-empty">Keine Spiele im gewählten Filter.</div>`;
    return;
  }

  let cumulative = 0;
  const data = sorted.map((match, index) => {
    const p = perspective(match);
    cumulative += p.own - p.opp;
    return { index, match, cumulative, diff: p.own - p.opp, result: p.result };
  });

  const w = 900;
  const h = 270;
  const left = 46;
  const right = 20;
  const top = 18;
  const bottom = 34;
  const innerW = w - left - right;
  const innerH = h - top - bottom;
  const values = trainer ? data.map(d => d.diff) : data.map(d => d.cumulative);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values);
  const pad = Math.max(2, (maxVal - minVal) * 0.12);
  const yMin = minVal - pad;
  const yMax = maxVal + pad;
  const x = i => left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = v => top + ((yMax - v) / (yMax - yMin || 1)) * innerH;
  const zeroY = y(0);
  const gridVals = Array.from({ length: 5 }, (_, i) => yMax - i * (yMax - yMin) / 4);

  let body = `<svg viewBox="0 0 ${w} ${h}" role="img">`;
  body += gridVals.map(v => `<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}" stroke="#e7ecf3" stroke-width="1"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#7a8798">${Math.round(v)}</text>`).join("");
  body += `<line x1="${left}" x2="${w-right}" y1="${zeroY}" y2="${zeroY}" stroke="#aebac9" stroke-width="1.2"/>`;

  if (trainer) {
    const barW = Math.max(5, Math.min(28, innerW / Math.max(data.length, 1) * 0.58));
    body += data.map((d, i) => {
      const bx = x(i) - barW / 2;
      const by = Math.min(y(d.diff), zeroY);
      const bh = Math.max(2, Math.abs(y(d.diff) - zeroY));
      const fill = d.result === "W" ? "#0f7a49" : d.result === "D" ? "#9a6500" : "#bf0b0f";
      return `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="3" fill="${fill}" opacity=".82"><title>${d.match.date}: ${signed(d.diff)}</title></rect>`;
    }).join("");
  } else {
    const pts = data.map((d, i) => `${x(i)},${y(d.cumulative)}`).join(" ");
    const area = `${left},${zeroY} ${pts} ${x(data.length - 1)},${zeroY}`;
    body += `<polygon points="${area}" fill="rgba(13,77,142,.08)"/><polyline points="${pts}" fill="none" stroke="#bf0b0f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    body += data.map((d, i) => `<circle cx="${x(i)}" cy="${y(d.cumulative)}" r="3.4" fill="#fff" stroke="#bf0b0f" stroke-width="2"><title>${d.match.date}: ${signed(d.cumulative)}</title></circle>`).join("");
  }

  const labelIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  body += labelIdx.map(i => `<text x="${x(i)}" y="${h-10}" text-anchor="middle" font-size="11" fill="#7a8798">${dateShort(data[i].match.date)}</text>`).join("");
  body += `</svg>`;
  root.innerHTML = body;
}

function renderClub() {
  const matches = scopeMatches();
  const summary = summarize(matches);
  $("#scope-title").textContent = scopeName();
  $("#scope-subtitle").textContent = state.clubScope === "team"
    ? `${summary.games} abgeschlossene Saisonspiele.`
    : "Alle abgeschlossenen Spiele im gewählten Vereinsfilter.";
  renderKpis("#club-kpis", summary);
  renderTrend("#trend-chart", matches);
  renderTeamTable();
  renderRecentMatches();
  renderCoverage();
  renderClubPlayers();
  renderClubTeamRankings();
}

function homeAwayStats(matches) {
  const split = { home: [], away: [] };
  matches.forEach(match => split[perspective(match).isHome ? "home" : "away"].push(match));
  return { home: summarize(split.home), away: summarize(split.away) };
}

function renderTeamFiveMinute(team) {
  const root = $("#team-five-minute");
  const data = team?.fiveMinuteSplits || [];
  if (!data.length) {
    root.innerHTML = `<div class="chart-empty">Keine verifizierten Spielphasen vorhanden.</div>`;
    return;
  }

  const maxAbs = Math.max(0.5, ...data.map(item => Math.abs(Number(item.goalDifferencePerGame || 0))));
  root.innerHTML = `<div class="mini-bars">${data.map(item => {
    const value = Number(item.goalDifferencePerGame || 0);
    const height = Math.max(4, Math.abs(value) / maxAbs * 82);
    const cls = value > 0 ? "is-positive" : value < 0 ? "is-negative" : "is-neutral";
    return `<div class="mini-bar-item">
      <div class="mini-bar-value">${signed(value, 2)}</div>
      <div class="mini-bar-track"><span class="mini-bar ${cls}" style="height:${height}px"></span></div>
      <div class="mini-bar-label">${item.label}</div>
    </div>`;
  }).join("")}</div>`;
}

function renderTeamSpecialStats(team) {
  const seven = team?.sevenMeters || {};
  const sanc = team?.sanctions || {};
  const numeric = team?.numericSituations || {};
  const power = numeric.powerPlay || {};
  const short = numeric.shortHanded || {};

  $("#team-special-stats").innerHTML = `
    <div class="stat-row"><span>7 Meter</span><strong>${seven.goals || 0}/${seven.attempts || 0}</strong><em>${percent(seven.percentage)}</em></div>
    <div class="stat-row"><span>Verwarnungen</span><strong>${sanc.warnings || 0}</strong><em>Saison</em></div>
    <div class="stat-row"><span>2-Minuten</span><strong>${sanc.twoMinutes || 0}</strong><em>Saison</em></div>
    <div class="stat-row"><span>Disqualifikationen</span><strong>${sanc.disqualifications || 0}</strong><em>Saison</em></div>
    <div class="stat-row"><span>Überzahl</span><strong>${clockFromSeconds(power.seconds)}</strong><em>${power.goalsFor || 0}:${power.goalsAgainst || 0} Tore</em></div>
    <div class="stat-row"><span>Unterzahl</span><strong>${clockFromSeconds(short.seconds)}</strong><em>${short.goalsFor || 0}:${short.goalsAgainst || 0} Tore</em></div>
  `;
}

function timeoutCard(label, item) {
  const diff = Number(item?.goalDifferenceAfter || 0);
  return `<div class="split-card">
    <h3>${label}</h3>
    <div class="split-record">${item?.count || 0}×</div>
    <div class="split-caption">3-Min-Fenster: ${item?.goalsForAfter || 0}:${item?.goalsAgainstAfter || 0} · TD ${signed(diff)}</div>
    <div class="split-caption">Ø ${deNumber(item?.goalsForPerTimeout || 0, 2)}:${deNumber(item?.goalsAgainstPerTimeout || 0, 2)} Tore</div>
  </div>`;
}

function renderTeamTimeouts(team) {
  const timeouts = team?.timeouts || {};
  $("#team-timeouts").innerHTML = [
    timeoutCard("Eigene Auszeiten", timeouts.own),
    timeoutCard("Gegnerische Auszeiten", timeouts.opponent)
  ].join("");
}

function renderTeamRuns(team) {
  const run = team?.longestRun;
  const drought = team?.longestDrought;
  $("#team-runs").innerHTML = `
    <div class="split-card">
      <h3>Längster Lauf</h3>
      <div class="split-record">${run ? `${run.goals}:0` : "–"}</div>
      <div class="split-caption">${run ? `${run.start}–${run.end} · vs. ${run.opponent}` : "Keine Daten"}</div>
    </div>
    <div class="split-card">
      <h3>Längste torlose Phase</h3>
      <div class="split-record">${drought?.duration || "–"}</div>
      <div class="split-caption">${drought ? `${drought.start}–${drought.end} · vs. ${drought.opponent}` : "Keine Daten"}</div>
    </div>`;
}

function renderTeamPlayers(team) {
  const players = team?.players || [];
  $("#team-player-table").innerHTML = players.map(player => `
    <tr>
      <td>${player.number ?? "–"}</td>
      <td class="team-cell"><strong>${player.name}</strong><span>${player.playerId}</span></td>
      <td>${player.appearances || 0}</td>
      <td class="rate">${player.goals || 0}</td>
      <td>${deNumber(player.goalsPerAppearance || 0, 2)}</td>
      <td>${percent(player.goalSharePercent || 0)}</td>
      <td>${player.sevenMeters?.attempts ? `${player.sevenMeters.goals}/${player.sevenMeters.attempts} · ${percent(player.sevenMeters.percentage)}` : "–"}</td>
      <td>${player.twoMinutes || 0}</td>
    </tr>`).join("") || `<tr><td colspan="8">Keine Spielerstatistiken vorhanden.</td></tr>`;
}

function renderTrainerMatches(matches) {
  const sorted = matches.slice().sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
  $("#trainer-matches").innerHTML = sorted.map(match => matchRow(match, { showTeam: false, selectable: true })).join("") || `<div class="chart-empty">Noch keine abgeschlossenen Spiele.</div>`;
}

function renderTrainerOverview() {
  const team = state.teams.find(t => String(t.id) === String(state.trainerTeamId));
  const matches = teamMatches(state.trainerTeamId).slice().sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const summary = summarize(matches);
  const analytics = teamAnalytics();

  $("#trainer-title").textContent = team?.name || "Mannschaft";
  $("#trainer-subtitle").textContent = analytics
    ? `${analytics.analyticsMatches}/${analytics.finishedMatches} Spiele für Event-Analytics verifiziert (${percent(analytics.coveragePercent)}).`
    : "Keine Event-Aggregate verfügbar.";

  renderKpis("#trainer-kpis", summary);
  renderTrend("#trainer-trend-chart", matches, { trainer: true });

  const split = homeAwayStats(matches);
  $("#home-away").innerHTML = [["Heim", split.home], ["Auswärts", split.away]].map(([label, s]) => `
    <div class="split-card">
      <h3>${label}</h3>
      <div class="split-record">${s.wins}-${s.draws}-${s.losses}</div>
      <div class="split-caption">${s.games} Spiele · ${s.goalsFor}:${s.goalsAgainst} Tore · ${percent(s.winRate)} Siege</div>
    </div>`).join("");

  renderTeamFiveMinute(analytics);
  renderTeamSpecialStats(analytics);
  renderTeamTimeouts(analytics);
  renderTeamRuns(analytics);
  renderTeamPlayers(analytics);
  renderTrainerMatches(matches);
}

function qualityBadge(quality) {
  const status = quality?.status || "unknown";
  const label = quality?.analyticsEligible === false
    ? "Event-Analytics ausgeschlossen"
    : status === "verified"
      ? "Analytics verifiziert"
      : status === "warning"
        ? "Analytics mit Hinweis"
        : "Qualität unbekannt";
  return `<span class="quality-badge quality-${status}">${label}</span>`;
}

function renderMatchHeader(detail) {
  const match = detail?.match;
  const quality = detail?.quality;
  if (!match) {
    $("#match-detail-header").innerHTML = `<div class="chart-empty">Kein Spiel ausgewählt.</div>`;
    return;
  }
  const final = detail.analytics?.score?.final || {
    own: match.isHome ? match.result?.home : match.result?.away,
    opponent: match.isHome ? match.result?.away : match.result?.home
  };

  $("#match-detail-header").innerHTML = `
    <div class="match-detail-topline">
      <div>
        <span class="section-eyebrow">${dateLong(match.date)} · ${match.time || ""}</span>
        <h2>${match.ownTeam?.name || "SG"} – ${match.opponent?.name || "Gegner"}</h2>
        <p>${match.competition || ""}${match.venue?.name ? ` · ${match.venue.name}` : ""}</p>
      </div>
      <div class="match-detail-score">${final.own}:${final.opponent}</div>
    </div>
    <div class="match-detail-meta">${qualityBadge(quality)}<span>Match-ID ${match.id}</span></div>
  `;
}

function renderMatchFlow(analytics) {
  const flow = analytics?.matchFlow || [];
  if (!flow.length) return `<div class="chart-empty">Kein Match Flow verfügbar.</div>`;

  const duration = Number(analytics.duration?.analysisSeconds || flow.at(-1)?.seconds || 1);
  const halftimeSeconds = duration / 2;
  const diffs = [{ seconds: 0, diff: 0 }, ...flow.map(event => ({
    seconds: event.seconds,
    diff: Number(event.score?.own || 0) - Number(event.score?.opponent || 0),
    event
  }))];

  const w = 940;
  const h = 300;
  const left = 46;
  const right = 22;
  const top = 22;
  const bottom = 42;
  const innerW = w - left - right;
  const innerH = h - top - bottom;
  const minVal = Math.min(0, ...diffs.map(d => d.diff));
  const maxVal = Math.max(0, ...diffs.map(d => d.diff));
  const pad = Math.max(2, (maxVal - minVal) * 0.15);
  const yMin = minVal - pad;
  const yMax = maxVal + pad;
  const x = seconds => left + (Number(seconds || 0) / duration) * innerW;
  const y = value => top + ((yMax - value) / (yMax - yMin || 1)) * innerH;
  const zeroY = y(0);

  let path = `M ${x(0)} ${y(0)}`;
  for (let i = 1; i < diffs.length; i += 1) {
    const prev = diffs[i - 1];
    const current = diffs[i];
    path += ` L ${x(current.seconds)} ${y(prev.diff)} L ${x(current.seconds)} ${y(current.diff)}`;
  }
  path += ` L ${x(duration)} ${y(diffs.at(-1).diff)}`;

  const grid = [];
  for (let minute = 0; minute <= duration / 60; minute += 5) {
    const sec = minute * 60;
    grid.push(`<line x1="${x(sec)}" x2="${x(sec)}" y1="${top}" y2="${h-bottom}" stroke="#eef2f6" stroke-width="1"/>`);
    grid.push(`<text x="${x(sec)}" y="${h-15}" text-anchor="middle" font-size="11" fill="#7a8798">${minute}'</text>`);
  }

  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Tordifferenz im Spielverlauf">
    ${grid.join("")}
    <line x1="${left}" x2="${w-right}" y1="${zeroY}" y2="${zeroY}" stroke="#9facbc" stroke-width="1.3"/>
    <line x1="${x(halftimeSeconds)}" x2="${x(halftimeSeconds)}" y1="${top}" y2="${h-bottom}" stroke="#c7ced8" stroke-dasharray="5 5"/>
    <path d="${path}" fill="none" stroke="#bf0b0f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${flow.map(event => `<circle cx="${x(event.seconds)}" cy="${y(Number(event.score.own)-Number(event.score.opponent))}" r="3.5" class="flow-dot flow-${event.side}"><title>${event.clock} · ${event.playerName || "Tor"} · ${event.score.own}:${event.score.opponent}</title></circle>`).join("")}
  </svg>`;
}

function renderMatchSplits(analytics) {
  const splits = analytics?.fiveMinuteSplits || [];
  if (!splits.length) return `<div class="chart-empty">Keine Splits vorhanden.</div>`;
  const max = Math.max(1, ...splits.map(item => Math.max(item.goals?.own || 0, item.goals?.opponent || 0)));
  return `<div class="split-bars">${splits.map(item => `
    <div class="split-bar-row">
      <span class="split-bar-label">${item.label}</span>
      <div class="split-bar-pair">
        <span class="bar-own" style="width:${(item.goals.own/max)*100}%">${item.goals.own}</span>
        <span class="bar-opp" style="width:${(item.goals.opponent/max)*100}%">${item.goals.opponent}</span>
      </div>
      <strong class="split-diff ${item.goalDifference > 0 ? "is-positive" : item.goalDifference < 0 ? "is-negative" : ""}">${signed(item.goalDifference)}</strong>
    </div>`).join("")}</div>`;
}

function runCard(label, run) {
  if (!run) return `<div class="split-card"><h3>${label}</h3><div class="split-record">–</div><div class="split-caption">Keine Serie</div></div>`;
  return `<div class="split-card"><h3>${label}</h3><div class="split-record">${run.goals}:0</div><div class="split-caption">${run.start}–${run.end}</div></div>`;
}

function renderTimeoutList(analytics) {
  const timeouts = analytics?.timeouts || [];
  if (!timeouts.length) return `<div class="chart-empty">Keine Auszeiten im Eventlog.</div>`;
  return `<div class="timeout-list">${timeouts.map(item => `
    <div class="timeout-item">
      <div><strong>${item.side === "own" ? "Eigene Auszeit" : "Gegnerische Auszeit"}</strong><span>${item.clock} · Stand ${item.score.own}:${item.score.opponent}</span></div>
      <div class="timeout-after"><span>nächste 3 Min.</span><strong>${item.goalsAfter.own}:${item.goalsAfter.opponent}</strong></div>
    </div>`).join("")}</div>`;
}

function situationCard(label, item) {
  return `<div class="split-card"><h3>${label}</h3><div class="split-record">${clockFromSeconds(item?.seconds || 0)}</div><div class="split-caption">${item?.goals?.own || 0}:${item?.goals?.opponent || 0} Tore</div></div>`;
}

function renderMatchPlayerTable(players, title) {
  const rows = (players || []).map(player => `
    <tr>
      <td>${player.number ?? "–"}</td>
      <td class="team-cell"><strong>${player.name}</strong><span>${player.playerId}</span></td>
      <td class="rate">${player.goals || 0}</td>
      <td>${player.sevenMeters?.attempts ? `${player.sevenMeters.goals}/${player.sevenMeters.attempts}` : "–"}</td>
      <td>${player.warnings || 0}</td>
      <td>${player.twoMinutes || 0}</td>
      <td>${player.disqualifications || 0}</td>
    </tr>`).join("");
  return `<article class="panel"><div class="panel-head"><div><span class="section-eyebrow">SPIELER</span><h2>${title}</h2></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Spieler</th><th>Tore</th><th>7m</th><th>V</th><th>2 Min.</th><th>Rot</th></tr></thead><tbody>${rows || `<tr><td colspan="7">Keine Daten.</td></tr>`}</tbody></table></div></article>`;
}

function renderMatchDetail(detail) {
  renderMatchHeader(detail);
  const root = $("#match-detail");
  const analytics = detail?.analytics;
  const quality = detail?.quality;

  if (!analytics) {
    const warnings = quality?.warnings || [];
    root.innerHTML = `<article class="panel excluded-panel">
      <span class="section-eyebrow">DATENQUALITÄT</span>
      <h2>Event-Analytics für dieses Spiel ausgeschlossen</h2>
      <p>Das offizielle Ergebnis bleibt in Saison- und Vereinsstatistiken enthalten. Der Eventstream ist jedoch nicht vollständig genug für Match Flow, Runs oder Spieler-Analytics.</p>
      ${warnings.length ? `<div class="warning-list">${warnings.map(w => `<div><strong>${w.code}</strong><span>${w.message || "Qualitätswarnung"}</span></div>`).join("")}</div>` : ""}
    </article>`;
    return;
  }

  const seven = analytics.sevenMeters || {};
  const sanctions = analytics.sanctions || {};
  const numeric = analytics.numericSituations || {};
  const droughtOwn = analytics.scoringDroughts?.own;
  const droughtOpp = analytics.scoringDroughts?.opponent;

  root.innerHTML = `
    <section class="content-grid content-grid--main">
      <article class="panel chart-panel"><div class="panel-head"><div><span class="section-eyebrow">MATCH FLOW</span><h2>Tordifferenz im Spielverlauf</h2></div><span class="panel-note">SG-Perspektive</span></div><div class="chart match-flow-chart">${renderMatchFlow(analytics)}</div></article>
      <article class="panel"><div class="panel-head"><div><span class="section-eyebrow">SPIELKERN</span><h2>Halbzeit & Serien</h2></div></div><div class="stat-stack">
        <div class="stat-row"><span>Halbzeit</span><strong>${analytics.score?.halftime?.own ?? "–"}:${analytics.score?.halftime?.opponent ?? "–"}</strong><em>${analytics.score?.halftimeSource === "event" ? "Event" : "abgeleitet"}</em></div>
        <div class="stat-row"><span>Eigener längster Run</span><strong>${analytics.longestRuns?.own?.goals || 0}:0</strong><em>${analytics.longestRuns?.own ? `${analytics.longestRuns.own.start}–${analytics.longestRuns.own.end}` : "–"}</em></div>
        <div class="stat-row"><span>Gegnerischer längster Run</span><strong>${analytics.longestRuns?.opponent?.goals || 0}:0</strong><em>${analytics.longestRuns?.opponent ? `${analytics.longestRuns.opponent.start}–${analytics.longestRuns.opponent.end}` : "–"}</em></div>
        <div class="stat-row"><span>Eigene torlose Phase</span><strong>${droughtOwn?.duration || "–"}</strong><em>${droughtOwn ? `${droughtOwn.start}–${droughtOwn.end}` : "–"}</em></div>
        <div class="stat-row"><span>Gegner torlos</span><strong>${droughtOpp?.duration || "–"}</strong><em>${droughtOpp ? `${droughtOpp.start}–${droughtOpp.end}` : "–"}</em></div>
      </div></article>
    </section>

    <section class="content-grid content-grid--main">
      <article class="panel"><div class="panel-head"><div><span class="section-eyebrow">SPIELPHASEN</span><h2>5-Minuten-Splits</h2></div><span class="legend-inline"><i></i> SG <i></i> Gegner</span></div>${renderMatchSplits(analytics)}</article>
      <article class="panel"><div class="panel-head"><div><span class="section-eyebrow">7 METER & STRAFEN</span><h2>Sondersituationen</h2></div></div><div class="stat-stack">
        <div class="stat-row"><span>7m SG</span><strong>${seven.own?.goals || 0}/${seven.own?.attempts || 0}</strong><em>${percent(seven.own?.percentage)}</em></div>
        <div class="stat-row"><span>7m Gegner</span><strong>${seven.opponent?.goals || 0}/${seven.opponent?.attempts || 0}</strong><em>${percent(seven.opponent?.percentage)}</em></div>
        <div class="stat-row"><span>2 Min. SG</span><strong>${sanctions.own?.twoMinutes || 0}</strong><em>${sanctions.own?.warnings || 0} Verwarnungen</em></div>
        <div class="stat-row"><span>2 Min. Gegner</span><strong>${sanctions.opponent?.twoMinutes || 0}</strong><em>${sanctions.opponent?.warnings || 0} Verwarnungen</em></div>
      </div></article>
    </section>

    <section class="content-grid content-grid--main">
      <article class="panel"><div class="panel-head"><div><span class="section-eyebrow">AUSZEITEN</span><h2>Was passiert danach?</h2></div><span class="panel-note">3-Minuten-Fenster</span></div>${renderTimeoutList(analytics)}</article>
      <article class="panel"><div class="panel-head"><div><span class="section-eyebrow">ÜBER-/UNTERZAHL</span><h2>Numerische Situationen</h2></div></div><div class="split-stats split-stats--three">
        ${situationCard("Gleichzahl", numeric.even)}
        ${situationCard("Überzahl", numeric.powerPlay)}
        ${situationCard("Unterzahl", numeric.shortHanded)}
      </div></article>
    </section>

    <section class="content-grid content-grid--main">
      ${renderMatchPlayerTable(analytics.players?.own, "SG")}
      ${renderMatchPlayerTable(analytics.players?.opponent, "Gegner")}
    </section>
  `;
}

async function loadMatchDetail(matchId) {
  if (!matchId) return null;
  if (state.matchAnalyticsCache.has(String(matchId))) return state.matchAnalyticsCache.get(String(matchId));
  const idx = matchIndexEntry(matchId);
  if (!idx?.path) return null;
  const response = await fetch(`./data/${idx.path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Match ${matchId}: HTTP ${response.status}`);
  const detail = await response.json();
  state.matchAnalyticsCache.set(String(matchId), detail);
  return detail;
}

async function selectMatch(matchId) {
  state.selectedMatchId = Number(matchId);
  renderTrainerMatches(teamMatches(state.trainerTeamId));
  $("#match-detail-header").innerHTML = `<div class="chart-empty">Matchdaten werden geladen …</div>`;
  $("#match-detail").innerHTML = "";
  try {
    const detail = await loadMatchDetail(matchId);
    if (!detail) throw new Error("Keine Match-Analytics-Datei gefunden.");
    renderMatchDetail(detail);
  } catch (error) {
    $("#match-detail-header").innerHTML = `<div class="notice notice--error">${error.message}</div>`;
  }
}

function defaultMatchForTeam(teamId) {
  const candidates = state.matchAnalyticsIndex
    .filter(item => String(item.ownTeamId) === String(teamId))
    .slice()
    .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
  return candidates.find(item => item.analyticsEligible)?.id || candidates[0]?.id || null;
}

function renderTrainer() {
  renderTrainerOverview();
  if (!state.selectedMatchId || String(matchIndexEntry(state.selectedMatchId)?.ownTeamId) !== String(state.trainerTeamId)) {
    state.selectedMatchId = defaultMatchForTeam(state.trainerTeamId);
  }
  renderTrainerMatches(teamMatches(state.trainerTeamId));
  if (state.trainerTab === "matches" && state.selectedMatchId) selectMatch(state.selectedMatchId);
}

function fillTeamSelect(select) {
  select.innerHTML = state.teams
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .map(team => `<option value="${team.id}">${team.name}</option>`)
    .join("");
}

function setProduct(product) {
  state.product = product;
  $$(".product-tab").forEach(button => button.classList.toggle("is-active", button.dataset.product === product));
  $("#club-view").hidden = product !== "club";
  $("#trainer-view").hidden = product !== "trainer";
  if (product === "trainer") renderTrainer();
}

function setTrainerTab(tab) {
  state.trainerTab = tab;
  $$(".trainer-tab").forEach(button => button.classList.toggle("is-active", button.dataset.trainerTab === tab));
  $$(".trainer-tab-panel").forEach(panel => { panel.hidden = panel.id !== `trainer-tab-${tab}`; });
  if (tab === "matches" && state.selectedMatchId) selectMatch(state.selectedMatchId);
}

function bindEvents() {
  $$(".product-tab").forEach(button => button.addEventListener("click", () => setProduct(button.dataset.product)));

  $$("#scope-buttons .segment").forEach(button => button.addEventListener("click", () => {
    state.clubScope = button.dataset.scope;
    $$("#scope-buttons .segment").forEach(item => item.classList.toggle("is-active", item === button));
    $("#club-team-wrap").hidden = state.clubScope !== "team";
    renderClub();
  }));

  $("#club-team-select").addEventListener("change", event => {
    state.clubTeamId = event.target.value;
    renderClub();
  });

  $("#trainer-team-select").addEventListener("change", event => {
    state.trainerTeamId = event.target.value;
    state.selectedMatchId = defaultMatchForTeam(state.trainerTeamId);
    renderTrainer();
  });

  $$(".trainer-tab").forEach(button => button.addEventListener("click", () => setTrainerTab(button.dataset.trainerTab)));

  $$(".sort-button").forEach(button => button.addEventListener("click", () => {
    toggleClubSort(button.dataset.sortTable, button.dataset.sortKey, button.dataset.defaultDir || "desc");
  }));

  $("#trainer-matches").addEventListener("click", event => {
    const row = event.target.closest("[data-match-id]");
    if (row) selectMatch(row.dataset.matchId);
  });
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function init() {
  try {
    const [overview, teams, matches, coverage, quality, teamAnalyticsPayload, playersPayload, indexPayload] = await Promise.all([
      loadJson("./data/overview.json"),
      loadJson("./data/teams.json"),
      loadJson("./data/matches.json"),
      loadJson("./data/coverage.json"),
      loadJson("./data/quality.json"),
      loadJson("./data/team-analytics.json"),
      loadJson("./data/players.json"),
      loadJson("./data/match-analytics/index.json")
    ]);

    state.overview = overview;
    state.teams = teams.teams || teams || [];
    state.matches = matches.matches || matches || [];
    state.coverage = coverage;
    state.quality = quality;
    state.teamAnalytics = teamAnalyticsPayload.teams || [];
    state.players = playersPayload.players || [];
    state.matchAnalyticsIndex = indexPayload.matches || indexPayload || [];

    const firstTeam = state.teams.slice().sort((a, b) => a.name.localeCompare(b.name, "de"))[0];
    state.clubTeamId = firstTeam?.id || null;
    state.trainerTeamId = firstTeam?.id || null;
    state.selectedMatchId = defaultMatchForTeam(state.trainerTeamId);

    fillTeamSelect($("#club-team-select"));
    fillTeamSelect($("#trainer-team-select"));
    $("#club-team-select").value = state.clubTeamId || "";
    $("#trainer-team-select").value = state.trainerTeamId || "";

    $("#generated-label").textContent = generatedText(coverage.generatedAt || overview.generatedAt);
    if (overview.season?.label) $("#season-label").textContent = overview.season.label;

    bindEvents();
    renderClub();
    renderTrainer();
  } catch (error) {
    const box = $("#load-error");
    box.hidden = false;
    box.textContent = `Daten konnten nicht geladen werden: ${error.message}`;
    console.error(error);
  }
}

init();
