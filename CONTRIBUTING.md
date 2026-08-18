# Beiträge leisten

Danke für dein Interesse an **Side-by-Side Diff**. Das Plugin ist ein schlankes, lokal laufendes Obsidian-Plugin.
Beiträge sollten deshalb klein, nachvollziehbar und auf den Vergleichsworkflow konzentriert bleiben.

## Entwicklungsumgebung

- Obsidian `1.5.0` oder neuer für manuelle UI-Prüfungen
- Node.js 22.6 oder neuer für `node:test` mit TypeScript-Unterstützung
- npm für Build, Typecheck, Linting und Tests

Einmalig werden die lokalen Entwicklungsabhängigkeiten installiert:

```bash
npm install
```

Die Entwicklung erfolgt direkt im Plugin-Ordner. Für eine manuelle Prüfung muss der Ordner als
`.obsidian/plugins/side-by-side-diff/` in einem Test-Vault liegen und das Plugin in Obsidian aktiviert sein.
Nach Änderungen an `src/` zuerst `npm run build` ausführen; anschließend die Plugin-Ansicht beziehungsweise Obsidian
neu laden.

## Vor dem Ändern

1. Lies [README.md](README.md) für den Einstieg und [FEATURES.md](FEATURES.md) für den aktuellen Umfang.
2. Prüfe mit `git status`, ob bereits Änderungen im Arbeitsbaum liegen.
3. Suche nach bestehenden Tests und ähnlichen Abläufen, bevor du neue Logik anlegst.
4. Halte die Änderung auf den betroffenen Funktionsbereich begrenzt.

## Arbeitsweise

- Verwende bestehende Muster und Benennungen im Plugin.
- Schreibe TypeScript im Strict-Modus mit expliziten Typen an Modulgrenzen und ohne unnötige globale Zustände.
- Halte Funktionen klein und verwende frühe Rückgaben, wenn dadurch die Logik klarer wird.
- Ergänze kurze technische Kommentare an nicht offensichtlichen Stellen; neue Klassen und Funktionen erhalten einen
  kurzen Docblock.
- Verwende in der Benutzeroberfläche die vorhandenen deutschen Begriffe sowie korrekte Umlaute und `ß`.
- Neue sichtbare Texte gehören in `locales/de.json` und `locales/en.json`; halte die Schlüssel in beiden Dateien identisch.
- Prüfe bei neuen Platzhaltern beide Sprachen und verwende stabile Schlüssel statt sichtbarer Texte als Logikmarker.
- Schreibe keine Datei beim Tippen oder bei einer einzelnen Diff-Aktion. Änderungen müssen bis zum expliziten Speichern
  vorgemerkt bleiben.
- Vermeide nicht deterministische Sortierungen und Änderungen außerhalb des betroffenen Bereichs.

## Tests

Führe aus dem Plugin-Ordner aus:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Die Tests decken die deterministischen Diff-, Synchronisierungs- und Übersetzungsregeln ab, unter anderem:

- Einfügen, Entfernen und Ersetzen einzelner Zeilen
- Ignorieren von Änderungen bei sichtbarem rechtem Inhalt
- Ausrichtung bei unterschiedlicher Zeilenanzahl
- Erhalt von Zeilenenden und abschließenden Leerzeilen
- Ausschluss visueller Ausrichtungslücken beim Speichern
- gleiche Schlüssel und Platzhalter in den deutschen und englischen Übersetzungen

## Manuelle Prüfliste

Bei Änderungen an Ansicht oder Speicherlogik mindestens diese Fälle prüfen:

- identische Dateien
- geänderte, eingefügte und entfernte Zeilen
- inline Unterschiede innerhalb einer Zeile
- `→`, `×`, `Tauschen` und `Aktualisieren`
- Speichern per Schaltfläche und per `Strg/Cmd + S`
- deaktivierte Speicherschaltfläche ohne offene Änderungen
- Bearbeitungsmodus mit mehrzeiliger Auswahl, Löschen, Backspace und `Enter`
- Rückfrage beim Schließen mit ungespeicherten Änderungen
- Erstellung, Wiederverwendung und Übernahme einer Änderungskopie
- Ribbon-Sichtbarkeit und Suffix in den Einstellungen
- Sprachwechsel zwischen `Automatisch`, `Deutsch` und `English`
- Dateien mit unterschiedlichen Zeilenendungen

## Dokumentation

Aktualisiere die Dokumentation, wenn sich ein sichtbarer Ablauf, ein Befehl, eine Einstellung oder eine Anforderung
ändert:

- `README.md` bleibt die kurze Einstiegsseite.
- `FEATURES.md` beschreibt den vollständigen Funktionsumfang und die Abnahmekriterien.
- `CONTRIBUTING.md` beschreibt den Entwicklungs- und Prüfablauf.
- `locales/de.json` und `locales/en.json` enthalten die UI-Übersetzungen.

## Checkliste für einen Beitrag

- [ ] Änderung ist auf einen klaren Zweck begrenzt.
- [ ] Betroffene Tests wurden ergänzt oder angepasst.
- [ ] Automatisierte Tests laufen erfolgreich.
- [ ] Manuelle Prüfung wurde bei UI- oder Speicheränderungen durchgeführt.
- [ ] Bedienbegriffe und Dokumentation sind aktuell.
- [ ] `git diff --check` meldet keine Whitespace-Fehler.
