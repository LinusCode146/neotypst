// Hausaufgaben-Abgabe: Aufgabenstellung grau, darunter deine Lösung.

#let akzent = rgb("#2b50c8")
#let grau = luma(110)
#let _nr = counter("aufgabe")

#let hausaufgabe(titel: "", kurs: "", name: "", datum: "", body) = {
  set document(title: titel, author: name)
  set page(
    paper: "a4",
    margin: (x: 2.2cm, y: 2.2cm),
    header: context if counter(page).get().first() > 1 {
      set text(8pt, fill: grau)
      [#name #h(1fr) #titel]
    },
    footer: context {
      set text(8pt, fill: grau)
      h(1fr)
      counter(page).display("1 / 1", both: true)
    },
  )
  set text(lang: "de", size: 11pt)
  set par(justify: true)
  set enum(numbering: "(a)")
  set math.equation(numbering: none)

  grid(
    columns: (1fr, auto),
    row-gutter: 4pt,
    text(18pt, weight: "bold", titel), align(right, text(10pt, name)),
    text(10pt, fill: grau, kurs), align(right, text(10pt, fill: grau, datum)),
  )
  line(length: 100%, stroke: 0.6pt + grau)
  body
}

/// `#aufgabe[Aufgabenstellung]` — danach folgt einfach deine Lösung.
#let aufgabe(titel: none, stellung) = {
  _nr.step()
  block(above: 1.8em, below: 1em, width: 100%, {
    text(weight: "bold", fill: akzent)[Aufgabe #context _nr.display()]
    if titel != none [ — #titel]
    if stellung != [] {
      parbreak()
      text(fill: grau, stellung)
    }
  })
}

/// Hervorgehobenes Endergebnis.
#let ergebnis(body) = box(stroke: 0.7pt + akzent, inset: (x: 5pt, y: 4pt), radius: 2pt, body)
