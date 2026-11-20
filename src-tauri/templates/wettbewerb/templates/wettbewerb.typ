// Lösungen für Wettbewerbe (z. B. Mathe-/Physik-Olympiade, Bundeswettbewerb).

#let akzent = rgb("#2b50c8")
#let grau = luma(110)

#let wettbewerb(wettbewerb: "", runde: "", name: "", teilnehmernummer: "", datum: "", body) = {
  set document(title: wettbewerb + " " + runde, author: name)
  set page(
    paper: "a4",
    margin: (x: 2.3cm, y: 2.3cm),
    header: {
      set text(8.5pt, fill: grau)
      [#wettbewerb #runde #h(1fr) #name #if teilnehmernummer != "" [· Nr. #teilnehmernummer]]
      v(-4pt)
      line(length: 100%, stroke: 0.4pt + grau)
    },
    footer: context { set text(8pt, fill: grau); h(1fr); counter(page).display("1 / 1", both: true) },
  )
  set text(lang: "de", size: 11pt)
  set par(justify: true)
  set math.equation(numbering: "(1)")
  body
}

/// Neue Aufgabe, beginnt auf einer neuen Seite.
#let problem(nummer, titel: none, stellung) = {
  pagebreak(weak: true)
  text(15pt, weight: "bold")[Aufgabe #nummer]
  if titel != none { text(15pt)[ — #titel] }
  v(0.3em)
  block(width: 100%, inset: (left: 10pt, y: 6pt), stroke: (left: 1.5pt + grau), text(fill: grau, stellung))
  v(0.6em)
}

#let _box(name, body, qed: false) = block(width: 100%, above: 1.2em, {
  text(weight: "bold", fill: akzent, name + ".")
  h(0.4em)
  body
  if qed { h(1fr); sym.square.stroked }
})

#let behauptung(body) = _box("Behauptung", body)
#let lemma(body) = _box("Lemma", body)
#let beweis(body) = _box("Beweis", body, qed: true)
#let antwort(body) = _box("Antwort", body)
