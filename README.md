# SGHNMS Handball Data

Private data pipeline for SG Handball Neumuenster analytics.

This repository fetches the current club season from handball.net, archives raw match data, downloads match-specific event and lineup responses, normalizes the data and builds verified analytics exports for the public dashboard repository.

## Principles

- Raw API responses are kept unchanged.
- Finished match details are cached and are not fetched again unless `--force` is used.
- Missing detail endpoints are cached for 24 hours before another retry.
- The official match API is the source of truth for the final result and match metadata.
- Event data is the source of truth for scoring flow, scorers, seven-meters, sanctions, timeouts and other match analytics.
- Lineups are the source of truth for roster metadata such as player IDs and shirt numbers and are used as a cross-check for event scorers.
- Seven-meter attempts are derived from event types `39` and `1004`, not from lineup aggregates.
- Public dashboard data is generated separately under `generated/public/`.

## Requirements

- Node.js 20+
- No npm runtime dependencies

## First setup

```bash
npm install
npm run qa
```

## Full refresh

```bash
npm run refresh
```

Equivalent to:

```bash
npm run fetch:season
npm run fetch:details
npm run normalize
npm run analyze:all
npm run build:exports
npm run build:analytics
npm run validate:data
```

## Match quality layer

Every generated match analysis now contains a `quality` block.

Example:

```json
{
  "status": "verified",
  "eventsAvailable": true,
  "lineupsAvailable": true,
  "eventScoreMatchesOfficial": true,
  "lineupScoreMatchesOfficial": true,
  "halftimeAvailable": true,
  "halftimeSource": "derived",
  "expectedDurationSeconds": 3000,
  "eventDurationSeconds": 3000,
  "durationMatchesExpected": true,
  "analyticsEligible": true,
  "warnings": []
}
```

A match is considered `analyticsEligible` when an event response exists and the final event score matches the official result from the match API.

Lineup inconsistencies do not invalidate event-based analytics. They are reported separately because scorers, runs, five-minute splits and other trainer metrics are derived from events.

### Warning codes

The current quality layer can emit:

```text
EVENTS_MISSING
EVENT_SCORE_MISMATCH
LINEUPS_MISSING
LINEUP_SCORE_MISMATCH
HALFTIME_MISSING
DURATION_MISMATCH
SCORER_LINEUP_MISMATCH
```

Warnings have a severity of `warning` or `critical`. Critical warnings make the match ineligible for event-based analytics.

## Expected match duration

The pipeline no longer blindly trusts the event clock as the analytical match duration.

Expected duration is maintained per SG team in `config/config.js`:

```text
Seniors / A youth   60 min
B / C youth         50 min
D / E youth         40 min
```

The raw event duration is retained as `eventDurationSeconds`. Five-minute splits, scoring droughts and timeout windows use the expected duration for the SG team.

A mismatch is reported but does not automatically invalidate a match if the event score still matches the official final result.

## Halftime score

The pipeline first uses an explicit first-half `Teilende` event when available.

If that event is missing, the halftime score is derived from the last score-bearing event in the `1. Halbzeit` block.

The source is exposed as:

```text
halftimeSource: event | derived | null
```

## Source-of-truth hierarchy

### Match API

Used for:

- official final result
- home/away teams
- competition and phase
- date/time
- venue
- finished/live status

### Events API

Used for:

- goals and scorers
- score timeline
- seven-meter goals and misses
- warnings / two-minute penalties / disqualifications
- timeouts
- scoring runs
- scoring droughts
- five-minute splits
- later trainer analytics such as power-play / short-handed phases

### Lineups API

Used for:

- match roster
- player IDs
- shirt numbers
- staff and roles
- scorer-to-lineup cross-check

The currently observed `minutes_played`, `is_starter`, `is_goalkeeper` and `is_captain` fields are not used for analytics because they have not been reliably populated in the sampled season data.

## Repository structure

```text
config/
  config.js

lib/
  analytics.js
  fs-utils.js
  handball-client.js
  quality.js
  season.js

raw/
  season/
    index.json
    pages/
  matches/
    <matchId>/
      match.json
      events.json
      lineups.json

scripts/
  fetch-season.js
  fetch-match-details.js
  normalize.js
  analyze-match.js
  analyze-all.js
  build-exports.js
  build-analytics-exports.js
  validate-data.js
  qa.js

generated/
  normalized/
    matches.json
    events.json
    appearances.json
    players.json
  matches/
    <matchId>.analysis.json
    <matchId>.report.txt
  public/
    overview.json
    teams.json
    matches.json
    coverage.json
    quality.json
    team-analytics.json
    players.json
    match-analytics/
      index.json
      <matchId>.json
```

## Fetching one reference match

```bash
npm run fetch:season
npm run fetch:details -- --match 677910
npm run analyze:match -- --match 677910
```

Generated files:

```text
generated/matches/677910.analysis.json
generated/matches/677910.report.txt
```

To explicitly refresh its detail endpoints:

```bash
npm run fetch:details -- --match 677910 --force
```

## Public dashboard scopes

`generated/public/overview.json` creates the planned aggregation levels:

```text
overall
seniors
juniors
male
female
```

`generated/public/teams.json` contains one record per SG team.

Each SG team in `config/config.js` has:

```text
team id
label
name
ageGroup: senior | youth
gender: male | female
matchMinutes
```

## Coverage and verified analytics

`generated/public/coverage.json` now distinguishes endpoint availability from verified analytical usability.

Core structure:

```text
finishedMatches
endpointCoverage
  eventsAvailable
  lineupsAvailable
  bothAvailable
verifiedAnalytics
  eligibleMatches
  excludedMatches
  percent
verification
warningSummary
teams
```

This means `100% API coverage` no longer automatically means `100% verified analytics`.

For example, a match whose event log ends at `7:5` while the official result is `26:10` remains valid for club-level win/loss statistics but is excluded from event-based trainer analytics.

`generated/public/quality.json` contains the detailed quality block for every finished match.

`generated/public/matches.json` also exposes the quality summary alongside each match for future dashboard filtering.

## Data validation

After building exports:

```bash
npm run validate:data
```

The command validates coverage totals and prints a short summary such as:

```text
Finished matches: 73
API coverage: 73/73 (100%)
Verified analytics: 72/73 (98.6%)
```

It does not fail merely because one match is analytically ineligible. Such cases are expected data-quality findings and are surfaced through `coverage.json`.

## GitHub Actions

`.github/workflows/refresh-data.yml` runs every six hours and can also be started manually.

It executes the full refresh, commits changed raw/generated data back into this private repository and then mirrors `generated/public/` into the `data/` directory of the public `hannesmodes-sghnms/sghnms_analytics` repository. A public commit is created only when the exported dashboard data actually changed.

### One-time setup for automatic publishing

Create a fine-grained GitHub personal access token with access to only the public `sghnms_analytics` repository and grant it **Contents: Read and write**. Add that token to this private repository under:

```text
Settings -> Secrets and variables -> Actions -> New repository secret
Name: ANALYTICS_REPO_TOKEN
```

The token is used only by the private Actions runner to check out and push the `data/` directory of the public repository. It is never written into generated files or exposed to the browser.

The automated chain is therefore:

```text
handball.net
  -> private refresh / validation
  -> generated/public/
  -> public sghnms_analytics/data/
  -> GitHub Pages
```

If the secret is missing, the private refresh and private commit still complete first, after which the workflow fails with a clear error before the public publish step.

## Next steps

1. Run the v2 refresh against the existing season cache.
2. Validate the expected `72/73` verified analytics coverage from the current dataset.
3. Inspect team-level coverage and warning distribution.
4. Freeze the public JSON schema.
5. Connect `generated/public/` to `sghnms_analytics`.
6. Build the club statistics and trainer dashboard frontend.
## Detailed trainer analytics exports

`npm run build:analytics` publishes the verified event analytics needed by the public trainer dashboard.

Per-match files are written to `generated/public/match-analytics/<matchId>.json`. Matches that fail the event-score verification are still present, but contain `analytics: null` and keep their quality warnings. This prevents the frontend from accidentally displaying incomplete event analytics.

The public match analytics currently include:

- oriented SG/opponent score timeline for match-flow charts
- five-minute splits
- longest scoring runs and scoring droughts
- seven-meter goals, misses and attempts derived from events
- warnings, two-minute penalties and disqualifications
- timeout windows and the following three minutes
- reconstructed even-strength, power-play and short-handed phases from two-minute penalties
- event-derived player goals, seven-meter stats and sanctions combined with lineup shirt numbers

`generated/public/team-analytics.json` aggregates those metrics for every SG team.

`generated/public/players.json` contains one row per player/team combination with appearances, event-derived goals, seven-meter stats and sanctions.

The power-play model reconstructs a two-minute penalty as a 120-second interval and supports overlapping penalties. These figures describe numerical situations from the available event stream; they should not be interpreted as possession-based efficiency because possession data is not available.

