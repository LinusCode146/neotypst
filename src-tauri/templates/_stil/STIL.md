# Stil-Guidelines

Gilt für Mathe-, Physik- und Informatik-Dokumente: Arbeitsblätter, Hausaufgaben, Lab-Protokolle.
Das Paket `@local/stil` setzt die Regeln um. Was es nicht automatisch erledigen kann, steht hier als Schreibregel.

```typst
#import "@local/stil:0.1.0": *
#show: stil
```

Die eingebauten NeoTypst-Vorlagen (Arbeitsblatt, Hausaufgabe, Wettbewerb, Dokumentation, Leer) bauen auf demselben Stil auf. Sie legen ihn als `templates/stil.typ` ins Projekt, sodass das Projekt auch ohne das Paket kompiliert.

## 1 Grundlayout

- A4, Rand 2,2 cm links und rechts, 2 cm oben und unten
- Textschrift **New Computer Modern** 12 pt (die LaTeX-Schrift, passend zu den Formeln), Flattersatz, Zeilenabstand 0,8 em
- Formeln in **New Computer Modern Math**, gleiche Größe wie der Text
- Deutsch eingestellt: Silbentrennung, „Anführungszeichen“, Abbildung/Tabelle
- Überschriften fett, nur wenig größer als der Text (15 / 13 / 12 pt) und leicht enger gesetzt, ohne Nummern: `=` Titel des Dokuments, `==` Abschnitt, `===` Unterabschnitt
- Keine Trennlinien (`#line()`) zwischen Aufgaben. Der Aufgabenkasten trennt die Aufgaben bereits.
- Keine Zierzeichen als Trenner, also keine Mittelpunkte (·), Gedankenstriche oder Pfeile zwischen Titel und Text. Titel und Text werden durch Abstand oder einen Zeilenumbruch getrennt.

### Einstellungen

| Parameter | Standard | Beispiel |
|---|---|---|
| `akzent` | `black` | `akzent: rgb("#2b50c8")` |
| `kasten` | `luma(244)` (Hellgrau) | `kasten: rgb("#f3f1ec")` |
| `schrift` | in NeoTypst gewählte Dokumentschrift, sonst `"New Computer Modern"` | `schrift: "Charter"`, `schrift: "Libron"` |
| `groesse` | `12pt` | `groesse: 11pt` |
| `formeln` | `"New Computer Modern Math"` | |
| `rand` | `(x: 2.2cm, y: 2cm)` | `rand: 2.5cm` |

```typst
#show: stil.with(akzent: rgb("#a33b2b"), schrift: "Libron")
```

Libron wirkt bei gleicher Punktgröße sehr groß und wird deshalb automatisch auf 90 % gesetzt. Fehlt eine Schrift, nimmt Typst New Computer Modern.

## 2 Aufgaben

Die Aufgabenstellung steht in einem hell hinterlegten Kasten, die Lösung folgt ohne Kasten darunter.
Der Kasten ist neutral hellgrau, der Kopf „Aufgabe N“ fett. Standardmäßig ist alles schwarz-grau. Mit `akzent:` lassen sich der Aufgabenkopf und die Teilaufgaben-Buchstaben einfärben, der Kasten bleibt grau. Aufzählungen mit `+` in der Aufgabenstellung werden als a), b) nummeriert.

```typst
#aufgabe[Wie hoch ist die Gewinnwahrscheinlichkeit?]
#aufgabe(titel: "Annas Wette")[…]      // Thema neben der Nummer
#aufgabe(nr: "3.12")[…]                // Nummer aus dem Buch, zählt nicht mit
#aufgabe(nr: none)[…]                  // nur „Aufgabe“, ohne Nummer, zählt nicht mit
#aufgabe(punkte: 4)[…]                 // Punkte rechts im Kopf
#aufgabe[#image("aufgabe3.png")]       // Screenshot als Aufgabe
```

Regeln:

- Eine Aufgabe = ein `#aufgabe`. Die Nummer zählt automatisch.
- Die Lösung beginnt direkt unter dem Kasten. Sie bekommt keine eigene Überschrift wie „Lösung“ oder „Musterlösung“.
- Screenshots von Aufgaben gehören in den Kasten, nicht in `#figure`. Sie brauchen keine Bildunterschrift.

## 3 Teilaufgaben

Der Buchstabe steht fett links (in der Akzentfarbe, standardmäßig schwarz), der Inhalt bündig daneben.
Die Buchstaben zählen pro Aufgabe ab a). In der Lösung beginnen sie wieder bei a), auch wenn die Aufgabenstellung selbst schon Teilaufgaben enthält.

```typst
#teil[$T(7) = 5202$]
#teil[
  Bei jedem Versuch ist die Wahrscheinlichkeit gleich, also
  $ P(X<4) = 3 dot 1/10 = erg(0,3) $
]
#teil("d")[…]                          // Buchstabe selbst festlegen
```

Regeln:

- Teilaufgaben nicht als Überschrift (`=== a)`) und nicht als Text „a)“ schreiben, sondern immer mit `#teil`.
- Besteht eine Teilaufgabe nur aus einer Formel, steht der Buchstabe mittig daneben. Andernfalls steht er auf Höhe der ersten Zeile.
- Mehrere Teilergebnisse nicht in eine Formelzeile mit `quad` quetschen (`a) => … quad b) => …`). Jede Teilaufgabe bekommt ihr eigenes `#teil`.

## 4 Rechnungen

Mehrschrittige Rechnungen stehen untereinander, ausgerichtet am Gleichheitszeichen (`&=`, `&approx`).
Das Endergebnis wird doppelt unterstrichen.

```typst
$ p &= (1/2)^3 = 1/8 \
  P(X<6) &= sum_(k=1)^5 (7/8)^(k-1) dot 1/8 \
         &approx erg(0,4871) $
```

Regeln:

- **Ein Schritt pro Zeile.** Eine neue Zeile beginnt mit `&=` oder `&approx`, nicht mit `=>`.
- `=>` nur für echte Folgerungen zwischen Aussagen, nicht als „ergibt“.
- **Nur das Endergebnis** wird mit `erg(…)` markiert. Zwischenergebnisse bleiben unmarkiert.
- Gerundete Ergebnisse mit `approx`, nicht mit `=`.
- Bei Textaufgaben folgt nach der Rechnung ein Antwortsatz: `#antwort[Anna gewinnt mit etwa 48,7 % Wahrscheinlichkeit.]`
- Bedingungen oder Definitionen hinter einer Formel mit `quad` absetzen: `P(X=k) = (1-p)^(k-1) dot p, quad k in NN`.
- Keine Semikolons als Trenner in Formeln (`p = 0,1 ; P(…)`). Entweder zwei Zeilen oder `quad`.

### Zahlen und Einheiten

- **Dezimalkomma:** einfach `0,4871` schreiben. Das Paket entfernt den Abstand, den Typst sonst nach dem Komma setzt. Bei `f(x, y)` bleibt der Abstand erhalten.
- **Ausnahme:** In Funktionsargumenten trennt Typst an jedem Komma. `erg(0,4871)` setzt die Zahl wieder zusammen. Bei anderen Funktionen wie `sqrt(…)` die Zahl in Anführungszeichen schreiben, etwa `sqrt("2,25")`, oder `2.25` verwenden.
- Prozent mit Leerzeichen: `48,7 %`
- **Einheiten** direkt hinter die Zahl schreiben, ohne Anführungszeichen: `100 km/h`, `3,5 m/s^2`, `9,81 N/kg`, `20 °C`, `47 Ohm`, `2 kWh`, `5 N m`. Der Stil erkennt sie, setzt sie aufrecht und mit schmalem Abstand. Brüche aus Einheiten werden zu km/h in einer Zeile.
  - Erkannt wird nur direkt nach einer Zahl. Ohne Zahl davor bleibt es Formel: `v = s/t` hat kursive Variablen.
  - Einbuchstabige Einheiten: m, s, g, h, l, L, t, N, V, A, W, J, K, C, F, T, H, S, Ω, °.
  - Mehrbuchstabige sind vordefiniert: km, dm, cm, mm, nm, kg, mg, ms, ns, ml, mL, Hz, kHz, MHz, GHz, kN, kJ, MJ, kW, MW, mW, Wh, kWh, mA, kV, mV, Pa, hPa, kPa, mol, eV, keV, MeV, Ohm (Ω), kOhm, MOhm, dB, rad, Bq, Wb, lx, lm.
  - Was fehlt oder mit Typst-Namen kollidiert (min, bar, kcal …), in Anführungszeichen: `10 "min"`. Das funktioniert für jede Einheit.
  - Zwischen Zahl und einbuchstabiger Einheit steht ein Leerzeichen: `8 s` ist eine Zeit, `2s` bleibt das Produkt 2 mal s. Produkte mit Variablen deshalb ohne Leerzeichen schreiben: `2m a`, `(2s)/g`.
- Text in Formeln aufrecht in Anführungszeichen: `P("Mädchen")`, nicht `P(Mädchen)`.
- Große Zahlen mit schmalem Abstand in Dreiergruppen: `139 thin 838`

## 5 Fließtext

- Erklärungen in ganzen Sätzen, nicht nur Formeln aneinanderreihen.
- Variablen im Text immer in `$…$`: „beim $k$-ten Versuch“, nicht „beim k-ten Versuch“.
- Eine Formel, die einen Satz abschließt, als abgesetzte Formel `$ … $`. Der Satz davor endet mit Doppelpunkt.
- Hervorhebungen sparsam: `*fett*` für Begriffe, die definiert werden, `_kursiv_` für Betonung. Ganze Ergebnisse nicht fett setzen, dafür gibt es `erg`.
- Für einzelne Wörter in Akzentfarbe: `#betont[…]` (nur sinnvoll, wenn eine Akzentfarbe gesetzt ist).

## 6 Code, Tabellen, Abbildungen

- Code in ` ```python … ``` ` erscheint grau hinterlegt in Menlo.
- Tabellen mit dünnen grauen Linien; Kopfzeile über `table.header[*…*]`.
- Abbildungen mit `#figure(…, caption: [...])`, wenn im Text auf sie verwiesen wird. Sonst reicht `#image(…)`.

## 6 Profil „akademisch“

Eine Alternative zum klassischen Stil. Grundlage sind Übungsblätter und Lösungen von Universitäten, die Lösungshefte von Bundeswettbewerb Mathematik und Bundeswettbewerb Informatik, Formatvorgaben für wissenschaftliche Arbeiten, die Normen DIN 1338 und ISO 80000-2 sowie KOMA-Script und Bringhurst.

```typst
#show: stil.with(profil: "akademisch")
#show: hausaufgabe.with(profil: "akademisch", …)   // alle Vorlagen kennen profil
```

Alle Bausteine bleiben gleich: `aufgabe`, `teil`, `erg`, `antwort`, ausgerichtete Rechnungen, Dezimalkomma und Einheiten. Es ändert sich nur das Aussehen.

| | klassisch | akademisch | Grund |
|---|---|---|---|
| Schriftgröße | 12 pt | 11 pt | LaTeX-Standard für Skripte und Übungsblätter, Fließtext 10–12 pt |
| Satzspiegel | Rand 2,2 / 2 cm | Rand 3,2 cm seitlich, 2,7 / 3,2 cm oben/unten | KOMA-Script DIV 10 bei 11 pt, kürzere Zeilen |
| Satz | Flattersatz | Blocksatz mit Silbentrennung | Standard in Uni-Vorgaben und Lösungsheften |
| Zeilenabstand | etwa 150 % | etwa 130 % | Butterick: 120–145 %; 150 % ist eine Schreibmaschinen-Konvention |
| Absätze | 1,3 em Abstand | halbe Leerzeile | KOMA `parskip=half`, in Deutschland üblich |
| Aufgabe | grauer Kasten, Kopf fett | Kopfzeile, Stellung zwischen zwei feinen Linien, „(4 Punkte)“ | Grauflächen drucken und kopieren schlecht; Uni-Blätter und Lösungshefte trennen mit Linien |
| Teilaufgabe | **a)** fett | (a) normal | LaTeX-Aufzählung, wie auf Übungsblättern |
| Eulersche Zahl | kursiv | aufrecht: e, eˣ | DIN 1338 Tab. 1, ISO 80000-2 (Konstanten mit fester Bedeutung) |
| Tabellen | Gitter | Linien nur oben, unter dem Kopf, unten; Unterschrift oben | Buchsatz (booktabs), Tabellenunterschrift über der Tabelle |
| Abbildungsunterschrift | Tabelle 1: … | **Tabelle 1:** … | Fachartikel |
| Quelltext | grau hinterlegt | ohne Fläche und Linien, nur Abstand | LaTeX `listings` ohne Rahmen |
| Zitate | Typst-Standard | eingerückt, kleiner, ohne Anführungszeichen | Chicago ab fünf Zeilen, deutsche Uni-Vorgaben oft ab drei |
| Seitenzahl | nur in Vorlagen | unten mittig | LaTeX `plain` |

Zusätzliche Schreibregeln für dieses Profil:

- Differential mit `dif`: `integral_0^1 f(x) dif x` setzt d aufrecht mit passendem Abstand (ISO 80000-2).
- `e_1` bleibt kursiv, weil es ein Name ist (Einheitsvektor). Nur e allein und eˣ werden aufrecht.
- Beweise wie im Lösungsheft gliedern: Voraussetzung, Behauptung, Beweis, jeweils in ganzen Sätzen.
- Dokumentationen für den Bundeswettbewerb Informatik: Abschnitte Lösungsidee, Umsetzung, Beispiele, Quellcode. Vom Quellcode nur die wichtigen Teile, etwa 2–3 Seiten.
- Abschnittsnummern nach DIN 1421 ohne Schlusspunkt (1, 1.1, 1.2). Die Vorlage Dokumentation macht das schon. Für Übungsblätter bleiben Überschriften ohne Nummer.

Bewusst nicht übernommen:

- 1,5-facher Zeilenabstand und Times 12 pt aus Uni-Formatvorgaben. Diese Werte stammen aus der Zeit von Word und Schreibmaschine. Bei gesetztem Text mit Formeln wirken sie lose.
- Ein eigenes „Lösung:“ unter jeder Aufgabe. Viele Musterlösungen schreiben es hin, hier trennt schon die Linie unter der Aufgabenstellung.
- Doppelte Unterstreichung ersetzen. An der Uni ist sie unüblich, sie bleibt aber, weil `erg` ein Baustein dieses Stils ist.

### Profil „schlicht“

Wie „akademisch“, nur ohne die beiden feinen Linien über und unter der Aufgabenstellung. Alles andere bleibt gleich: 11 pt, Satzspiegel, Blocksatz, (a), aufrechtes e, Tabellen im Buchsatz-Stil.

```typst
#show: stil.with(profil: "schlicht")
#show: hausaufgabe.with(profil: "schlicht", …)
```

