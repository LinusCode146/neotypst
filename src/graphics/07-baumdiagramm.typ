// label: Baumdiagramm
// category: Mathe
// description: Zweistufiges Zufallsexperiment mit Wahrscheinlichkeiten
#import "@preview/cetz:0.5.3"

#align(center, cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let p = ${1:0.3}
  let node(pos, body) = content(pos, box(inset: 3pt, body))
  let branch(from, to, label) = {
    line(from, to, stroke: 0.6pt)
    let mid = ((from.at(0) + to.at(0)) / 2, (from.at(1) + to.at(1)) / 2)
    content(mid, text(8pt, label), anchor: if to.at(1) > from.at(1) { "south-east" } else { "north-east" }, padding: 2pt)
  }
  circle((0, 0), radius: 0.06, fill: black)
  branch((0, 0), (2.5, 1.5), $#p$)
  branch((0, 0), (2.5, -1.5), $#(1 - p)$)
  node((2.8, 1.5), $A$)
  node((2.8, -1.5), $overline(A)$)
  for (y, s) in ((1.5, 1), (-1.5, -1)) {
    branch((3.1, y), (5.6, y + 0.8), $#p$)
    branch((3.1, y), (5.6, y - 0.8), $#(1 - p)$)
    node((5.9, y + 0.8), $A$)
    node((5.9, y - 0.8), $overline(A)$)
  }
}))
