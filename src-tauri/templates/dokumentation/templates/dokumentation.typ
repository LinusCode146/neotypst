// Technische Dokumentation (z. B. für Informatik-Projekte), aufgebaut auf stil.typ.

#import "stil.typ": *

#let grau = luma(110)

#let dokumentation(
  titel: "",
  untertitel: "",
  autoren: (),
  datum: "",
  inhaltsverzeichnis: true,
  akzent: black,
  body,
) = {
  show: stil.with(akzent: akzent, rand: (x: 2.5cm, y: 2.5cm))
  set document(title: titel, author: autoren)
  set heading(numbering: "1.1")

  // Deckblatt
  page(margin: 3cm, header: none, footer: none, {
    v(25%)
    text(28pt, weight: "bold", titel)
    if untertitel != "" {
      v(0.4em)
      text(15pt, fill: grau, untertitel)
    }
    v(1.2em)
    line(length: 4cm, stroke: 0.8pt + black)
    v(1fr)
    text(12pt, autoren.join(", "))
    linebreak()
    text(11pt, fill: grau, datum)
  })

  set page(
    header: context {
      set text(9pt, fill: grau)
      titel
      h(1fr)
      // Kapitel, das auf dieser Seite beginnt, sonst das zuletzt begonnene.
      let seite = here().page()
      let hier = query(heading.where(level: 1)).filter(h => h.location().page() == seite)
      let davor = query(selector(heading.where(level: 1)).before(here()))
      if hier.len() > 0 { hier.first().body } else if davor.len() > 0 { davor.last().body }
    },
    footer: context { set text(9pt, fill: grau); h(1fr); counter(page).display() },
  )
  counter(page).update(1)

  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    v(0.6em)
    it
    v(0.2em)
  }

  show raw.where(block: false): box.with(fill: luma(242), inset: (x: 3pt, y: 0pt), outset: (y: 3pt), radius: 2pt)
  show link: underline

  if inhaltsverzeichnis {
    outline(title: "Inhaltsverzeichnis", depth: 2)
  }
  body
}

/// Kasten für Hinweise, Warnungen etc.: grau hinterlegt, Titel fett.
#let hinweis(titel: "Hinweis", body) = context block(
  width: 100%,
  inset: (x: 11pt, y: 9pt),
  radius: 2pt,
  fill: _kasten.get().last(),
  above: 1.2em,
  below: 1.2em,
)[
  #text(weight: "bold", titel)
  #v(0.4em, weak: true)
  #body
]
