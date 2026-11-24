// neotypst-stil 0.6.0
// Hausaufgaben-Abgabe, aufgebaut auf stil.typ:
// Aufgabenstellung im grauen Kasten, darunter deine Lösung.

#import "stil.typ": *

#let grau = luma(110)

#let hausaufgabe(titel: "", kurs: "", name: "", datum: "", akzent: black, profil: "klassisch", body) = {
  show: stil.with(profil: profil, akzent: akzent)
  set document(title: titel, author: name)
  set page(
    header: context if counter(page).get().first() > 1 {
      set text(9pt, fill: grau)
      [#name #h(1fr) #titel]
    },
    footer: context {
      set text(9pt, fill: grau)
      h(1fr)
      counter(page).display("1 / 1", both: true)
    },
  )

  grid(
    columns: (1fr, auto),
    row-gutter: 5pt,
    text(20pt, weight: "bold", titel), align(right + bottom, text(11pt, name)),
    text(11pt, fill: grau, kurs), align(right, text(11pt, fill: grau, datum)),
  )
  v(-2pt)
  line(length: 100%, stroke: 0.5pt + grau)
  body
}

/// Endergebnis im Fließtext, doppelt unterstrichen.
/// In Formeln stattdessen `erg(…)` verwenden.
#let ergebnis(body) = underline(offset: 2.5pt, underline(offset: 4.5pt, body))
