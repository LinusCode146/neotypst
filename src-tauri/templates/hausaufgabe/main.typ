#import "templates/hausaufgabe.typ": *

#show: hausaufgabe.with(
  titel: "{{titel}}",
  kurs: "{{kurs}}",
  name: "{{name}}",
  datum: "{{datum}}",
)

#aufgabe[Bestimme alle Nullstellen von $f(x) = x^2 - 5x + 6$.]

Mit der $p$-$q$-Formel erhalten wir
$ x_(1,2) &= 5/2 plus.minus sqrt((5/2)^2 - 6) \
          &= 5/2 plus.minus 1/2 $
also $erg(x_1 = 2)$ und $erg(x_2 = 3)$.

#aufgabe(titel: "Grenzwert und Ableitung")[
  + Berechne $lim_(n -> oo) (1 + 1/n)^n$.
  + Leite $g(x) = x dot e^x$ ab.
]

#teil[Das ist die Definition der Eulerschen Zahl, also $erg(e)$.]
#teil[
  Mit der Produktregel:
  $ g'(x) &= 1 dot e^x + x dot e^x \
          &= erg((1 + x) e^x) $
]
