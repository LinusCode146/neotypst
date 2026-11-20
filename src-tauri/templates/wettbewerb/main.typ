#import "templates/wettbewerb.typ": *

#show: wettbewerb.with(
  wettbewerb: "{{titel}}",
  runde: "{{runde}}",
  name: "{{name}}",
  teilnehmernummer: "{{teilnehmernummer}}",
  datum: "{{datum}}",
)

#problem(1)[
  Man beweise, dass für jede natürliche Zahl $n$ die Zahl $n^3 - n$ durch $6$ teilbar ist.
]

#behauptung[$6 divides n^3 - n$ für alle $n in NN$.]

#beweis[
  Es gilt $n^3 - n = (n-1) n (n+1)$. Unter drei aufeinanderfolgenden ganzen
  Zahlen ist mindestens eine gerade und genau eine durch $3$ teilbar. Also ist
  das Produkt durch $2 dot 3 = 6$ teilbar.
]
