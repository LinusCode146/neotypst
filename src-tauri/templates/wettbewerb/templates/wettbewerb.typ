// Lösungen für Wettbewerbe (z. B. Mathe-/Physik-Olympiade, Bundeswettbewerb),
// aufgebaut auf stil.typ.

#import "stil.typ": *

#let grau = luma(110)

#let wettbewerb(wettbewerb: "", runde: "", name: "", teilnehmernummer: "", datum: "", akzent: black, body) = {
  show: stil.with(akzent: akzent, rand: (x: 2.3cm, y: 2.3cm))
  set document(title: wettbewerb + " " + runde, author: name)
  set page(
    header: {
      set text(9pt, fill: grau)
      [#wettbewerb #runde #h(1fr) #name#if teilnehmernummer != "" [#h(1.2em)Nr. #teilnehmernummer]]
      v(-4pt)
      line(length: 100%, stroke: 0.4pt + grau)
    },
    footer: context { set text(9pt, fill: grau); h(1fr); counter(page).display("1 / 1", both: true) },
  )
  set math.equation(numbering: "(1)")
  body
}

/// Neue Aufgabe, beginnt auf einer neuen Seite. Die Aufgabenstellung steht
/// im grauen Kasten, wie bei `aufgabe` aus stil.typ.
#let problem(nummer, titel: none, stellung) = {
  pagebreak(weak: true)
  text(16pt, weight: "bold")[Aufgabe #nummer#if titel != none [#h(0.6em)#text(weight: "regular", titel)]]
  v(0.2em)
  context block(
    width: 100%,
    fill: _kasten.get().last(),
    inset: (x: 11pt, y: 9pt),
    radius: 2pt,
    below: 1em,
    stellung,
  )
}

#let _box(name, body, qed: false) = block(width: 100%, above: 1.2em, {
  text(weight: "bold", name + ".")
  h(0.4em)
  body
  if qed { h(1fr); sym.square.stroked }
})

#let behauptung(body) = _box("Behauptung", body)
#let lemma(body) = _box("Lemma", body)
#let beweis(body) = _box("Beweis", body, qed: true)
#let antwort(body) = _box("Antwort", body)
