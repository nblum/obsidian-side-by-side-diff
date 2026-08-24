# Konzept: Statusanzeige für Änderungen

Status: Entwurf

## Ziel

Die Vergleichsansicht soll jederzeit eindeutig zeigen, welche Änderungen noch
offen sind, welche bereits akzeptiert und welche ignoriert wurden. Die Anzeige
spiegelt den Review-Fortschritt wider, ohne den Speicherstatus der Datei damit
zu verwechseln.

## Ausgangslage

Aktuell verschwinden bearbeitete Änderungen nach dem Akzeptieren oder
Ignorieren aus der offenen Navigation. Dadurch ist aus der Ansicht nicht
ersichtlich, ob eine Änderung erledigt wurde oder nie Teil des Reviews war.
Außerdem werden „ignoriert“ und „nicht mehr vorhanden“ visuell nicht klar
unterschieden.

## Geltungsbereich

Das Konzept umfasst:

- einen expliziten Status pro ursprünglicher Änderung,
- eine Zusammenfassung der offenen, akzeptierten und ignorierten Änderungen,
- eine dauerhafte Markierung erledigter Zeilen während der Review-Sitzung,
- die Anpassung von Navigation, Tastaturaktionen und automatischem Weiterspringen,
- zugängliche, übersetzbare Statusbezeichnungen.

Nicht Teil der ersten Umsetzung sind ein dauerhaftes Speichern des Review-
Status über mehrere Sitzungen und eine eigene Undo-Historie. Beides kann später
auf dem Statusmodell aufbauen.

## Statusmodell

Jede Änderung erhält genau einen Review-Status:

| Status | Bedeutung | Sichtbarkeit in der Ansicht | Navigation |
| --- | --- | --- | --- |
| `open` | Noch keine Entscheidung getroffen | normal hervorgehoben | Ziel von „Nächste/Vorherige Änderung“ |
| `accepted` | Änderung für die rechte Datei übernommen | sichtbar, mit positiver Markierung | wird übersprungen |
| `ignored` | Änderung bewusst verworfen bzw. zurückgestellt | sichtbar, dezent mit eigener Markierung | wird übersprungen |

Das Statusmodell bezieht sich auf die beim Laden erkannten Änderungen. Es ist
damit unabhängig davon, ob die resultierende Datei bereits gespeichert wurde.
Eine Statusänderung darf erst nach einer erfolgreichen Aktion erfolgen.

Für jede Änderung wird eine stabile Kennung benötigt. Die Kennung darf nicht
allein aus dem aktuellen Zeileninhalt bestehen, da sich dieser nach dem
Akzeptieren verändern kann. Geeignet ist eine Kombination aus Vergleichs-
Sitzung, Datei und ursprünglicher Diff-Position beziehungsweise einem stabilen
Diff-Entry aus dem Diff-Modell.

Beispiel für die fachliche Struktur:

```ts
type ReviewStatus = "open" | "accepted" | "ignored";

interface ReviewEntry {
  id: string;
  status: ReviewStatus;
  rowIndex: number;
}
```

`rowIndex` ist nur eine aktuelle Darstellungsposition und darf nicht als
dauerhafte Identität verwendet werden.

## Zustandsübergänge

| Aktion | Vorher | Nachher | Nebenwirkung |
| --- | --- | --- | --- |
| Akzeptieren | `open` | `accepted` | Inhalt der rechten Datei wird im Arbeitsspeicher aktualisiert |
| Ignorieren | `open` | `ignored` | Keine Dateiänderung; Änderung bleibt als erledigt sichtbar |
| Speichern | `accepted`/`ignored` | Status bleibt bis zum erfolgreichen Speichern sichtbar | Danach wird der Vergleich neu aufgebaut und die Statusliste zurückgesetzt |
| Verwerfen | beliebig | neue Review-Sitzung | ausstehende Änderungen und Status werden verworfen |
| Tauschen oder Editiermodus | beliebig | neue Review-Sitzung | bestehende Bestätigungsabfrage bleibt verpflichtend |
| Externe Änderung erkannt | beliebig | unverändert | Speichern wird abgebrochen; Status und lokale Änderungen werden nicht still überschrieben |
| Neu laden | beliebig | neue Review-Sitzung | Status werden aus dem neuen Diff abgeleitet |

Fehler bei einer Aktion dürfen keinen Statusübergang auslösen. So bleibt eine
Änderung bei einem fehlgeschlagenen Speichern weiterhin nachvollziehbar.

## Darstellung

### Zusammenfassung

Am Kopf der Vergleichsansicht wird eine kompakte Zusammenfassung angezeigt,
zum Beispiel:

`Offen: 2 · Akzeptiert: 3 · Ignoriert: 1`

Die Zähler werden aus dem Statusmodell berechnet und nicht aus sichtbaren DOM-
Elementen. Gibt es keine offenen Änderungen, wird das als abgeschlossener
Review-Zustand erkennbar angezeigt.

### Einzelne Änderung

Jede Diff-Zeile beziehungsweise jeder Änderungsblock erhält:

- eine Statusklasse, zum Beispiel `status-open`, `status-accepted` oder
  `status-ignored`,
- ein sichtbares Textlabel oder ein Symbol mit Tooltip,
- eine klare optische Trennung zwischen aktivem Fokus und Review-Status,
- weiterhin zugängliche Informationen über `aria-label` oder vergleichbare
  semantische Attribute.

Empfohlene visuelle Sprache:

- `open`: Akzentfarbe und Label „Offen“,
- `accepted`: grünes Häkchen und Label „Akzeptiert“,
- `ignored`: neutrales oder gedämpftes Symbol und Label „Ignoriert“.

Farbe allein ist kein Statussignal. Die Markierungen müssen auch bei hoher
Kontraststufe, ohne Farbwahrnehmung und in der Tastaturbedienung verständlich
bleiben. Die aktive Änderung erhält zusätzlich eine eigene Fokusmarkierung.

Die Aktionen „Akzeptieren“ und „Ignorieren“ sind für erledigte Änderungen
deaktiviert oder werden durch eine spätere Undo-Aktion ersetzt. In der ersten
Version genügt Deaktivieren; eine Undo-Funktion bleibt bewusst außerhalb des
Scopes.

## Navigation und Tastatur

„Nächste Änderung“ und „Vorherige Änderung“ navigieren ausschließlich zu
`open`-Einträgen und scrollen den Zielblock automatisch in den sichtbaren
Bereich. Die bestehende Markierung der aktiven Änderung bleibt unabhängig vom
Status erhalten.

Die vorhandenen Aktionen gelten weiterhin für die hervorgehobene Änderung:

- `Alt + Pfeil links`: ignorieren,
- `Alt + Pfeil rechts`: akzeptieren.

Nach einer erfolgreichen Aktion springt die Ansicht abhängig von der Option
„Nach Änderung automatisch weiterspringen“ zur nächsten offenen Änderung. Ist
die Option deaktiviert, bleibt der Fokus auf dem erledigten Block und dessen
neuer Status wird sichtbar.

## Lebenszyklus und Architektur

Die Statusverwaltung sollte als kleine, testbare Schicht zwischen Diff-Modell
und Darstellung umgesetzt werden:

1. Diff-Modell und Review-Einträge beim Aufbau einer Vergleichsansicht
   erzeugen.
2. Statusänderungen ausschließlich über typisierte Aktionen durchführen.
3. Zähler, Navigation und Zeilenmarkierungen aus demselben Statusmodell
   ableiten.
4. Bei Speichern, Verwerfen, Tauschen, Editiermodus und Neuladen den
   Sitzungslebenszyklus zentral zurücksetzen beziehungsweise neu aufbauen.
5. Speicherfehler und externe Änderungen als fehlgeschlagene Aktion behandeln,
   ohne lokale Statusinformationen zu verlieren.

Damit werden widersprüchliche Zustände vermieden, etwa ein Zähler „akzeptiert“,
obwohl die Zeile noch als offen navigierbar ist.

## Tests und Abnahmekriterien

Die Umsetzung gilt als vollständig, wenn:

- neue Änderungen den Status `open` erhalten,
- Akzeptieren und Ignorieren genau den erwarteten Status setzen,
- die drei Zähler immer die Statusliste widerspiegeln,
- Navigation erledigte Änderungen überspringt und bei Bedarf umschlägt,
- automatisches Weiterspringen mit aktivierter und deaktivierter Option korrekt
  funktioniert,
- die Statusanzeige auch nach fehlgeschlagenem Speichern konsistent bleibt,
- ein extern verändertes Ziel nicht überschrieben wird,
- Tauschen, Editiermodus, Verwerfen und Neuladen eine neue Review-Sitzung
  korrekt behandeln,
- Tastatur- und Screenreader-Nutzer den Status ohne Farbwahrnehmung erkennen,
- deutsche und englische Labels vorhanden sind.

Für die Logik sind Unit-Tests des Statusmodells und der Navigation zu
bevorzugen. Ergänzend sollten wenige View-Tests die Statusklassen, Zähler,
Scrollziel und Tastaturaktionen prüfen.

## Offene Produktentscheidung

Empfehlung für die erste Umsetzung: Akzeptierte und ignorierte Änderungen
bleiben bis zum expliziten Speichern oder Verwerfen sichtbar. So kann der
Nutzer den vollständigen Review-Fortschritt prüfen und erkennt jederzeit, was
bereits entschieden wurde.
