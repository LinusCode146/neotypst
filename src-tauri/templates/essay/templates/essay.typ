// neotypst-stil 0.6.0
// Essay, aufgebaut auf stil.typ: Deckblatt mit Fragestellung und Angaben,
// danach nur Text. Nichts fett, nichts farbig.

#import "stil.typ": *

#let grau = luma(90)

#let essay(
  fragestellung: "",
  name: "",
  kurs: "",
  lehrkraft: "",
  datum: "",
  untertitel: none,
  profil: "klassisch",
  body,
) = {
  show: stil.with(profil: profil)
  set document(title: fragestellung, author: name)

  // Ohne Fettdruck: Überschriften unterscheiden sich nur durch die Größe,
  // *betont* wird kursiv.
  show heading: set text(weight: "regular", tracking: 0em)
  // Feste Größen, weil stil.typ die Überschriften schon relativ vergrößert.
  show heading.where(level: 1): set text(size: 15pt)
  show heading.where(level: 2): set text(size: 13pt)
  show heading: set block(above: 1.8em, below: 0.9em)
  show heading.where(level: 3): it => block(above: 1.4em, below: 0.7em, emph(it.body))
  show strong: it => emph(it.body)
  show link: set text(fill: black)
  show ref: set text(fill: black)

  // Fließtext im Blocksatz mit Einzug, wie in gedruckten Texten.
  set par(justify: true, first-line-indent: 1.2em, spacing: 0.8em)

  // Deckblatt
  page(header: none, footer: none, {
    set par(justify: false, first-line-indent: 0em)
    v(28%)
    text(size: 22pt, fragestellung)
    if untertitel != none {
      v(0.6em)
      text(size: 13pt, fill: grau, untertitel)
    }
    v(1fr)
    let zeile(label, wert) = if wert != "" { ([#label], [#wert]) } else { () }
    grid(
      columns: (auto, 1fr),
      column-gutter: 1.5em,
      row-gutter: 0.75em,
      text(fill: grau)[Essay], [],
      ..zeile(text(fill: grau)[Verfasst von], name),
      ..zeile(text(fill: grau)[Kurs], kurs),
      ..zeile(text(fill: grau)[Lehrkraft], lehrkraft),
      ..zeile(text(fill: grau)[Datum], datum),
    )
    v(2cm)
  })

  set page(footer: context {
    set text(10pt, fill: grau)
    h(1fr)
    counter(page).display()
    h(1fr)
  })
  counter(page).update(1)
  body
}
