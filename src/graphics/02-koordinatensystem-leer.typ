// label: Leeres Koordinatensystem
// category: Mathe
// description: Zum Einzeichnen – Achsen, Skala und Karo
#import "@preview/cetz:0.5.3"

#align(center, cetz.canvas(length: 0.7cm, {
  import cetz.draw: *
  let (xmin, xmax, ymin, ymax) = (${1:-5}, ${2:5}, ${3:-4}, ${4:4})
  grid((xmin, ymin), (xmax, ymax), step: 0.5, stroke: 0.3pt + luma(215))
  line((xmin - 0.3, 0), (xmax + 0.4, 0), mark: (end: "stealth", fill: black))
  line((0, ymin - 0.3), (0, ymax + 0.4), mark: (end: "stealth", fill: black))
  content((xmax + 0.4, -0.35), $x$)
  content((-0.35, ymax + 0.4), $y$)
  for i in range(xmin, xmax + 1) {
    if i != 0 { line((i, -0.08), (i, 0.08)); content((i, -0.4), text(7pt, str(i))) }
  }
  for i in range(ymin, ymax + 1) {
    if i != 0 { line((-0.08, i), (0.08, i)); content((-0.4, i), text(7pt, str(i))) }
  }
}))
