# Funktionen und Anforderungen

Dieses Dokument beschreibt den umgesetzten Funktionsumfang von **Side-by-Side Diff** und dient als Referenz für
Weiterentwicklung und Abnahme.

## Ziel

Das Plugin soll zwei Textdateien aus dem aktuellen Obsidian-Vault sicher und nachvollziehbar vergleichen. Änderungen
werden sichtbar gemacht, können einzeln geprüft und vorgemerkt werden und werden ausschließlich durch eine explizite
Speicheraktion geschrieben.

## Funktionsumfang

### Vergleichsansicht

- Zwei unterschiedliche Textdateien werden links und rechts synchron dargestellt.
- Änderungen werden zeilenweise und innerhalb geänderter Zeilen inline hervorgehoben.
- Bei unterschiedlicher Zeilenanzahl werden auf der kürzeren Seite an der Änderungsposition visuelle Leerzeilen
  ergänzt, damit die Folgezeilen synchron bleiben.
- Die Toolbar steht oberhalb des Vergleichs und enthält die Bearbeitungsaktionen.
- Die Ansicht zeigt in den Dateiköpfen die Dateinamen sowie je nach Kontext `Vergleich`, `Original` oder `Vorschlag`.
- `Tauschen` vertauscht beide Dateien und kehrt bei Vorschlägen die Richtung der Übernahme um.
- `Aktualisieren` ist im Datei-Kontextmenü verfügbar und lädt eine geöffnete Vergleichsansicht neu.
- Die Scrollposition bleibt beim Vormerken, Ignorieren und Speichern einer Änderung erhalten.

### Änderungen übernehmen und ignorieren

- `→` übernimmt eine einzelne Änderung zunächst nur in der Ansicht.
- `×` ignoriert ausschließlich den linken Diff-Anteil; der rechte Inhalt bleibt sichtbar und unverändert.
- `Änderungen speichern` schreibt vorgemerkte Änderungen in die betroffenen Dateien.
- Die Schaltfläche zum Speichern ist deaktiviert, wenn keine ungespeicherten Änderungen vorliegen.
- Erst nach dem expliziten Speichern werden Dateien im Vault verändert.
- Wenn alle Änderungsvorschläge bearbeitet wurden, erscheint die Meldung `Alle Änderungsvorschläge wurden bearbeitet.`.

### Editiermodus

- Im normalen Diff-Modus kann die rechte Seite über `Bearbeitungsmodus` direkt bearbeitet werden.
- Die linke Seite bleibt schreibgeschützt.
- Der Editierbereich ist ein gemeinsames mehrzeiliges Eingabefeld.
- Mehrzeilige Auswahl, Löschen, Backspace und `Enter` für neue Leerzeilen funktionieren.
- Die beiden Seiten bleiben während der Bearbeitung zeilenweise ausgerichtet.
- `Vergleichsmodus` beendet die direkte Bearbeitung.
- Gespeichert wird über `Änderungen speichern` oder `Strg/Cmd + S`.
- Beim Schließen mit ungespeicherten Änderungen fragt das Plugin, ob gespeichert werden soll.
- Die vorhandene Zeilenendungsart der bearbeiteten Datei bleibt beim Speichern erhalten.

### Änderungsvorschläge

- `Änderungen vorschlagen` erstellt neben dem aktiven Dokument eine Kopie mit konfiguriertem Suffix und Zeitstempel.
- Ein Beispielname ist `Dokument_changes_20260817-143000.md`.
- Eine bereits vorhandene passende Kopie wird bevorzugt geöffnet; dabei wird die neueste Kopie verwendet.
- Im Vorschlagsmodus steht das Original links und die bearbeitbare Kopie rechts.
- `Änderungen übernehmen` öffnet die umgedrehte Ansicht mit Kopie links und Original rechts.
- Vorschläge werden erst nach Prüfung und explizitem Speichern ins Original geschrieben.

### Weitere Aktionen

- Identische Dateien zeigen eine eigene Meldung.
- Aus dieser Meldung kann nach Bestätigung eine der Dateien in Obsidian-Papierkorb verschoben werden. Die Datei wird
  nicht endgültig gelöscht und kann wiederhergestellt werden.
- Beim Umbenennen oder Löschen einer verglichenen Datei reagiert die geöffnete Ansicht auf die Vault-Änderung.
- Bekannte Binärformate werden nicht als Textdateien zur Auswahl angeboten.

### Übersetzte Oberfläche

- Die sichtbare Plugin-Oberfläche ist auf Deutsch und Englisch verfügbar.
- Unter **Einstellungen → Side-by-Side Diff → Sprache** stehen `Automatisch`, `Deutsch` und `English` zur Auswahl.
- `Automatisch` berücksichtigt die Obsidian-Sprache; nicht unterstützte Sprachen verwenden Englisch als Fallback.
- Übersetzungen liegen getrennt in `locales/de.json` und `locales/en.json`.

## Zugriffspunkte in Obsidian

| Zugriff | Aktion |
| --- | --- |
| Befehlspalette | `Aktuelle Datei mit anderer Datei vergleichen` |
| Befehlspalette | `Zwei Dateien vergleichen` |
| Befehlspalette | `Änderungen für aktuelle Datei vorschlagen` |
| Ribbon-Leiste | `Zwei Dateien vergleichen` |
| Datei-Kontextmenü | `Mit anderer Datei vergleichen` |
| Datei-Kontextmenü | `Änderungen vorschlagen` |
| Datei-Kontextmenü, wenn vorhanden | `Änderungen übernehmen` |
| Datei-Kontextmenü bei offener Vergleichsansicht | `Aktualisieren` |

## Einstellungen

Unter **Einstellungen → Side-by-Side Diff** stehen folgende Optionen zur Verfügung:

- **Sprache**: Die Plugin-Oberfläche automatisch, auf Deutsch oder auf Englisch anzeigen.
- **Im linken Hauptmenü anzeigen**: Das Symbol in der linken Ribbon-Leiste ein- oder ausblenden. Befehlspalette und
  Dokumentmenüs bleiben davon unberührt.
- **Suffix für Änderungskopien**: Den Text vor dem Zeitstempel der Änderungskopien anpassen. Nicht zulässige
  Dateinamenzeichen werden automatisch ersetzt.

## Technische Anforderungen

- Obsidian `1.5.0` oder neuer.
- Vergleichbare Dateien müssen Textdateien im Vault sein.
- Es werden keine externen Dienste oder zusätzlichen Laufzeitabhängigkeiten benötigt.
- Jede unterstützte Sprache benötigt eine vollständige Übersetzungsdatei mit demselben Schlüsselbestand wie die anderen
  Sprachen.
- Der Speichervorgang muss immer explizit durch die Nutzerin oder den Nutzer ausgelöst werden.
- Die Diff-Berechnung muss deterministisch bleiben. Für sehr große Vergleiche greift ein indexbasierter Fallback, damit
  die Berechnung nicht unkontrolliert wächst.

## Abnahmekriterien für Änderungen

Eine Änderung am Funktionsumfang gilt als vollständig dokumentiert und geprüft, wenn:

1. der betroffene Ablauf in diesem Dokument aktualisiert ist,
2. verändertes Verhalten durch Tests oder eine nachvollziehbare manuelle Prüfung abgedeckt ist,
3. die Regeln zum expliziten Speichern und zur Sichtbarkeit beider Seiten erhalten bleiben,
4. die Bedienbegriffe in Code, README und dieser Referenz konsistent sind.
