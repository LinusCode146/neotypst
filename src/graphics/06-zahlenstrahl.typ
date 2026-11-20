// label: Zahlenstrahl
// category: Mathe
// description: Zahlenstrahl mit markierten Punkten und Intervall
#import "@preview/cetz:0.5.3"

#align(center, cetz.canvas(length: 0.9cm, {
  import cetz.draw: *
  let (a, b) = (${1:-3}, ${2:5})
  line((a - 0.5, 0), (b + 0.6, 0), mark: (end: "stealth", fill: black))
  for i in range(a, b + 1) {
    line((i, -0.12), (i, 0.12))
    content((i, -0.45), text(8pt, str(i)))
  }
  // Intervall [-1; 2]
  line((-1, 0.35), (2, 0.35), stroke: 2pt + rgb("#2b50c8"))
  circle((-1, 0.35), radius: 0.09, fill: rgb("#2b50c8"), stroke: none)
  circle((2, 0.35), radius: 0.09, fill: white, stroke: 1pt + rgb("#2b50c8"))
}))
