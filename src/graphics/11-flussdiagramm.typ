// label: Flussdiagramm
// category: Informatik
// description: Programmablauf mit Verzweigung (fletcher)
#import "@preview/fletcher:0.6.0" as fletcher: diagram, node, edge

#align(center, diagram(
  node-stroke: 0.8pt,
  spacing: (1.6em, 2.2em),
  node((0, 0), [${1:Start}], corner-radius: 8pt),
  edge("-|>"),
  node((0, 1), [Zahl $n$ einlesen], shape: "parallelogram"),
  edge("-|>"),
  node((0, 2), [$n > 0$?], shape: "diamond"),
  edge("r", "-|>", [ja]),
  node((1, 2), [„positiv“ ausgeben]),
  edge((0, 2), (0, 3), "-|>", [nein], label-side: left),
  node((0, 3), [„nicht positiv“ ausgeben]),
  edge("-|>"),
  node((0, 4), [Ende], corner-radius: 8pt),
  edge((1, 2), (1, 4), (0, 4), "-|>"),
))
