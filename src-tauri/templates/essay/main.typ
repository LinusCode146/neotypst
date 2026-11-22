#import "templates/essay.typ": *

#show: essay.with(
  fragestellung: "{{titel}}",
  name: "{{name}}",
  kurs: "{{kurs}}",
  lehrkraft: "{{lehrkraft}}",
  datum: "{{datum}}",
)

Ein Essay beginnt ohne Überschrift mit einem Einstieg, der zur Fragestellung hinführt. Ein Beispiel, eine Beobachtung oder ein Zitat wecken Interesse und zeigen, warum die Frage überhaupt gestellt werden muss.

Jeder neue Absatz beginnt mit einem Einzug. Zwischen den Absätzen bleibt nur ein kleiner Abstand, so wirkt der Text wie gedruckt. Hervorhebungen erscheinen _kursiv_, auch wenn sie als *fett* markiert sind. Fett gesetzt wird nichts.

= Erster Gedanke

Zwischenüberschriften sind optional. Sie unterscheiden sich nur durch ihre Größe vom Text. Belege und Quellen stehen in Fußnoten.#footnote[Nachname, Vorname: Titel. Ort Jahr, S. 12.]

= Gegenposition

Ein guter Essay nimmt auch die Gegenseite ernst und wägt ab, bevor er urteilt.

= Fazit

Am Ende steht eine eigene, begründete Antwort auf die Fragestellung.
