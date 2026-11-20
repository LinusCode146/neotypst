// label: Schiefe Ebene mit Kräften
// category: Physik
// description: Klotz auf schiefer Ebene, Gewichts-, Normal- und Hangabtriebskraft
#import "@preview/cetz:0.5.3"

#align(center, cetz.canvas(length: 1cm, {
  import cetz.draw: *
  let winkel = ${1:30}deg
  let L = 6
  let (c, s) = (calc.cos(winkel), calc.sin(winkel))
  // Ebene
  line((0, 0), (L * c, 0), (L * c, L * s), close: true, fill: luma(240), stroke: 0.8pt)
  arc((1.2, 0), start: 0deg, stop: winkel, radius: 1.2, stroke: 0.6pt)
  content((1.55, 0.28), text(9pt, $alpha$))
  // Klotz (Mittelpunkt auf der Ebene)
  let d = 3.6
  let base = (d * c, d * s)
  let n = (-s, c)
  let u = (c, s)
  let w = 1.0
  let h = 0.7
  let p(a, b) = (base.at(0) + a * u.at(0) + b * n.at(0), base.at(1) + a * u.at(1) + b * n.at(1))
  line(p(-w / 2, 0), p(w / 2, 0), p(w / 2, h), p(-w / 2, h), close: true, fill: rgb("#dfe6ff"), stroke: 0.8pt)
  let m = p(0, h / 2)
  let force(to, col, label, anchor) = {
    line(m, to, stroke: 1.4pt + col, mark: (end: "stealth", fill: col))
    content(to, text(col, label), anchor: anchor, padding: 3pt)
  }
  let g = 2.0
  force((m.at(0), m.at(1) - g), rgb("#c4314b"), $arrow(F)_G$, "north")
  force((m.at(0) + n.at(0) * g * c, m.at(1) + n.at(1) * g * c), rgb("#2f855a"), $arrow(F)_N$, "south-east")
  force((m.at(0) - u.at(0) * g * s, m.at(1) - u.at(1) * g * s), rgb("#2b50c8"), $arrow(F)_H$, "east")
}))
