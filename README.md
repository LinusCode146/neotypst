# NeoTypst

Ein Typst-Editor für macOS und Windows, gemacht für Arbeitsblätter in Mathe und Physik, Hausaufgaben, Wettbewerbe und Informatik-Dokumentationen.

Tauri 2 · React · CodeMirror 6 · Typst 0.15 (direkt eingebunden, keine CLI und kein Language Server nötig)

## Funktionen im Überblick

- **Live-Vorschau** wie in der Typst-Web-App, Klick in die Vorschau springt zum Code, Trackpad-Pinch zum Zoomen
- **Vorlagen** mit Formular: Arbeitsblatt (mit Lösungsversion), Hausaufgabe, Wettbewerb, Dokumentation, Essay, leer, dazu eigene Vorlagen
- **Offline:** Compiler, Vorschau, Schriften, Rechtschreibung und die gängigen Pakete (CeTZ, Fletcher, Lilaq, Physica, Zero, Zap …) stecken in der App. Ins Netz geht NeoTypst nur für andere Pakete beim ersten Gebrauch, für die Literatursuche per DOI/ISBN und für die Update-Prüfung
- **Einheitlicher Stil** für alle Vorlagen: Aufgaben, Teilaufgaben, doppelt unterstrichene Ergebnisse, Dezimalkomma ohne Abstand, Einheiten ohne Anführungszeichen (`$100 km/h$`)
- **Bausteine** per Abkürzung + Tab, **Befehlspalette** (⌘K), **Vim-Modus**, Autovervollständigung von Typst selbst
- **Tabellen-Editor** und **Matrix-Editor** als Gitter, die bestehende Tabellen und Matrizen einlesen
- **Formeln:** Hervorhebung, unbekannter Text wird automatisch zu `"Text"`, Symbolpalette mit deutschen Suchbegriffen
- **Grafik-Bausteine** (Koordinatensystem, Plots, Kräfte, Stromkreis, Flussdiagramm …)
- **Rechtschreibung** Deutsch/Englisch, pro Absatz automatisch erkannt
- **Literatur** per DOI/ISBN, Zitieren, Zitierstile
- **PDF-Export**, auf Wunsch Schüler- und Lösungsversion in einem Schritt
- **Screenshots einfügen** mit ⌘V, **Suchen & Ersetzen im ganzen Projekt**, **Formatieren** per Tastendruck
- **Automatische Updates** aus den GitHub-Releases

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
| ⌘⇧F | Im ganzen Projekt suchen und ersetzen |
| ⌥⇧F | Formatieren (Auswahl, sonst die ganze Datei) |
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
| ⌘V mit Bild | Speichert es in `assets/` und fügt eine Abbildung ein (siehe unten) |
| `$` | Setzt `$$` mit dem Cursor dazwischen |
| Leerzeichen zwischen `$$` | `$ \| $`, also eine abgesetzte Formel; ⌫ macht es rückgängig |

Der **Vim-Modus** lässt sich in der Befehlspalette (⌘K → „Vim-Modus einschalten“) aktivieren, `:w` speichert.

## Bilder einfügen (⌘V)

Liegt ein Bild in der Zwischenablage, legt ⌘V es in `assets/` ab und fügt `#figure(image(…), caption: […])` ein. Das gilt für einen Screenshot (⌘⇧⌃4), ein im Browser kopiertes Bild oder eine im Finder kopierte Bilddatei. Bilder ohne echten Namen heißen `bild-1.png`, `bild-2.png` …, sonst bleibt der Dateiname. Der Pfad wird relativ zur aktuellen Datei geschrieben, funktioniert also auch in Unterordnern. Wer aus Numbers oder Excel kopiert, bekommt wie gewohnt den Text, nicht das mitkopierte Bild der Zellen.

## Suchen & Ersetzen im Projekt (⌘⇧F)

Die Seitenleiste zeigt alle Treffer in `.typ`-, `.bib`-, `.csv`- und Textdateien, nach Datei gruppiert (`out/` ausgenommen). Markierter Text wird als Suchbegriff übernommen.

- **Optionen:** `Aa` Groß-/Kleinschreibung, `W` nur ganze Wörter, `.*` regulärer Ausdruck (im Ersetzen-Feld dann `$1` für Gruppen)
- **↩ / ⇧↩** springen zum nächsten / vorherigen Treffer, ein Klick öffnet die Stelle
- **Ersetzen:** Der Pfeil links blendet das Ersetzen-Feld ein, die Treffer zeigen dann eine Vorschau. Ersetzen geht einzeln, pro Datei oder mit „Alle“ (⌘↩). „Rückgängig“ in der Meldung stellt alle betroffenen Dateien wieder her.
- Esc schließt die Suche, der Dateibaum ist dann wieder da.

## Formatieren (⌥⇧F)

Räumt den Typst-Code auf: Einrückung, Abstände um `=` und nach Kommas, lange Funktionsaufrufe auf mehrere Zeilen. Fließtext wird nicht umgebrochen. Mit Auswahl wird nur der kleinste vollständige Ausdruck darum formatiert. Die Arbeit macht [typstyle](https://github.com/typstyle-rs/typstyle), eingebunden wie Typst selbst. Geändert werden nur die betroffenen Zeilen, der Cursor bleibt also, wo er war, und ⌘Z nimmt alles in einem Schritt zurück. Bei Syntaxfehlern im Dokument wird nicht formatiert.

## Bausteine (Abkürzung + Tab)

| Abkürzung | Ergebnis |
|---|---|
| `tbl3x4` | Tabelle mit 3 Zeilen (inkl. Kopfzeile) × 4 Spalten, Tab springt von Zelle zu Zelle |
| `mat2x3` | Matrix 2 × 3 |
| `grid3` | drei Spalten nebeneinander |
| `aufgabe`, `aufgabet`, `teil`, `teile`, `erg`, `antwort`, `aufgabel`, `platz`, `merke`, `loesung` | Aufgaben und Arbeitsblatt |
| `eq`, `ali`, `frac`, `vec`, `cases`, `int`, `sum`, `lim`, `abl`, `einheit` | Mathe |
| `fig`, `figt` | Abbildung / Tabelle mit Beschriftung |
| `code`, `codefile`, `hinweis` | Informatik |
| `wertetabelle`, `tblcsv` | Wertetabelle / Tabelle aus CSV |

In der Vorschlagsliste wählen Ctrl-J/Ctrl-K (wie in Vim), Ctrl-N/Ctrl-P oder ↑/↓ einen Eintrag, Tab oder ↩ übernimmt ihn, Esc schließt die Liste. Ctrl-Leertaste öffnet sie von Hand.

Alle Bausteine findest du auch in der Befehlspalette, z. B. „tabelle 3x4“.

## Vorlagen

Beim Anlegen fragt ein kurzes Formular die Felder der Vorlage ab (Titel, Fach, Klasse, Name, Datum …). Felder mit „gemerkt“ werden fürs nächste Projekt vorausgefüllt. Die Vorschaubilder sind die echte erste Seite, gerendert mit Typst.

Alle eingebauten Vorlagen bauen auf `stil.typ` auf (Quelle: `src-tauri/templates/_stil/`). Die Datei landet als `templates/stil.typ` in jedem neuen Projekt, die Regeln stehen in `src-tauri/templates/_stil/STIL.md`:

```typst
#aufgabe(titel: "Freier Fall", punkte: 3)[Ein Stein fällt aus $20 m$ Höhe …]
#teil[$ t = sqrt((2s)/g) approx erg(2,02 s) $]
#antwort[Der Fall dauert etwa 2 s.]
```

Die Essay-Vorlage nutzt nur die Grundschrift: Deckblatt mit Fragestellung und Angaben, danach Text im Blocksatz, ohne Fettdruck und ohne Farbe.

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

## Updates

Etwa vier Sekunden nach dem Start fragt NeoTypst bei GitHub nach einer neuen Version. Gibt es eine, erscheint unten rechts eine Karte mit „Installieren“. Danach startet „Jetzt neu starten“ die neue Version, offene Dateien werden vorher gespeichert. Von Hand geht es über ⌘K → „Nach Updates suchen“. Im Entwicklungsmodus wird nicht automatisch gesucht.

Die Update-Pakete sind mit einem eigenen Schlüssel signiert. Die App installiert nur Pakete, die zum öffentlichen Schlüssel in `tauri.conf.json` passen.

### Ein Release veröffentlichen

1. Version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` und `package.json` erhöhen
2. Release-Notizen nach `release-notes/vX.Y.Z.md` schreiben (sie erscheinen auch in der Update-Karte)
3. Änderungen über einen Pull Request nach main bringen und warten, bis die CI grün ist.
4. `scripts/release.sh` ausführen. Das Skript baut die App getrennt für Apple Silicon und Intel, signiert die Update-Pakete mit `~/.tauri/neotypst.key` und lädt je ein DMG und ein Update-Paket sowie `latest.json` als GitHub-Release hoch.
5. Sobald das Release veröffentlicht ist, baut der Workflow `.github/workflows/windows.yml` auf GitHub den Windows-Installer, hängt `NeoTypst_X.Y.Z_Windows-Setup.exe` an das Release und trägt Windows in `latest.json` ein. Dafür braucht das Repository das Secret `TAURI_SIGNING_PRIVATE_KEY` mit dem Inhalt von `~/.tauri/neotypst.key`. Unter Actions → Windows → „Run workflow“ gibt es einen Test-Build ohne Release.

Der private Schlüssel `~/.tauri/neotypst.key` gehört nicht ins Repository. Geht er verloren, können bestehende Installationen keine Updates mehr annehmen. Bewahre also eine Sicherungskopie auf, etwa im Passwortmanager.

## Tests

```bash
npm test                          # Oberfläche (Vitest)
cd src-tauri && cargo test --lib  # Rust
```

Beides läuft auch automatisch auf GitHub (`.github/workflows/ci.yml`), bei jedem Pull Request und jedem Push auf main, unter macOS und Windows. `scripts/release.sh` veröffentlicht nur einen Stand, der auf `origin/main` liegt und für den diese CI grün ist.

Die Tests prüfen unter anderem, dass jede Vorlage, jeder Grafik-Baustein, jeder Zitierstil und jede erzeugte Tabelle fehlerfrei kompiliert. Außerdem testen sie Autovervollständigung, Klick-Sprung, das Einlesen von Tabellen und Matrizen, die Erkennung von Text in Formeln, das Formatieren, die Namen eingefügter Bilder und die Rechtschreibprüfung (mit dem echten macOS-Wörterbuch). Tests, die ins Netz gehen, sind mit `#[ignore]` markiert (`cargo test --lib -- --ignored`).

## Lizenz

[MIT](LICENSE): Du darfst den Code frei nutzen, verändern und weitergeben, auch kommerziell.
