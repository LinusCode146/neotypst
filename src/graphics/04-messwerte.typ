// label: Messwerte mit Ausgleichsgerade
// category: Physik
// description: Messpunkte mit Fehlerbalken und linearer Regression
#import "@preview/lilaq:0.6.0" as lq

#let t = (${1:0, 1, 2, 3, 4, 5})
#let s = (${2:0.1, 2.1, 3.8, 6.2, 7.9, 10.1})
// Lineare Regression s = m t + b
#let n = t.len()
#let mt = t.sum() / n
#let ms = s.sum() / n
#let m = range(n).map(i => (t.at(i) - mt) * (s.at(i) - ms)).sum() / range(n).map(i => calc.pow(t.at(i) - mt, 2)).sum()
#let b = ms - m * mt

#align(center, lq.diagram(
  width: 9cm,
  height: 6cm,
  xlabel: [$t$ in s],
  ylabel: [$s$ in m],
  legend: (position: right + bottom),
  lq.plot(t, s, yerr: 0.4, stroke: none, label: [Messwerte]),
  lq.plot((t.first(), t.last()), x => m * x + b, mark: none, label: [Ausgleichsgerade]),
))
