// label: Funktionsplot
// category: Mathe
// description: Mehrere Funktionen mit Legende (lilaq)
#import "@preview/lilaq:0.6.0" as lq

#let xs = lq.linspace(-3, 3, num: 120)
#align(center, lq.diagram(
  width: 9cm,
  height: 6cm,
  xlabel: $x$,
  ylabel: $y$,
  legend: (position: left + top),
  lq.plot(xs, x => ${1:calc.sin(x)}, mark: none, label: $sin(x)$),
  lq.plot(xs, x => ${2:calc.cos(x)}, mark: none, label: $cos(x)$),
))
