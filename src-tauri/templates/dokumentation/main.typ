#import "templates/dokumentation.typ": *

#show: dokumentation.with(
  titel: "{{titel}}",
  untertitel: "{{untertitel}}",
  autoren: ("{{name}}",),
  datum: "{{datum}}",
)

= Einleitung

Dieses Dokument beschreibt Aufbau und Funktionsweise des Projekts.

#hinweis[Code kann direkt aus Dateien im Projekt eingebunden werden:
`#raw(read("src/main.py"), lang: "python", block: true)`]

= Architektur

== Überblick

#figure(
  table(
    columns: 3,
    table.header[*Modul*][*Aufgabe*][*Sprache*],
    [`parser`], [Einlesen der Eingabe], [Rust],
    [`api`], [REST-Schnittstelle], [Python],
  ),
  caption: [Module des Systems],
)

== Algorithmus

```python
def binaere_suche(liste, ziel):
    links, rechts = 0, len(liste) - 1
    while links <= rechts:
        mitte = (links + rechts) // 2
        if liste[mitte] == ziel:
            return mitte
        if liste[mitte] < ziel:
            links = mitte + 1
        else:
            rechts = mitte - 1
    return -1
```

Die Laufzeit beträgt $cal(O)(log n)$.
