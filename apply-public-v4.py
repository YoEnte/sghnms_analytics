from pathlib import Path

ROOT = Path.cwd()

def replace_exact(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise RuntimeError(f"Patch target not found: {label}")
    return source.replace(old, new, 1)

def patch_file(name, patcher):
    path = ROOT / name
    before = path.read_text(encoding='utf-8')
    after = patcher(before)
    if after == before:
        raise RuntimeError(f"{name}: no changes produced")
    path.write_text(after, encoding='utf-8')
    print(f"updated {name}")

def patch_index(source):
    source = replace_exact(source, '''        <div class="scope-controls">
          <div class="segmented" id="scope-buttons" aria-label="Statistik-Ebene">
            <button class="segment is-active" data-scope="overall" type="button">Gesamt</button>
            <button class="segment" data-scope="seniors" type="button">Senioren</button>
            <button class="segment" data-scope="juniors" type="button">Junioren</button>
            <button class="segment" data-scope="male" type="button">Männlich</button>
            <button class="segment" data-scope="female" type="button">Weiblich</button>
            <button class="segment" data-scope="team" type="button">Mannschaft</button>
          </div>
          <label class="team-select-wrap" id="club-team-wrap" hidden>
            <span>Mannschaft</span>
            <select id="club-team-select"></select>
          </label>
        </div>''', '''        <div class="scope-controls">
          <div class="filter-level">
            <span class="filter-level-label">Bereich</span>
            <div class="segmented" id="scope-buttons" aria-label="Bereich">
              <button class="segment is-active" data-scope="overall" type="button">Gesamt</button>
              <button class="segment" data-scope="seniors" type="button">Senioren</button>
              <button class="segment" data-scope="juniors" type="button">Junioren</button>
            </div>
          </div>
          <div class="filter-level">
            <span class="filter-level-label">Geschlecht</span>
            <div class="segmented" id="gender-buttons" aria-label="Geschlecht">
              <button class="segment is-active" data-gender="all" type="button">Alle</button>
              <button class="segment" data-gender="male" type="button">Männlich</button>
              <button class="segment" data-gender="female" type="button">Weiblich</button>
            </div>
          </div>
          <label class="team-select-wrap" id="club-team-wrap">
            <span>Mannschaft</span>
            <select id="club-team-select"></select>
          </label>
        </div>''', 'club filter hierarchy')

    source = replace_exact(source, '''        <section class="content-grid content-grid--main">
          <article class="panel">
            <div class="panel-head">
              <div>
                <span class="section-eyebrow">SPIELPHASEN</span>
                <h2>5-Minuten-Splits</h2>
              </div>
              <span class="panel-note">Tordifferenz pro Spiel</span>
            </div>
            <div id="team-five-minute" class="mini-bar-chart"></div>
          </article>''', '''        <article class="panel youth-phase-panel" id="team-game-phases-panel" hidden>
          <div class="panel-head">
            <div>
              <span class="section-eyebrow">E-JUGEND SPIELSYSTEM</span>
              <h2>2×3 gegen 3 vs. 6 gegen 6</h2>
            </div>
            <span class="panel-note">1. Halbzeit / 2. Halbzeit</span>
          </div>
          <div id="team-game-phases" class="split-stats"></div>
        </article>

        <section class="content-grid content-grid--main">
          <article class="panel">
            <div class="panel-head">
              <div>
                <span class="section-eyebrow">SPIELPHASEN</span>
                <h2>5-Minuten-Splits</h2>
              </div>
              <span class="panel-note">Tordifferenz pro Spiel</span>
            </div>
            <div id="team-five-minute" class="mini-bar-chart"></div>
          </article>''', 'E-youth season phase panel')
    return source

def patch_styles(source):
    source = replace_exact(source,
        '.scope-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }\n.segmented { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; padding: 5px; background: var(--surface-soft); border-radius: 13px; }',
        '.scope-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }\n.filter-level { display: flex; align-items: center; justify-content: flex-end; gap: 10px; width: 100%; }\n.filter-level-label { min-width: 72px; text-align: right; font-size: 10px; letter-spacing: .09em; text-transform: uppercase; font-weight: 850; color: var(--muted); }\n.segmented { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; padding: 5px; background: var(--surface-soft); border-radius: 13px; }',
        'filter level styles')
    source = replace_exact(source,
        '.content-grid { display: grid; gap: 18px; margin-bottom: 18px; }',
        '.content-grid { display: grid; gap: 18px; margin-bottom: 18px; }\n.youth-phase-panel { margin-bottom: 18px; }',
        'youth phase spacing')
    source = replace_exact(source,
        '  .scope-controls { align-items: stretch; }\n  .segmented { justify-content: flex-start; }',
        '  .scope-controls { align-items: stretch; }\n  .filter-level { align-items: stretch; flex-direction: column; gap: 5px; }\n  .filter-level-label { min-width: 0; text-align: left; }\n  .segmented { justify-content: flex-start; }',
        'mobile filter hierarchy')
    return source

def patch_app(source):
    source = replace_exact(source, '''  clubScope: "overall",
  clubTeamId: null,''', '''  clubScope: "overall",
  clubGender: "all",
  clubTeamId: "",''', 'club filter state')

    source = replace_exact(source, '''function scopeMatches(scope = state.clubScope) {
  if (scope === "team") return teamMatches(state.clubTeamId);
  return state.matches.filter(match => {
    const t = match.ownTeam || {};
    if (scope === "seniors") return t.ageGroup === "senior";
    if (scope === "juniors") return t.ageGroup === "youth";
    if (scope === "male") return t.gender === "male";
    if (scope === "female") return t.gender === "female";
    return true;
  });
}''', '''function matchPassesClubBaseFilters(match) {
  const team = match.ownTeam || {};
  if (state.clubScope === "seniors" && team.ageGroup !== "senior") return false;
  if (state.clubScope === "juniors" && team.ageGroup !== "youth") return false;
  if (state.clubGender !== "all" && team.gender !== state.clubGender) return false;
  return true;
}

function scopeMatches() {
  if (state.clubTeamId) return teamMatches(state.clubTeamId).filter(matchPassesClubBaseFilters);
  return state.matches.filter(matchPassesClubBaseFilters);
}''', 'scopeMatches hierarchy')

    source = replace_exact(source, '''function scopeTeams() {
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
}''', '''function clubBaseTeams() {
  return state.teams.filter(team => {
    if (state.clubScope === "seniors" && team.ageGroup !== "senior") return false;
    if (state.clubScope === "juniors" && team.ageGroup !== "youth") return false;
    if (state.clubGender !== "all" && team.gender !== state.clubGender) return false;
    return true;
  });
}

function scopeTeams() {
  const teams = clubBaseTeams();
  if (!state.clubTeamId) return teams;
  return teams.filter(team => String(team.id) === String(state.clubTeamId));
}

function scopeName() {
  if (state.clubTeamId) {
    return state.teams.find(team => String(team.id) === String(state.clubTeamId))?.name || "Mannschaft";
  }

  const area = state.clubScope === "seniors"
    ? "Senioren"
    : state.clubScope === "juniors"
      ? "Junioren"
      : "SG gesamt";
  const gender = state.clubGender === "male"
    ? "Männlich"
    : state.clubGender === "female"
      ? "Weiblich"
      : "";

  return gender ? `${area} · ${gender}` : area;
}''', 'scopeTeams and scopeName hierarchy')

    source = replace_exact(source,
        '  $("#recent-matches").innerHTML = matches.map(m => matchRow(m, { showTeam: state.clubScope !== "team" })).join("") || `<div class="chart-empty">Keine Spiele.</div>`;',
        '  $("#recent-matches").innerHTML = matches.map(m => matchRow(m, { showTeam: !state.clubTeamId })).join("") || `<div class="chart-empty">Keine Spiele.</div>`;',
        'recent matches team label')

    source = replace_exact(source, '''  $("#scope-subtitle").textContent = state.clubScope === "team"
    ? `${summary.games} abgeschlossene Saisonspiele.`
    : "Alle abgeschlossenen Spiele im gewählten Vereinsfilter.";''', '''  $("#scope-subtitle").textContent = state.clubTeamId
    ? `${summary.games} abgeschlossene Saisonspiele.`
    : "Alle abgeschlossenen Spiele im gewählten Vereinsfilter.";''', 'scope subtitle')

    source = replace_exact(source, 'function renderTeamSpecialStats(team) {', '''function gamePhaseCard(phase, { aggregate = false } = {}) {
  const goalsFor = aggregate ? Number(phase?.goalsFor || 0) : Number(phase?.goals?.own || 0);
  const goalsAgainst = aggregate ? Number(phase?.goalsAgainst || 0) : Number(phase?.goals?.opponent || 0);
  const difference = aggregate ? Number(phase?.goalDifference || 0) : goalsFor - goalsAgainst;
  const average = aggregate && phase?.games
    ? `Ø ${deNumber(phase.goalsForPerGame, 2)}:${deNumber(phase.goalsAgainstPerGame, 2)} Tore / Spiel`
    : "";

  return `<div class="split-card">
    <h3>${phase?.label || "Spielphase"}</h3>
    <div class="split-record">${phase?.format || "–"}</div>
    <div class="split-caption">${goalsFor}:${goalsAgainst} Tore · TD ${signed(difference)}</div>
    ${average ? `<div class="split-caption">${phase.games} Spiele · ${average}</div>` : ""}
  </div>`;
}

function renderTeamGamePhases(team) {
  const panel = $("#team-game-phases-panel");
  const root = $("#team-game-phases");
  const phases = team?.gamePhases;
  const visible = Array.isArray(phases) && phases.length > 0;
  panel.hidden = !visible;
  root.innerHTML = visible ? phases.map(phase => gamePhaseCard(phase, { aggregate: true })).join("") : "";
}

function renderTeamSpecialStats(team) {''', 'team E-youth phase renderer')

    source = replace_exact(source, '''  $("#team-special-stats").innerHTML = `
    <div class="stat-row"><span>7 Meter</span><strong>${seven.goals || 0}/${seven.attempts || 0}</strong><em>${percent(seven.percentage)}</em></div>
    <div class="stat-row"><span>Verwarnungen</span><strong>${sanc.warnings || 0}</strong><em>Saison</em></div>
    <div class="stat-row"><span>2-Minuten</span><strong>${sanc.twoMinutes || 0}</strong><em>Saison</em></div>
    <div class="stat-row"><span>Disqualifikationen</span><strong>${sanc.disqualifications || 0}</strong><em>Saison</em></div>
    <div class="stat-row"><span>Überzahl</span><strong>${clockFromSeconds(power.seconds)}</strong><em>${power.goalsFor || 0}:${power.goalsAgainst || 0} Tore</em></div>
    <div class="stat-row"><span>Unterzahl</span><strong>${clockFromSeconds(short.seconds)}</strong><em>${short.goalsFor || 0}:${short.goalsAgainst || 0} Tore</em></div>
  `;''', '''  const numericRows = numeric.suspensionsAffectPlayerCount === false
    ? `<div class="stat-row"><span>Numerische Situationen</span><strong>Gleichzahl</strong><em>2-Min.-Strafen ohne Spielerreduktion</em></div>`
    : `
      <div class="stat-row"><span>Überzahl</span><strong>${clockFromSeconds(power.seconds)}</strong><em>${power.goalsFor || 0}:${power.goalsAgainst || 0} Tore</em></div>
      <div class="stat-row"><span>Unterzahl</span><strong>${clockFromSeconds(short.seconds)}</strong><em>${short.goalsFor || 0}:${short.goalsAgainst || 0} Tore</em></div>`;

  $("#team-special-stats").innerHTML = `
    <div class="stat-row"><span>7 Meter</span><strong>${seven.goals || 0}/${seven.attempts || 0}</strong><em>${percent(seven.percentage)}</em></div>
    <div class="stat-row"><span>Verwarnungen</span><strong>${sanc.warnings || 0}</strong><em>Saison</em></div>
    <div class="stat-row"><span>2-Minuten</span><strong>${sanc.twoMinutes || 0}</strong><em>Saison</em></div>
    <div class="stat-row"><span>Disqualifikationen</span><strong>${sanc.disqualifications || 0}</strong><em>Saison</em></div>
    ${numericRows}
  `;''', 'youth numeric situations season UI')

    source = replace_exact(source, '''  renderTeamFiveMinute(analytics);
  renderTeamSpecialStats(analytics);''', '''  renderTeamGamePhases(analytics);
  renderTeamFiveMinute(analytics);
  renderTeamSpecialStats(analytics);''', 'render team game phases')

    source = replace_exact(source, '''function situationCard(label, item) {
  return `<div class="split-card"><h3>${label}</h3><div class="split-record">${clockFromSeconds(item?.seconds || 0)}</div><div class="split-caption">${item?.goals?.own || 0}:${item?.goals?.opponent || 0} Tore</div></div>`;
}''', '''function situationCard(label, item) {
  return `<div class="split-card"><h3>${label}</h3><div class="split-record">${clockFromSeconds(item?.seconds || 0)}</div><div class="split-caption">${item?.goals?.own || 0}:${item?.goals?.opponent || 0} Tore</div></div>`;
}

function renderMatchGamePhases(phases) {
  if (!Array.isArray(phases) || !phases.length) return "";
  return `<section class="content-grid">
    <article class="panel">
      <div class="panel-head"><div><span class="section-eyebrow">E-JUGEND SPIELSYSTEM</span><h2>2×3 gegen 3 vs. 6 gegen 6</h2></div><span class="panel-note">1. Halbzeit / 2. Halbzeit</span></div>
      <div class="split-stats">${phases.map(phase => gamePhaseCard(phase)).join("")}</div>
    </article>
  </section>`;
}''', 'match E-youth phase renderer')

    source = replace_exact(source, '''      </div></article>
    </section>

    <section class="content-grid content-grid--main">
      <article class="panel"><div class="panel-head"><div><span class="section-eyebrow">SPIELPHASEN</span><h2>5-Minuten-Splits</h2></div><span class="legend-inline"><i></i> SG <i></i> Gegner</span></div>${renderMatchSplits(analytics)}</article>''', '''      </div></article>
    </section>

    ${renderMatchGamePhases(analytics.gamePhases)}

    <section class="content-grid content-grid--main">
      <article class="panel"><div class="panel-head"><div><span class="section-eyebrow">SPIELPHASEN</span><h2>5-Minuten-Splits</h2></div><span class="legend-inline"><i></i> SG <i></i> Gegner</span></div>${renderMatchSplits(analytics)}</article>''', 'insert match game phases')

    source = replace_exact(source, '''      <article class="panel"><div class="panel-head"><div><span class="section-eyebrow">ÜBER-/UNTERZAHL</span><h2>Numerische Situationen</h2></div></div><div class="split-stats split-stats--three">
        ${situationCard("Gleichzahl", numeric.even)}
        ${situationCard("Überzahl", numeric.powerPlay)}
        ${situationCard("Unterzahl", numeric.shortHanded)}
      </div></article>''', '''      <article class="panel"><div class="panel-head"><div><span class="section-eyebrow">ÜBER-/UNTERZAHL</span><h2>Numerische Situationen</h2></div></div><div class="split-stats ${numeric.suspensionsAffectPlayerCount === false ? "" : "split-stats--three"}">
        ${situationCard("Gleichzahl", numeric.even)}
        ${numeric.suspensionsAffectPlayerCount === false
          ? `<div class="split-card"><h3>Jugendregel</h3><div class="split-record">Keine Unterzahl</div><div class="split-caption">2-Min.-Strafen führen nicht zu einer Spielerreduktion.</div></div>`
          : `${situationCard("Überzahl", numeric.powerPlay)}${situationCard("Unterzahl", numeric.shortHanded)}`}
      </div></article>''', 'match youth numeric situations UI')

    source = replace_exact(source, '''function fillTeamSelect(select) {
  select.innerHTML = state.teams
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .map(team => `<option value="${team.id}">${team.name}</option>`)
    .join("");
}''', '''function fillClubTeamSelect() {
  const select = $("#club-team-select");
  const teams = clubBaseTeams().slice().sort((a, b) => a.name.localeCompare(b.name, "de"));
  const selectedStillValid = !state.clubTeamId || teams.some(team => String(team.id) === String(state.clubTeamId));
  if (!selectedStillValid) state.clubTeamId = "";
  select.innerHTML = [
    `<option value="">Alle Mannschaften</option>`,
    ...teams.map(team => `<option value="${team.id}">${team.name}</option>`)
  ].join("");
  select.value = state.clubTeamId || "";
}

function fillTeamSelect(select) {
  select.innerHTML = state.teams
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .map(team => `<option value="${team.id}">${team.name}</option>`)
    .join("");
}''', 'club team select hierarchy')

    source = replace_exact(source, '''  $$("#scope-buttons .segment").forEach(button => button.addEventListener("click", () => {
    state.clubScope = button.dataset.scope;
    $$("#scope-buttons .segment").forEach(item => item.classList.toggle("is-active", item === button));
    $("#club-team-wrap").hidden = state.clubScope !== "team";
    renderClub();
  }));

  $("#club-team-select").addEventListener("change", event => {''', '''  $$("#scope-buttons .segment").forEach(button => button.addEventListener("click", () => {
    state.clubScope = button.dataset.scope;
    $$("#scope-buttons .segment").forEach(item => item.classList.toggle("is-active", item === button));
    fillClubTeamSelect();
    renderClub();
  }));

  $$("#gender-buttons .segment").forEach(button => button.addEventListener("click", () => {
    state.clubGender = button.dataset.gender;
    $$("#gender-buttons .segment").forEach(item => item.classList.toggle("is-active", item === button));
    fillClubTeamSelect();
    renderClub();
  }));

  $("#club-team-select").addEventListener("change", event => {''', 'filter event hierarchy')

    source = replace_exact(source, '''    const firstTeam = state.teams.slice().sort((a, b) => a.name.localeCompare(b.name, "de"))[0];
    state.clubTeamId = firstTeam?.id || null;
    state.trainerTeamId = firstTeam?.id || null;
    state.selectedMatchId = defaultMatchForTeam(state.trainerTeamId);

    fillTeamSelect($("#club-team-select"));
    fillTeamSelect($("#trainer-team-select"));
    $("#club-team-select").value = state.clubTeamId || "";
    $("#trainer-team-select").value = state.trainerTeamId || "";''', '''    const firstTeam = state.teams.slice().sort((a, b) => a.name.localeCompare(b.name, "de"))[0];
    state.clubTeamId = "";
    state.trainerTeamId = firstTeam?.id || null;
    state.selectedMatchId = defaultMatchForTeam(state.trainerTeamId);

    fillClubTeamSelect();
    fillTeamSelect($("#trainer-team-select"));
    $("#trainer-team-select").value = state.trainerTeamId || "";''', 'initial club hierarchy state')

    return source

patch_file('index.html', patch_index)
patch_file('styles.css', patch_styles)
patch_file('app.js', patch_app)
print('Public dashboard v4 patch applied successfully.')
