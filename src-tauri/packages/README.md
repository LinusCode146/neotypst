# Mitgelieferte Typst-Pakete

Diese `@preview`-Pakete stecken in der App (`include_dir!` in `src/world.rs`) und werden beim
ersten Kompilieren in den Typst-Paket-Cache (`~/Library/Caches/typst/packages`) gelegt. So
funktionieren sie offline, auch beim ersten Gebrauch. Andere Pakete lädt NeoTypst wie gewohnt
aus dem Netz.

| Paket | Version | Lizenz | Wofür |
|---|---|---|---|
| cetz | 0.5.3, 0.5.2, 0.3.2 | LGPL-3.0-or-later | Zeichnungen, Graphen |
| cetz-plot | 0.1.1 | LGPL-3.0-or-later | Diagramme mit CeTZ |
| fletcher | 0.6.0 | MIT | Pfeil- und Flussdiagramme |
| zap | 0.6.0 | MIT | Schaltpläne |
| lilaq | 0.6.0 | MIT | Datendiagramme |
| physica | 0.9.5 | MIT | Physik-Notation |
| zero | 0.6.1 | MIT | Zahlen und Einheiten |
| equate | 0.3.1 | MIT | Gleichungsnummerierung |
| oxifmt, elembic, tiptoe, komet, suiji | | MIT / Apache-2.0 / MIT-0 | Abhängigkeiten der Pakete oben |

Die Pakete sind unverändert, nur Beispiele, Tests, Dokumentation und Bilder sind weggelassen.
Lizenztexte liegen jeweils im Paketordner.

**Ein Paket hinzufügen:** einmal in Typst benutzen, damit es im Cache liegt, dann den Ordner
`~/Library/Caches/typst/packages/preview/<name>/<version>` hierher kopieren (ohne `docs`,
`examples`, `tests`, `gallery` und Bilder) und die Abhängigkeiten aus seinen
`#import "@preview/…"`-Zeilen ebenfalls.
