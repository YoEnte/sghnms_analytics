const CLUB_ID = "1yrb3n9";
const state = {
  overview: null,
  teams: [],
  matches: [],
  coverage: null,
  clubScope: "overall",
  clubTeamId: null,
  trainerTeamId: null,
  product: "club"
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function deNumber(value, digits = 0) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value || 0));
}

function percent(value) {
  return `${deNumber(value, 1)} %`;
}

function dateShort(iso) {
  if (!iso) return "–";
  const date = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(date);
}

function generatedText(iso) {
  if (!iso) return "Datenstand unbekannt";
  const date = new Date(iso);
  return `Stand ${new Intl.DateTimeFormat("de-DE", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }).format(date)}`;
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
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
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
    games, wins, draws, losses, goalsFor, goalsAgainst,
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
  const names = { overall:"SG gesamt", seniors:"Senioren", juniors:"Junioren", male:"Männlich", female:"Weiblich" };
  if (state.clubScope === "team") return state.teams.find(t => String(t.id) === String(state.clubTeamId))?.name || "Mannschaft";
  return names[state.clubScope] || "SG gesamt";
}

function kpiHtml(label, value, sub, tone = "") {
  return `<article class="kpi ${tone ? `kpi--${tone}` : ""}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></article>`;
}

function renderKpis(target, summary) {
  const gdTone = summary.goalDifference > 0 ? "positive" : summary.goalDifference < 0 ? "negative" : "";
  $(target).innerHTML = [
    kpiHtml("Spiele", summary.games, `${summary.wins} S · ${summary.draws} U · ${summary.losses} N`),
    kpiHtml("Siegquote", percent(summary.winRate), `${summary.wins} Siege`),
    kpiHtml("Tore", deNumber(summary.goalsFor), `${deNumber(summary.goalsForAvg,1)} / Spiel`),
    kpiHtml("Gegentore", deNumber(summary.goalsAgainst), `${deNumber(summary.goalsAgainstAvg,1)} / Spiel`),
    kpiHtml("Tordifferenz", `${summary.goalDifference > 0 ? "+" : ""}${deNumber(summary.goalDifference)}`, `${summary.goalDifferenceAvg > 0 ? "+" : ""}${deNumber(summary.goalDifferenceAvg,1)} / Spiel`, gdTone),
    kpiHtml("Bilanz", `${summary.wins}-${summary.draws}-${summary.losses}`, "Sieg · Remis · Niederlage")
  ].join("");
}

function formForTeam(teamId, limit = 5) {
  return teamMatches(teamId).slice().sort((a,b) => a.date.localeCompare(b.date)).slice(-limit).map(m => perspective(m).result);
}

function formHtml(form) {
  if (!form.length) return "–";
  return `<div class="form">${form.map(r => `<span class="form-dot form-${r.toLowerCase()}">${r}</span>`).join("")}</div>`;
}

function renderTeamTable() {
  const teams = scopeTeams().slice().sort((a,b) => b.winRate - a.winRate || b.goalDifference - a.goalDifference || a.name.localeCompare(b.name));
  $("#team-table-body").innerHTML = teams.map(team => {
    const gdAvg = team.games ? team.goalDifference / team.games : 0;
    return `<tr>
      <td class="team-cell"><strong>${team.name}</strong><span>${team.label}</span></td>
      <td>${team.games}</td>
      <td>${team.wins}-${team.draws}-${team.losses}</td>
      <td>${gdAvg > 0 ? "+" : ""}${deNumber(gdAvg,1)}</td>
      <td class="rate">${percent(team.winRate)}</td>
      <td>${formHtml(formForTeam(team.id))}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="6">Keine Daten.</td></tr>`;
}

function matchRow(match, showTeam = true) {
  const p = perspective(match);
  const teamName = match.ownTeam?.name || match.ownTeam?.label || "SG";
  return `<div class="match-row">
    <div class="match-date">${dateShort(match.date)}<br>${match.time || ""}</div>
    <div>
      ${showTeam ? `<div class="match-team">${teamName} · ${p.isHome ? "Heim" : "Auswärts"}</div>` : `<div class="match-team">${p.isHome ? "Heim" : "Auswärts"}</div>`}
      <div class="match-opponent">${p.opponent || "Gegner"}</div>
    </div>
    <div class="match-result"><span class="result-score">${p.own}:${p.opp}</span><span class="result-badge result-${p.result.toLowerCase()}">${p.result}</span></div>
  </div>`;
}

function renderRecentMatches() {
  const matches = scopeMatches().slice().sort((a,b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)).slice(0,8);
  $("#recent-matches").innerHTML = matches.map(m => matchRow(m, state.clubScope !== "team")).join("") || `<div class="chart-empty">Keine Spiele.</div>`;
}

function renderCoverage() {
  const c = state.coverage || {};
  const finished = Number(c.finishedMatches || 0);
  const rows = [
    ["Events", Number(c.eventsAvailable || 0)],
    ["Lineups", Number(c.lineupsAvailable || 0)],
    ["Analysen", Number(c.analysesAvailable || 0)]
  ];
  $("#coverage-content").innerHTML = `<div class="coverage-grid">${rows.map(([name,value]) => {
    const rate = finished ? Math.min(100,(value/finished)*100) : 0;
    return `<div class="coverage-row"><span class="coverage-name">${name}</span><span class="coverage-value">${value}/${finished}</span><div class="coverage-bar"><span style="width:${rate}%"></span></div></div>`;
  }).join("")}</div><div class="coverage-note">Die aktuelle Exportdatei weist die Verfügbarkeit der Detail-Endpunkte aus. Eine separate verifizierte Quality-Kennzahl ist in diesem Export noch nicht enthalten.</div>`;
}

function renderTrend(target, matches, { trainer = false } = {}) {
  const root = $(target);
  const sorted = matches.slice().sort((a,b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  if (!sorted.length) { root.innerHTML = `<div class="chart-empty">Keine Spiele im gewählten Filter.</div>`; return; }

  let cumulative = 0;
  const data = sorted.map((match,index) => {
    const p = perspective(match);
    cumulative += p.own - p.opp;
    return { index, match, cumulative, diff:p.own-p.opp, result:p.result };
  });

  const w = 900, h = 270, left = 46, right = 20, top = 18, bottom = 34;
  const innerW = w-left-right, innerH = h-top-bottom;
  const values = trainer ? data.map(d => d.diff) : data.map(d => d.cumulative);
  const minVal = Math.min(0,...values), maxVal = Math.max(0,...values);
  const pad = Math.max(2,(maxVal-minVal)*.12);
  const yMin = minVal-pad, yMax = maxVal+pad;
  const x = i => left + (data.length===1 ? innerW/2 : (i/(data.length-1))*innerW);
  const y = v => top + ((yMax-v)/(yMax-yMin || 1))*innerH;
  const zeroY = y(0);
  const gridVals = Array.from({length:5},(_,i)=> yMax - i*(yMax-yMin)/4);

  let body = `<svg viewBox="0 0 ${w} ${h}" role="img">`;
  body += gridVals.map(v => `<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}" stroke="#e7ecf3" stroke-width="1"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#7a8798">${Math.round(v)}</text>`).join("");
  body += `<line x1="${left}" x2="${w-right}" y1="${zeroY}" y2="${zeroY}" stroke="#aebac9" stroke-width="1.2"/>`;

  if (trainer) {
    const barW = Math.max(5, Math.min(28, innerW / Math.max(data.length,1) * .58));
    body += data.map((d,i) => {
      const bx=x(i)-barW/2, by=Math.min(y(d.diff),zeroY), bh=Math.max(2,Math.abs(y(d.diff)-zeroY));
      const fill=d.result==="W"?"#0f7a49":d.result==="D"?"#9a6500":"#bf0b0f";
      return `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="3" fill="${fill}" opacity=".82"><title>${d.match.date}: ${d.diff>0?'+':''}${d.diff}</title></rect>`;
    }).join("");
  } else {
    const pts=data.map((d,i)=>`${x(i)},${y(d.cumulative)}`).join(" ");
    const area=`${left},${zeroY} ${pts} ${x(data.length-1)},${zeroY}`;
    body += `<polygon points="${area}" fill="rgba(13,77,142,.08)"/><polyline points="${pts}" fill="none" stroke="#bf0b0f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    body += data.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d.cumulative)}" r="3.4" fill="#fff" stroke="#bf0b0f" stroke-width="2"><title>${d.match.date}: ${d.cumulative>0?'+':''}${d.cumulative}</title></circle>`).join("");
  }

  const labelIdx=[0,Math.floor((data.length-1)/2),data.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  body += labelIdx.map(i=>`<text x="${x(i)}" y="${h-10}" text-anchor="middle" font-size="11" fill="#7a8798">${dateShort(data[i].match.date)}</text>`).join("");
  body += `</svg>`;
  root.innerHTML=body;
}

function renderClub() {
  const matches = scopeMatches();
  const summary = summarize(matches);
  $("#scope-title").textContent = scopeName();
  $("#scope-subtitle").textContent = state.clubScope === "team" ? `${summary.games} abgeschlossene Saisonspiele.` : "Alle abgeschlossenen Spiele im gewählten Vereinsfilter.";
  renderKpis("#club-kpis", summary);
  renderTrend("#trend-chart", matches);
  renderTeamTable();
  renderRecentMatches();
  renderCoverage();
}

function homeAwayStats(matches) {
  const split = { home:[], away:[] };
  matches.forEach(match => split[perspective(match).isHome ? "home" : "away"].push(match));
  return { home:summarize(split.home), away:summarize(split.away) };
}

function renderTrainer() {
  const team = state.teams.find(t => String(t.id) === String(state.trainerTeamId));
  const matches = teamMatches(state.trainerTeamId).slice().sort((a,b)=>`${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const summary = summarize(matches);
  $("#trainer-title").textContent = team?.name || "Mannschaft";
  renderKpis("#trainer-kpis", summary);
  renderTrend("#trainer-trend-chart", matches, {trainer:true});
  const split = homeAwayStats(matches);
  $("#home-away").innerHTML = [["Heim",split.home],["Auswärts",split.away]].map(([label,s])=>`<div class="split-card"><h3>${label}</h3><div class="split-record">${s.wins}-${s.draws}-${s.losses}</div><div class="split-caption">${s.games} Spiele · ${s.goalsFor}:${s.goalsAgainst} Tore · ${percent(s.winRate)} Siege</div></div>`).join("");
  $("#trainer-matches").innerHTML = matches.slice().reverse().map(m=>matchRow(m,false)).join("") || `<div class="chart-empty">Noch keine abgeschlossenen Spiele.</div>`;
}

function fillTeamSelect(select) {
  select.innerHTML = state.teams.slice().sort((a,b)=>a.name.localeCompare(b.name,"de")).map(team=>`<option value="${team.id}">${team.name}</option>`).join("");
}

function switchProduct(product) {
  state.product = product;
  $$(".product-tab").forEach(btn=>btn.classList.toggle("is-active",btn.dataset.product===product));
  $("#club-view").hidden = product !== "club";
  $("#trainer-view").hidden = product !== "trainer";
  if (product === "trainer") renderTrainer(); else renderClub();
}

function wireUi() {
  $$(".product-tab").forEach(btn=>btn.addEventListener("click",()=>switchProduct(btn.dataset.product)));
  $$("#scope-buttons .segment").forEach(btn=>btn.addEventListener("click",()=>{
    state.clubScope = btn.dataset.scope;
    $$("#scope-buttons .segment").forEach(b=>b.classList.toggle("is-active",b===btn));
    $("#club-team-wrap").hidden = state.clubScope !== "team";
    renderClub();
  }));
  $("#club-team-select").addEventListener("change",e=>{state.clubTeamId=e.target.value;renderClub();});
  $("#trainer-team-select").addEventListener("change",e=>{state.trainerTeamId=e.target.value;renderTrainer();});
}

async function loadJson(path) {
  const response = await fetch(path,{cache:"no-store"});
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function init() {
  try {
    const [overview,teams,matches,coverage] = await Promise.all([
      loadJson("./data/overview.json"),
      loadJson("./data/teams.json"),
      loadJson("./data/matches.json"),
      loadJson("./data/coverage.json")
    ]);
    state.overview=overview;
    state.teams=teams.teams || [];
    state.matches=matches.matches || [];
    state.coverage=coverage;
    state.clubTeamId=state.teams[0]?.id || null;
    state.trainerTeamId=state.teams.find(t=>t.label==="WJE 2")?.id || state.teams[0]?.id || null;

    fillTeamSelect($("#club-team-select"));
    fillTeamSelect($("#trainer-team-select"));
    $("#club-team-select").value=state.clubTeamId || "";
    $("#trainer-team-select").value=state.trainerTeamId || "";
    $("#generated-label").textContent=generatedText(overview.generatedAt || matches.generatedAt || coverage.generatedAt);
    wireUi();
    renderClub();
  } catch (error) {
    console.error(error);
    const el=$("#load-error"); el.hidden=false; el.textContent=`Dashboard-Daten konnten nicht geladen werden: ${error.message}`;
  }
}

init();
