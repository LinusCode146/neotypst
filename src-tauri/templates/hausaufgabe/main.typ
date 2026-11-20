#import "templates/hausaufgabe.typ": *

#show: hausaufgabe.with(
  titel: "{{titel}}",
  kurs: "{{kurs}}",
  name: "{{name}}",
  datum: "{{datum}}",
)

#aufgabe[Bestimme alle Nullstellen von $f(x) = x^2 - 5x + 6$.]

Mit der $p$-$q$-Formel erhalten wir
$ x_(1,2) = 5/2 plus.minus sqrt((5/2)^2 - 6) = 5/2 plus.minus 1/2 . $

Also #ergebnis[$x_1 = 2, x_2 = 3$].

#aufgabe(titel: "Grenzwert")[Berechne $lim_(n -> oo) (1 + 1/n)^n$.]

Dies ist die Definition der Eulerschen Zahl, also #ergebnis[$e$].
