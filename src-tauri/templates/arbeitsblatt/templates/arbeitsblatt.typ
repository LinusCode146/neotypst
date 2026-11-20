// Arbeitsblatt-Bausteine
// Lösungen werden über den Schalter „Lösungen“ im Editor ein- und
// ausgeblendet (sys.inputs.loesungen).

#let loesungen = sys.inputs.at("loesungen", default: "false") == "true"
#let akzent = rgb("#2b50c8")
#let grau = luma(120)

#let _aufgabe = counter("aufgabe")
#let _punkte = state("punkte", 0)

/// Seitenlayout für ein Arbeitsblatt.
#let arbeitsblatt(
  titel: "",
  fach: "",
  klasse: "",
  datum: "",
  namensfeld: true,
  body,
) = {
  set document(title: titel)
  set page(
    paper: "a4",
    margin: (x: 2cm, top: 2.2cm, bottom: 2cm),
    footer: context {
      set text(8pt, fill: grau)
      h(1fr)
      [Seite #counter(page).display() von #counter(page).final().first()]
      h(1fr)
    },
  )
  set text(lang: "de", size: 11pt)
  set par(justify: true)
  set enum(numbering: "a)")
  show heading.where(level: 1): set text(size: 13pt, fill: akzent)
  show heading: set block(above: 1.6em, below: 0.8em)

  grid(
    columns: (1fr, auto),
    align: (left + bottom, right + bottom),
    {
      set text(9pt, fill: grau)
      fach
      if klasse != "" [ · Klasse #klasse]
      linebreak()
      text(18pt, weight: "bold", fill: black, titel)
    },
    {
      if loesungen {
        box(fill: akzent, inset: (x: 5pt, y: 3pt), radius: 2pt,
          text(8pt, weight: "bold", fill: white)[LÖSUNG])
        h(6pt)
      }
      text(9pt, fill: grau, datum)
    },
  )
  v(-6pt)
  line(length: 100%, stroke: 0.8pt + akzent)
  if namensfeld {
    set text(10pt)
    [Name: #box(width: 6.5cm, repeat[.#h(1pt)])]
    h(1fr)
    context {
      let summe = _punkte.final()
      if summe > 0 [Punkte: #box(width: 1.2cm, repeat[.#h(1pt)]) / #summe]
    }
    v(0.6em)
  }
  body
}

/// Eine Aufgabe. Optional mit Lösung als zweitem Inhaltsblock:
/// `#aufgabe(punkte: 3)[Aufgabe][Lösung]`
#let aufgabe(punkte: none, titel: none, body, ..loesung) = {
  _aufgabe.step()
  if punkte != none { _punkte.update(p => p + punkte) }
  block(above: 1.5em, below: 0.9em, width: 100%, breakable: true, {
    text(weight: "bold", fill: akzent)[Aufgabe #context _aufgabe.display()]
    if titel != none {
      h(0.5em)
      text(weight: "bold", titel)
    }
    if punkte != none {
      h(1fr)
      text(9pt, fill: grau)[#punkte P.]
    }
    parbreak()
    body
  })
  let l = loesung.pos()
  if loesungen and l.len() > 0 {
    block(
      width: 100%,
      inset: (x: 10pt, y: 8pt),
      fill: akzent.lighten(93%),
      stroke: (left: 2pt + akzent),
      {
        text(8pt, weight: "bold", fill: akzent)[LÖSUNG]
        parbreak()
        l.first()
      },
    )
  }
}

/// Inhalt, der nur in der Lösungsversion erscheint.
#let loesung(body) = if loesungen { text(fill: akzent, body) }

/// Platz zum Rechnen. art: "karo", "linien" oder "leer".
/// In der Lösungsversion wird kein Platz gelassen.
#let platz(hoehe, art: "karo") = {
  if loesungen { return }
  let farbe = luma(205)
  if art == "karo" {
    let r = 5mm
    block(width: 100%, height: hoehe, stroke: 0.4pt + farbe, fill: tiling(size: (r, r), {
      place(line(start: (0pt, 0pt), end: (r, 0pt), stroke: 0.3pt + farbe))
      place(line(start: (0pt, 0pt), end: (0pt, r), stroke: 0.3pt + farbe))
    }))
  } else if art == "linien" {
    let r = 8mm
    block(width: 100%, height: hoehe, fill: tiling(size: (1cm, r), {
      place(bottom, line(length: 1cm, stroke: 0.4pt + farbe))
    }))
  } else {
    v(hoehe)
  }
}

/// Hinweis- bzw. Merkkasten.
#let merke(titel: "Merke", body) = block(
  width: 100%,
  inset: 10pt,
  radius: 3pt,
  stroke: 0.6pt + akzent,
  {
    text(9pt, weight: "bold", fill: akzent, titel)
    parbreak()
    body
  },
)
