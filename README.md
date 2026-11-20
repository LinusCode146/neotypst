# NeoTypst

Ein Typst-Editor für macOS, gemacht für Arbeitsblätter in Mathe und Physik, Hausaufgaben, Wettbewerbe und Informatik-Dokumentationen.

Tauri 2 · React · CodeMirror 6 · Typst 0.15 (direkt eingebunden, keine CLI und kein Language Server nötig)

## Funktionen im Überblick

- **Live-Vorschau** wie in der Typst-Web-App, Klick in die Vorschau springt zum Code, Trackpad-Pinch zum Zoomen
- **Vorlagen** mit Formular: Arbeitsblatt (mit Lösungsversion), Hausaufgabe, Wettbewerb, Dokumentation, leer, dazu eigene Vorlagen
- **Bausteine** per Abkürzung + Tab, **Befehlspalette** (⌘K), **Vim-Modus**, Autovervollständigung von Typst selbst
- **Tabellen-Editor** und **Matrix-Editor** als Gitter, die bestehende Tabellen und Matrizen einlesen
- **Formeln:** Hervorhebung, unbekannter Text wird automatisch zu `"Text"`, Symbolpalette mit deutschen Suchbegriffen
- **Grafik-Bausteine** (Koordinatensystem, Plots, Kräfte, Stromkreis, Flussdiagramm …)
- **Rechtschreibung** Deutsch/Englisch, pro Absatz automatisch erkannt
- **Literatur** per DOI/ISBN, Zitieren, Zitierstile
- **PDF-Export**, auf Wunsch Schüler- und Lösungsversion in einem Schritt

## Voraussetzungen

- macOS
- [Rust](https://rustup.rs) (stabil) und [Node.js](https://nodejs.org) ab Version 20
- Xcode Command Line Tools (`xcode-select --install`)

## Starten

```bash
npm install
npm run app        # Entwicklungsmodus (tauri dev)
npx tauri build    # fertige .app / .dmg in src-tauri/target/release/bundle
```

`npm run dev` allein startet die Oberfläche im Browser mit Testdaten (`src/dev/mock.ts`). Das ist praktisch, um am Design zu arbeiten.

## Projekte

Jedes Projekt ist ein Ordner in `~/Documents/Typst/`:

```
Projekt/
├── main.typ        Hauptdatei (per Rechtsklick änderbar)
├── assets/         Bilder (per Drag & Drop hineinziehen)
├── templates/      Vorlagen-Bausteine des Projekts
└── out/            exportierte PDFs
```

### Dateibaum

- **Rechtsklick** auf eine Datei: Öffnen, als Hauptdatei festlegen, als Abbildung einfügen, Umbenennen, Duplizieren, Pfad kopieren (so, wie er in der aktuellen Datei für `#image`/`#include` geschrieben wird), im Finder zeigen, in den Papierkorb.
- **Rechtsklick auf einen Ordner:** zusätzlich „Neue Datei hier“ und „Neuer Ordner hier“. Rechtsklick auf freie Fläche legt Dateien und Ordner im Projekt an.
- **Oben** gibt es Knöpfe für neue Datei, neuen Ordner (im markierten Ordner) und „alle zuklappen“. Ohne Endung wird eine Datei zu `.typ`, Pfade wie `kapitel/einleitung` legen Unterordner gleich mit an.
- **Verschieben** per Ziehen auf einen Ordner, oder auf freie Fläche für die oberste Ebene. Offene Dateien und die Hauptdatei ziehen mit um.
- **Löschen** legt in den macOS-Papierkorb, „Rückgängig“ in der Meldung holt die Datei zurück. Die Hauptdatei ist geschützt.
- **Filtern:** Das Suchfeld zeigt passende Dateien mit ihren Ordnern, ↩ öffnet den ersten Treffer, ↓ springt in die Liste.
- **Tastatur** im Baum: ↑/↓ wählen, →/← auf- und zuklappen, ↩ öffnen, F2 umbenennen, ⌘D duplizieren, ⌘⌫ in den Papierkorb.
- Im Finder hinzugefügte Dateien erscheinen, sobald du zu NeoTypst zurückwechselst. Aufgeklappte Ordner merkt sich der Baum pro Projekt.

## Tastenkürzel

| Kürzel | Aktion |
|---|---|
| ⌘K | Befehlspalette: Befehle, Bausteine, Dateien, Einstellungen |
| ⌘P | Datei öffnen |
| ⌘⇧B | Literatur & Zitate (DOI/ISBN nachschlagen, zitieren, Zitierstil) |
| ⌥⌘L | Rechtschreibung: Automatisch → Deutsch → Englisch |
| ⌘⇧G | Grafik einfügen (Koordinatensystem, Plots, Kräfte, Stromkreis, Flussdiagramm …) |
| ⌘⇧S | Symbolpalette: griechische Buchstaben, Pfeile, Relationen, Mengen, Strukturen wie Wurzel oder Vektorpfeil |
| ⌘T | Tabellen-Editor (Cursor in einer Tabelle → bearbeiten, sonst neue Tabelle); in einer Formel der Matrix-Editor |
| ⌘E / ⌘⇧E | PDF exportieren / Aufgaben + Lösungen exportieren |
| ⌘⇧L | Lösungen ein-/ausblenden |
| ⌘S | Speichern (sonst automatisch) |
| ⌘J | Cursorposition in der Vorschau zeigen |
| ⌘B / ⌘I | fett / kursiv |
| ⌘M / ⌘⇧M | Inline-Formel / abgesetzte Formel |
| ⌘⇧T | Markdown-Tabelle (`\| a \| b \|`) in `#table` umwandeln |
| ⌘/ | Kommentar |
| ⌘+ / ⌘− / ⌘0 | Vorschau zoomen / an Breite anpassen (oder Trackpad-Pinch in der Vorschau) |
| ⌘\ | Seitenleiste |
| Ctrl+Space | Autovervollständigung |

Ein Klick in die Vorschau springt zur passenden Stelle im Code.

### Beim Tippen

| Eingabe | Wirkung |
|---|---|
| ⇧↩ | Eine Zeile tiefer springen, in der letzten Zeile eine neue anhängen (ohne Vim) |
| ⌘↩ | Neue leere Zeile unter der aktuellen, ohne die Zeile zu teilen |
| `$` | Setzt `$$` mit dem Cursor dazwischen |
| Leerzeichen zwischen `$$` | `$ \| $`, also eine abgesetzte Formel; ⌫ macht es rückgängig |

Der **Vim-Modus** lässt sich in der Befehlspalette (⌘K → „Vim-Modus einschalten“) aktivieren, `:w` speichert.

## Bausteine (Abkürzung + Tab)

| Abkürzung | Ergebnis |
|---|---|
| `tbl3x4` | Tabelle mit 3 Zeilen (inkl. Kopfzeile) × 4 Spalten, Tab springt von Zelle zu Zelle |
| `mat2x3` | Matrix 2 × 3 |
| `grid3` | drei Spalten nebeneinander |
| `aufgabe`, `teil`, `platz`, `merke`, `loesung` | Arbeitsblatt |
| `eq`, `ali`, `frac`, `vec`, `cases`, `int`, `sum`, `lim`, `abl`, `einheit` | Mathe |
| `fig`, `figt` | Abbildung / Tabelle mit Beschriftung |
| `code`, `codefile`, `hinweis` | Informatik |
| `wertetabelle`, `tblcsv` | Wertetabelle / Tabelle aus CSV |

Alle Bausteine findest du auch in der Befehlspalette, z. B. „tabelle 3x4“.

## Vorlagen

Beim Anlegen fragt ein kurzes Formular die Felder der Vorlage ab (Titel, Fach, Klasse, Name, Datum …). Felder mit „gemerkt“ werden fürs nächste Projekt vorausgefüllt. Die Vorschaubilder sind die echte erste Seite, gerendert mit Typst.

**Eigene Vorlagen:** Über ⌘K → „Projekt als Vorlage speichern“ wird ein Projekt nach `~/Documents/Typst/_Vorlagen/<Name>/` kopiert. In den .typ-Dateien werden Platzhalter wie `{{titel}}` und `{{datum}}` beim Anlegen ausgefüllt. Weitere Felder legst du in `vorlage.json` fest:

```json
{
  "name": "Physik-Test",
  "description": "Klassenarbeit mit Bewertungstabelle",
  "fields": [
    { "key": "titel", "label": "Titel", "default": "Test" },
    { "key": "klasse", "label": "Klasse", "remember": true },
    { "key": "fach", "label": "Fach", "kind": "choice", "options": ["Physik", "Mathematik"] },
    { "key": "datum", "label": "Datum", "kind": "date" }
  ]
}
```

## Literatur (⌘⇧B)

- **Quellen hinzufügen:** DOI (z. B. `10.1103/PhysRev.47.777`) oder ISBN ins Suchfeld einfügen und ↩ drücken. Die Daten kommen von doi.org bzw. Open Library, Schlüssel wie `einstein1935can` werden automatisch erzeugt. Das BibTeX lässt sich vor dem Speichern bearbeiten. Mit **Manuell** legst du Bücher, Artikel und Webseiten an (Abrufdatum automatisch).
- **Zitieren:** ↩ fügt `@schluessel` ein, ⇧↩ fragt nach einer Seite und fügt `@schluessel[S. 12]` ein. Nach `@` schlägt die Autovervollständigung alle Quellen vor.
- **Beim ersten Eintrag** werden `literatur.bib` und `#bibliography("literatur.bib", title: [Literatur])` am Ende der Hauptdatei angelegt. Vorhandene `#bibliography(...)`-Aufrufe und `.bib`/`.yml`-Dateien werden erkannt.
- **Zitierstil** (unten im Fenster): IEEE, APA, ISO 690 (DIN), Chicago, Harvard, MLA, APS, Springer, Nature, Vancouver. Er wird als `style:` in den `#bibliography`-Aufruf geschrieben.

## Rechtschreibung

Geprüft wird nur Fließtext. Code, Formeln, Codeblöcke, Labels, Links und Strings erkennt Typsts Parser und lässt sie aus. Die Prüfung übernimmt die macOS-Rechtschreibprüfung, dein persönliches macOS-Wörterbuch gilt also mit.

**Sprache** (Statusleiste unten rechts oder ⌥⌘L):
- **Automatisch:** Die Sprache wird pro Absatz erkannt. Überschriften übernehmen die Sprache des folgenden Absatzes. `#set text(lang: "en")` und `#text(lang: "en")[…]` im Dokument haben Vorrang. So bleibt ein gemischtes Dokument sauber.
- **Deutsch / Englisch:** prüft alles in dieser Sprache.
- **Aus**

Beim Hover über ein markiertes Wort gibt es Vorschläge sowie **Zum Wörterbuch** (macOS, gilt überall), **Nur im Projekt** (in `.neotypst-woerter.txt` im Projektordner) und **Ignorieren** (bis zum Neustart).

## Text in Formeln

Mehrbuchstabige Wörter, die Typst in einer Formel nicht kennt, setzt der Editor automatisch in Anführungszeichen. Typst setzt sie dann als aufrechten Text. Die Prüfung läuft, sobald das Wort beendet ist, etwa durch ein Leerzeichen, `=`, `+`, `_`, `)` oder das schließende `$`:

- `$ v = Strecke durch Zeit $` → `$ v = "Strecke durch Zeit" $` (aufeinanderfolgende Wörter werden zu einem Text verbunden)
- `$E_kin = 5 km$` → `$E_"kin" = 5 "km"$`
- Bekannt bleiben Symbole (`alpha`, `arrow.r`), Funktionen (`sin`, `sqrt`) und alles, was im Dokument per `let` oder `import` definiert ist.

⌘Z nimmt nur die Anführungszeichen zurück. Für Wörter, die so nicht erfasst werden, bietet die rote Unterstreichung „Als Text“ als Schnellkorrektur an. Abschalten lässt sich das in der Befehlspalette unter „Text in Formeln automatisch quoten“.

## Grafik-Bausteine (⌘⇧G)

Fertige Grafiken zum Anpassen, mit Vorschaubild:
- **Mathe:** Koordinatensystem mit Graph, leeres Koordinatensystem, Funktionsplot, Balkendiagramm, Zahlenstrahl, Baumdiagramm
- **Physik:** Messwerte mit Ausgleichsgerade, schiefe Ebene mit Kräften, Stromkreis, Vektoraddition
- **Informatik:** Flussdiagramm, Zustandsautomat

Die benötigten Pakete (cetz, lilaq, zap, fletcher) werden beim ersten Mal heruntergeladen. Ihr `#import` wird oben in der Datei ergänzt, wenn er fehlt. Eigene Bausteine sind `.typ`-Dateien in `src/graphics/` mit einem kurzen Kopf (`// label:`, `// category:`, `// description:`). Ein Test prüft, dass jeder Baustein kompiliert.

## Symbolpalette (⌘⇧S)

Alle Symbole aus Typsts `sym`-Modul, sortiert in Kategorien und mit deutschen Suchbegriffen („ungleich“, „folgt“, „Element“, „Dichte“ …). Außerdem gibt es **Strukturen** wie Bruch, Wurzel, Vektorpfeil, Ableitungspunkt, Klammer unten, Matrix oder Fallunterscheidung, mit Tab-Sprüngen.

Eingefügt wird passend zur Cursorposition: in einer Formel als `alpha`, im Text als `$alpha$`, im Code als `sym.alpha`. ⇧↩ fügt ein und lässt die Palette offen. Zuletzt benutzte Symbole stehen ganz oben.

## Tabellen-Editor (⌘T)

Ein Gitter wie in einer Tabellenkalkulation:
- **Bestehende Tabellen** werden über Typsts eigenen Parser eingelesen, inklusive Kopfzeile, Spaltenbreiten (`columns: (1fr, auto)`), Ausrichtung und weiterer Einstellungen wie `inset` oder `fill`. Diese bleiben beim Speichern erhalten.
- **Navigation:** Tab / Shift+Tab und Enter springen durch die Zellen, Tab in der letzten Zelle hängt eine Zeile an. Shift+Enter macht einen Zeilenumbruch in der Zelle, ⌘↩ übernimmt.
- **Einfügen** aus Excel, Numbers, CSV oder einer Markdown-Tabelle verteilt sich auf die Zellen, die Tabelle wächst automatisch mit.
- **Ausrichtung** pro Spalte, **Kopfzeile** ein/aus und **Linien**: Gitter, waagerecht (Buchsatz-Stil) oder keine.
- Verbundene Zellen (`table.cell(colspan: …)`) und per Code erzeugte Tabellen kann der Editor noch nicht darstellen. Er sagt dann Bescheid.

## Matrix-Editor (⌘T in einer Formel)

Steht der Cursor in einer Formel, öffnet ⌘T statt des Tabellen-Editors den Matrix-Editor. Steht er in einem `mat(…)` oder `vec(…)`, wird es eingelesen, sonst wird eine neue 3×3-Matrix eingefügt. Außerhalb von Formeln geht es über die Befehlspalette („Matrix-Editor öffnen“), die Matrix kommt dann in `$ … $`.

- **Zellen** sind Typst-Mathe (`x^2`, `1/2`, `alpha`). Tab, Enter und die Pfeiltasten springen durch das Gitter, ⌘↩ übernimmt. Zahlenblöcke aus Excel, Numbers oder Text (durch Leerzeichen, Tabs oder Kommas getrennt) verteilen sich beim Einfügen auf die Zellen.
- **Klammern:** rund, eckig, geschweift, `| |` (Determinante), `‖ ‖` (Norm) oder keine.
- **Trennstrich** für erweiterte Koeffizientenmatrizen (LGS, Gauß): das ┃ über einer Spalte setzt `augment:`.
- **Matrix oder Vektor** (`vec`), **Einheitsmatrix** per Knopf bei quadratischen Matrizen.
- Eine **Vorschau** im Dialog zeigt das Ergebnis, gesetzt von Typst. Mit „Mehrzeilig im Code“ werden die Zeilen untereinander und die Spalten bündig geschrieben.

## Lösungen (⌘⇧L)

Der Schalter „Lösungen“ oben gibt dem Dokument `sys.inputs.loesungen` mit (`"true"` oder `"false"`). Die Arbeitsblatt-Vorlage reagiert darauf:
- `#aufgabe(punkte: 2)[Aufgabe][Lösung]` zeigt den zweiten Block als Lösungskasten
- `#loesung[…]` wird sichtbar, `#platz(4cm)` (Rechenplatz) fällt weg
- im Kopf steht „LÖSUNG“

Beim Export „Aufgaben + Lösungen“ (⌘⇧E) entstehen `main.pdf` und `main-loesung.pdf`. In eigenen Dokumenten nutzt du den Schalter so:

```typst
#let loesungen = sys.inputs.at("loesungen", default: "false") == "true"
#if loesungen [Musterlösung: …]
```

## Tests

```bash
cd src-tauri && cargo test --lib
```

Die Tests prüfen unter anderem, dass jede Vorlage, jeder Grafik-Baustein, jeder Zitierstil und jede erzeugte Tabelle fehlerfrei kompiliert. Außerdem testen sie Autovervollständigung, Klick-Sprung, das Einlesen von Tabellen und Matrizen, die Erkennung von Text in Formeln und die Rechtschreibprüfung (mit dem echten macOS-Wörterbuch). Tests, die ins Netz gehen, sind mit `#[ignore]` markiert (`cargo test --lib -- --ignored`).

## Lizenz

[MIT](LICENSE): Du darfst den Code frei nutzen, verändern und weitergeben, auch kommerziell.
