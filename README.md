# SGHNMS Analytics

Öffentliches, statisches Analytics-Dashboard für die SG Handball Neumünster. Die Seite läuft ohne Build-Schritt auf GitHub Pages und verarbeitet ausschließlich bereits aufbereitete Exporte aus dem privaten Repository `sghnms_handball_data`.

## Daten

Die Dateien unter `data/` sind der Public Export der privaten Datenpipeline. Für die erweiterte Analytics-Ansicht werden zusätzlich genutzt:

- `coverage.json` – API- und Quality-Abdeckung
- `quality.json` – Qualität pro Spiel
- `team-analytics.json` – aggregierte Event-Analytics pro SG-Team
- `players.json` – Spieler-/Team-Saisonwerte
- `match-analytics/index.json` – Index aller Match-Detaildateien
- `match-analytics/<matchId>.json` – Match Flow, 5-Minuten-Splits, Runs, 7m, Timeouts, numerische Situationen und Spielerwerte

## Bereiche

### Vereinsstatistik

Filter: SG gesamt, Senioren, Junioren, männlich, weiblich und einzelne Mannschaft. Enthalten sind Saisonbilanz, Tordifferenz, Form, Mannschaftsvergleich und Datenqualität. Zusätzlich zeigt die Vereinsstatistik filterabhängige Top-Spieler mit Einsätzen, Toren, Toren pro Spiel und 7m-Werten sowie sortierbare Offensive-/Defensive-Rankings aller Mannschaften. Die Rankings enthalten Tore, Gegentore, Werte pro Spiel und altersklassenübergreifend vergleichbare Werte pro 10 Minuten nomineller Spielzeit.

### Trainer Dashboard

Drei Tabs:

- **Übersicht** – Form, Heim/Auswärts, 5-Minuten-Splits, 7m, Strafen, Über-/Unterzahl, Timeouts und längste Serien.
- **Spieler** – Einsätze, Tore, Tore pro Spiel, Toranteil, 7m und Zeitstrafen.
- **Spiele** – Matchauswahl mit Match Flow, 5-Minuten-Splits, Runs, torlosen Phasen, 7m, Timeouts, Über-/Unterzahl und Spielerstatistik des einzelnen Spiels.

Spiele mit nicht plausibel vollständigem Eventstream bleiben in Ergebnis-/Saisonstatistiken enthalten, werden aber aus Event-Analytics ausgeschlossen.

## GitHub Pages

Deployment erfolgt über `.github/workflows/deploy-pages.yml`. In GitHub unter **Settings → Pages → Source → GitHub Actions** auswählen.

## Datenschutz / Indexierung

Das Repository und GitHub Pages sind technisch öffentlich. `robots.txt` sowie `noindex,nofollow` sollen Suchmaschinen von der Indexierung abhalten, sind aber keine Zugriffskontrolle.
