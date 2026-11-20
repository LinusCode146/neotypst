// label: Vektoraddition
// category: Physik
// description: Zwei Vektoren und ihre Resultierende im Kräfteparallelogramm
#import "@preview/cetz:0.5.3"

#align(center, cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let a = (${1:3, 1})
  let b = (${2:1, 2.5})
  let r = (a.at(0) + b.at(0), a.at(1) + b.at(1))
  let vec(from, to, col, label) = {
    line(from, to, stroke: 1.4pt + col, mark: (end: "stealth", fill: col))
    content(((from.at(0) + to.at(0)) / 2, (from.at(1) + to.at(1)) / 2), text(col, label), anchor: "north-west", padding: 3pt)
  }
  line(a, r, stroke: (paint: luma(160), dash: "dashed"))
  line(b, r, stroke: (paint: luma(160), dash: "dashed"))
  vec((0, 0), a, rgb("#2b50c8"), $arrow(a)$)
  vec((0, 0), b, rgb("#2f855a"), $arrow(b)$)
  vec((0, 0), r, rgb("#c4314b"), $arrow(a) + arrow(b)$)
}))
