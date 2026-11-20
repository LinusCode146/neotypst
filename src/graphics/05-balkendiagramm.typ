// label: Balkendiagramm
// category: Mathe
// description: Häufigkeiten oder Messwerte als Balken
#import "@preview/lilaq:0.6.0" as lq

#align(center, lq.diagram(
  width: 8cm,
  height: 5cm,
  xaxis: (ticks: (${1:"A", "B", "C", "D"}).enumerate()),
  ylabel: [Anzahl],
  lq.bar(range(4), (${2:5, 8, 3, 6})),
))
