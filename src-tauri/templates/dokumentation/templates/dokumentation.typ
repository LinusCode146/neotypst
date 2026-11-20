// Technische Dokumentation (z. B. für Informatik-Projekte).

#let akzent = rgb("#2b50c8")
#let grau = luma(110)

#let dokumentation(
  titel: "",
  untertitel: "",
  autoren: (),
  datum: "",
  inhaltsverzeichnis: true,
  body,
) = {
  set document(title: titel, author: autoren)
  set text(lang: "de", size: 11pt)
  set par(justify: true, leading: 0.7em)
  set heading(numbering: "1.1")

  // Deckblatt
  page(margin: 3cm, {
    v(25%)
    text(26pt, weight: "bold", titel)
    if untertitel != "" {
      v(0.4em)
      text(14pt, fill: grau, untertitel)
    }
    v(1.5em)
    line(length: 4cm, stroke: 2pt + akzent)
    v(1fr)
    text(11pt, autoren.join(", "))
    linebreak()
    text(10pt, fill: grau, datum)
  })

  set page(
    paper: "a4",
    margin: (x: 2.5cm, y: 2.5cm),
    header: context {
      set text(8pt, fill: grau)
      titel
      h(1fr)
      let h = query(selector(heading.where(level: 1)).before(here()))
      if h.len() > 0 { h.last().body }
    },
    footer: context { set text(8pt, fill: grau); h(1fr); counter(page).display() },
  )
  counter(page).update(1)

  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    v(1em)
    set text(18pt)
    it
    v(0.4em)
  }

  // Code
  show raw.where(block: true): it => block(
    width: 100%,
    inset: 10pt,
    radius: 4pt,
    fill: luma(246),
    stroke: 0.5pt + luma(220),
    text(9.5pt, it),
  )
  show raw.where(block: false): box.with(fill: luma(242), inset: (x: 3pt, y: 0pt), outset: (y: 3pt), radius: 2pt)

  show figure.caption: set text(9pt)
  show link: set text(fill: akzent)

  if inhaltsverzeichnis {
    outline(title: "Inhaltsverzeichnis", depth: 2)
  }
  body
}

/// Kasten für Hinweise, Warnungen etc.
#let hinweis(titel: "Hinweis", farbe: akzent, body) = block(
  width: 100%,
  inset: 10pt,
  radius: 3pt,
  fill: farbe.lighten(92%),
  stroke: (left: 2.5pt + farbe),
  [#text(weight: "bold", fill: farbe, titel) \ #body],
)
