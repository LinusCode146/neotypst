// label: Zustandsautomat
// category: Informatik
// description: Endlicher Automat mit Start- und Endzustand (fletcher)
#import "@preview/fletcher:0.6.0" as fletcher: diagram, node, edge

#align(center, diagram(
  node-stroke: 0.8pt,
  spacing: 4em,
  edge((-0.7, 0), (0, 0), "-|>", [Start], label-side: left),
  node((0, 0), $q_0$, radius: 1.2em),
  edge($a$, "-|>", bend: 25deg),
  node((1, 0), $q_1$, radius: 1.2em),
  edge($b$, "-|>"),
  node((2, 0), $q_2$, radius: 1.2em, extrude: (-2.5, 0)),
  edge((1, 0), (0, 0), $a$, "-|>", bend: 25deg),
  edge((0, 0), $b$, "-|>", loop: top, size: 2em),
  edge((2, 0), $a, b$, "-|>", loop: top, size: 2em),
))
