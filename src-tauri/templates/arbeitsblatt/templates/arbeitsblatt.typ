// Arbeitsblatt-Bausteine, aufgebaut auf stil.typ.
// Lösungen werden über den Schalter „Lösungen“ im Editor ein- und
// ausgeblendet (sys.inputs.loesungen).

#import "stil.typ" as stil-modul
#import "stil.typ": *

#let loesungen = sys.inputs.at("loesungen", default: "false") == "true"
#let grau = luma(110)

#let _punkte = state("punkte", 0)

/// Seitenlayout für ein Arbeitsblatt.
#let arbeitsblatt(
  titel: "",
  fach: "",
  klasse: "",
  datum: "",
  namensfeld: true,
  akzent: black,
  profil: "klassisch",
  body,
) = {
  show: stil.with(profil: profil, akzent: akzent, rand: if profil == "klassisch" { (x: 2cm, top: 2.2cm, bottom: 2cm) } else { auto })
  set document(title: titel)
  set page(footer: context {
    set text(9pt, fill: grau)
    h(1fr)
    [Seite #counter(page).display() von #counter(page).final().first()]
    h(1fr)
  })
  set enum(numbering: "a)")

  grid(
    columns: (1fr, auto),
    align: (left + bottom, right + bottom),
    {
      set text(10pt, fill: grau)
      fach
      if klasse != "" [#if fach != "" [, ]Klasse #klasse]
      linebreak()
      text(20pt, weight: "bold", fill: black, titel)
    },
    {
      set text(10pt, fill: grau)
      if loesungen [Lösung#h(1em)]
      datum
    },
  )
  v(-4pt)
  line(length: 100%, stroke: 0.5pt + grau)
  if namensfeld {
    set text(11pt)
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

/// Eine Aufgabe, optional mit Lösung als zweitem Inhaltsblock:
/// `#aufgabe(punkte: 3)[Aufgabe][Lösung]`
/// Die Lösung erscheint nur, wenn „Lösungen“ eingeschaltet ist.
#let aufgabe(punkte: none, titel: none, nr: auto, body, ..loesung) = {
  if punkte != none { _punkte.update(p => p + punkte) }
  stil-modul.aufgabe(titel: titel, punkte: punkte, nr: nr, body)
  let l = loesung.pos()
  if loesungen and l.len() > 0 {
    block(
      width: 100%,
      inset: (left: 10pt, y: 2pt),
      stroke: (left: 1pt + luma(170)),
      l.first(),
    )
  }
}

/// Inhalt, der nur in der Lösungsversion erscheint.
#let loesung(body) = if loesungen { body }

/// Platz zum Rechnen. art: "karo", "linien" oder "leer".
/// In der Lösungsversion wird kein Platz gelassen.
#let platz(hoehe, art: "karo") = {
  if loesungen { return }
  let farbe = luma(205)
  if art == "karo" {
    let r = 5mm
    let karo = tiling(size: (r, r), {
      place(line(start: (0pt, 0pt), end: (r, 0pt), stroke: 0.3pt + farbe))
      place(line(start: (0pt, 0pt), end: (0pt, r), stroke: 0.3pt + farbe))
    })
    // Weißer Grund, damit das Karo auch im grauen Aufgabenkasten wie Papier aussieht.
    block(width: 100%, height: hoehe, fill: white, stroke: 0.4pt + farbe,
      block(width: 100%, height: 100%, fill: karo))
  } else if art == "linien" {
    let r = 8mm
    block(width: 100%, height: hoehe, fill: tiling(size: (1cm, r), {
      place(bottom, line(length: 1cm, stroke: 0.4pt + farbe))
    }))
  } else {
    v(hoehe)
  }
}

/// Merkkasten: feiner grauer Rahmen, Titel fett.
#let merke(titel: "Merke", body) = block(
  width: 100%,
  inset: (x: 11pt, y: 9pt),
  radius: 2pt,
  stroke: 0.5pt + luma(160),
  above: 1.4em,
  below: 1.2em,
)[
  #text(weight: "bold", titel)
  #v(0.4em, weak: true)
  #body
]
