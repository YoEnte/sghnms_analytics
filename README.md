# SGHNMS Analytics

Statisches Analytics-Dashboard der SG Handball Neumünster. Die Website wird über GitHub Pages veröffentlicht und liest ausschließlich vorbereitete JSON-Exporte aus `data/`.

## Bereiche

- **Vereinsstatistik**: Gesamt, Senioren, Junioren, männlich, weiblich und jede einzelne Mannschaft
- **Trainer Dashboard**: Mannschaftsübersicht, Formkurve, Heim-/Auswärtsbilanz und Match-Historie

Event-basierte Traineranalysen (Runs, 5-Minuten-Splits, Timeouts, Über-/Unterzahl, Spielerstatistiken und Match Flow) sind im UI bereits vorgesehen, benötigen aber zusätzliche Detail-Exporte aus dem privaten Data-Repo.

## Daten

Aktuell erwartete Dateien:

```text
data/overview.json
data/teams.json
data/matches.json
data/coverage.json
```

Das Dashboard ist vollständig statisch und benötigt keinen Build-Schritt.

## GitHub Pages

Der Workflow `.github/workflows/deploy-pages.yml` veröffentlicht bei jedem Push auf `main` den Repository-Inhalt als GitHub Pages Site.

In GitHub unter **Settings -> Pages** muss als Source **GitHub Actions** aktiviert sein.

## Datenschutz / Auffindbarkeit

Die Seite ist technisch öffentlich. `robots.txt` sowie `meta robots=noindex,nofollow` bitten Suchmaschinen darum, die Seite nicht zu indexieren. Das ist keine Zugriffskontrolle.
