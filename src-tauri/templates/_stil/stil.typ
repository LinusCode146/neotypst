// neotypst-stil 0.5.0
// stil – einheitlicher Stil für Arbeitsblätter, Hausaufgaben und Lab-Protokolle.
//
//   #import "@local/stil:0.1.0": *
//   #show: stil                         schwarz, 12 pt
//   #show: stil.with(akzent: rgb("#2b50c8"), groesse: 11pt)
//   #show: stil.with(profil: "akademisch")   nach Uni- und Satznormen
//
// Regeln und Beispiele: STIL.md im selben Ordner.

// ─── Einstellungen ─────────────────────────────────────────────────────────

// Akzent- und Kastenfarbe als Stapel: Jedes `#show: stil.with(…)` legt seine
// Werte oben drauf und nimmt sie am Ende seines Bereichs wieder herunter.
// So färbt ein Kapitel mit eigener Akzentfarbe nichts, was danach kommt.
#let _akzent = state("stil-akzent", (black,))
#let _kasten = state("stil-kasten", (luma(244),))
// "klassisch": grauer Aufgabenkasten, 12 pt, Flattersatz.
// "akademisch": wie Übungsblätter, Wettbewerbslösungen und Arbeiten an der Uni
// (Blocksatz, 11 pt, Satzspiegel nach KOMA-Script, Tabellen ohne Gitter).
#let _profil = state("stil-profil", ("klassisch",))
#let _akademisch() = _profil.get().last() == "akademisch"
#let _aufgabe = counter("stil-aufgabe")
#let _teil = counter("stil-teil")

// Schriften, die bei gleicher Punktgröße größer wirken, werden etwas
// kleiner gesetzt, damit 11pt immer ungefähr gleich groß aussieht.
#let _skalierung = (
  "Libron": 0.9,
)

// ─── Dezimalkomma ──────────────────────────────────────────────────────────
// Typst setzt nach jedem Komma in Formeln einen Abstand, auch in 0,4871.
// Zwischen zwei Ziffern wird das Komma hier zum normalen Zeichen ohne Abstand.
// f(x, y) behält seinen Abstand.

#let _komma = math.class("normal", ",")
#let _seq = [].func()
#let _leer = [ ].func()
#let _symbol = $x$.body.func()
#let _ziffern = "0123456789"

// Ziffern sind `text`, das Komma ist je nach Typst-Version `text` oder `symbol`.
#let _text-von(c) = if type(c) == content and c.has("text") and type(c.text) == str { c.text } else { none }
#let _ist-komma(c) = _text-von(c) == ","
#let _endet-ziffer(c) = {
  let t = _text-von(c)
  t != none and t != "" and _ziffern.contains(t.last())
}
#let _beginnt-ziffer(c) = {
  // 0,515^2: nach dem Komma steht die Ziffernfolge als Basis einer Potenz.
  if type(c) == content and c.func() == math.attach { return _beginnt-ziffer(c.base) }
  let t = _text-von(c)
  t != none and t != "" and _ziffern.contains(t.first())
}

// ─── Einheiten ─────────────────────────────────────────────────────────────
// Direkt nach einer Zahl werden Einheiten erkannt und aufrecht mit schmalem
// Abstand gesetzt: $100 km/h$, $3,5 m/s^2$, $9,81 N/kg$, $20 °C$.
// Ohne Zahl davor bleibt alles Formel: $v = s/t$ hat kursive Variablen.

// Einbuchstabige Einheiten. Typst liest sie als Variablen (`symbol`).
#let _einheit-zeichen = (
  "m", "s", "g", "h", "l", "L", "t",
  "N", "V", "A", "W", "J", "K", "C", "F", "T", "H", "S", "Ω", "°", "%",
)

#let _ist-symbol(c) = type(c) == content and c.func() == _symbol
#let _einheit-anfang = regex("^[\\pL°µ]")

/// Ist c eine Einheit? Mit folge: true auch mehrere Einheiten hintereinander
/// wie `kg m` (für Zähler und Nenner von km/h, kg m/s^2 …).
#let _ist-einheit(c, folge: false) = {
  if type(c) != content { return false }
  let f = c.func()
  // Text in Anführungszeichen und die vordefinierten Namen (km, kg, …)
  if f == text { return c.text.match(_einheit-anfang) != none }
  if _ist-symbol(c) { return c.text in _einheit-zeichen }
  if f == math.attach { return _ist-einheit(c.base) }
  if f == math.frac { return _ist-einheit(c.num, folge: true) and _ist-einheit(c.denom, folge: true) }
  if folge and f == _seq {
    let teile = c.children.filter(x => x.func() != _leer)
    return teile.len() > 0 and teile.all(x => _ist-einheit(x) or (x.has("text") and x.text == "⋅"))
  }
  false
}

/// Setzt eine erkannte Einheit aufrecht; Brüche werden zu km/h in einer Zeile.
#let _einheit-satz(c) = {
  let f = c.func()
  if f == math.frac { return [#_einheit-satz(c.num)#sym.slash#_einheit-satz(c.denom)] }
  if f == math.attach {
    let felder = c.fields()
    let base = felder.remove("base")
    return math.attach(_einheit-satz(base), ..felder)
  }
  if f == _seq {
    return c.children.map(x => if x.func() == _leer { math.thin } else { _einheit-satz(x) }).join()
  }
  if _ist-symbol(c) { return math.upright(c) }
  c
}

// Vordefinierte Einheiten mit mehreren Buchstaben, damit $100 km/h$ ohne
// Anführungszeichen geht. Nicht dabei, weil Typst die Namen schon belegt:
// min, bar, cal, deg – dafür "min", "bar", "kcal" in Anführungszeichen.
#let km = "km"
#let dm = "dm"
#let cm = "cm"
#let mm = "mm"
#let nm = "nm"
#let kg = "kg"
#let mg = "mg"
#let ms = "ms"
#let ns = "ns"
#let ml = "ml"
#let mL = "mL"
#let Hz = "Hz"
#let kHz = "kHz"
#let MHz = "MHz"
#let GHz = "GHz"
#let kN = "kN"
#let kJ = "kJ"
#let MJ = "MJ"
#let kW = "kW"
#let MW = "MW"
#let mW = "mW"
#let Wh = "Wh"
#let kWh = "kWh"
#let mA = "mA"
#let kV = "kV"
#let mV = "mV"
#let Pa = "Pa"
#let hPa = "hPa"
#let kPa = "kPa"
#let mol = "mol"
#let eV = "eV"
#let keV = "keV"
#let MeV = "MeV"
#let Ohm = "Ω"
#let kOhm = "kΩ"
#let MOhm = "MΩ"
#let dB = "dB"
#let rad = "rad"
#let Bq = "Bq"
#let Wb = "Wb"
#let lx = "lx"
#let lm = "lm"

// Position der Einheit nach der Zahl, sonst none. Einbuchstabige Einheiten
// brauchen ein Leerzeichen: `8 s` ist eine Zeit, `2s` bleibt 2 mal s.
// Einheiten in Anführungszeichen und km, kg, … gehen auch ohne Leerzeichen.
#let _einheit-nach(ch, i) = {
  if i >= ch.len() { return none }
  if ch.at(i).func() == _leer {
    if i + 1 < ch.len() and _ist-einheit(ch.at(i + 1)) { return i + 1 }
    return none
  }
  let c = ch.at(i)
  let kern = if c.func() == math.attach { c.base } else { c }
  if kern.func() == text and _ist-einheit(c) { i } else { none }
}

/// Bearbeitet einen Formelteil. Gibt `none` zurück, wenn sich nichts ändert:
/// So muss nichts mit dem Original verglichen werden, und unveränderte Teile
/// werden nicht neu gebaut.
#let _neu(body, iso: false) = {
  if type(body) != content { return none }
  let f = body.func()
  // Profil „akademisch“: die Eulersche Zahl e aufrecht (DIN 1338, ISO 80000-2).
  if iso and f == _symbol and body.text == "e" { return math.upright(body) }
  if f == _seq {
    let ch = body.children
    let neu = none
    let i = 0
    while i < ch.len() {
      let c = ch.at(i)
      let ersatz = none
      let weiter = i + 1
      if _ist-komma(c) and i > 0 and _endet-ziffer(ch.at(i - 1)) and i + 1 < ch.len() and _beginnt-ziffer(ch.at(i + 1)) {
        // 0,4871: Komma ohne Abstand
        ersatz = (_komma,)
      } else if _endet-ziffer(c) {
        let j = _einheit-nach(ch, i + 1)
        if j != none {
          // 100 km/h: schmaler Abstand, Einheiten aufrecht, auch mehrere
          // hintereinander wie N m oder °C
          ersatz = (c, math.thin, _einheit-satz(ch.at(j)))
          let k = j
          while true {
            if k + 1 < ch.len() and _ist-einheit(ch.at(k + 1)) {
              ersatz += (_einheit-satz(ch.at(k + 1)),)
              k += 1
            } else if k + 2 < ch.len() and ch.at(k + 1).func() == _leer and _ist-einheit(ch.at(k + 2)) {
              ersatz += (math.thin, _einheit-satz(ch.at(k + 2)))
              k += 2
            } else { break }
          }
          weiter = k + 1
        }
      } else {
        let n = _neu(c, iso: iso)
        if n != none { ersatz = (n,) }
      }
      if ersatz != none and neu == none { neu = ch.slice(0, i) }
      if neu != none { if ersatz == none { neu.push(c) } else { neu += ersatz } }
      i = weiter
    }
    return if neu == none { none } else { neu.join() }
  }
  // In verschachtelte Formelteile hineinschauen.
  if f == math.frac {
    let (n, d) = (_neu(body.num, iso: iso), _neu(body.denom, iso: iso))
    if n == none and d == none { return none }
    return math.frac(if n == none { body.num } else { n }, if d == none { body.denom } else { d })
  }
  if f == math.attach {
    let felder = body.fields()
    let anders = false
    for (k, v) in felder {
      let w = _neu(v, iso: iso)
      if w != none { felder.insert(k, w); anders = true }
    }
    // e_1 bleibt ein Name (Einheitsvektor), e^x wird aufrecht.
    if iso and "base" in felder and felder.at("t", default: none) == none and felder.at("b", default: none) != none and _ist-symbol(body.base) and body.base.text == "e" {
      felder.insert("base", body.base)
    }
    if not anders { return none }
    let base = felder.remove("base")
    return math.attach(base, ..felder)
  }
  if f in (math.lr, math.underline, math.overline) {
    let b = _neu(body.body, iso: iso)
    return if b == none { none } else { f(b) }
  }
  if f == math.root {
    let index = body.at("index", default: none)
    let i = _neu(index, iso: iso)
    let r = _neu(body.radicand, iso: iso)
    if i == none and r == none { return none }
    return math.root(if i == none { index } else { i }, if r == none { body.radicand } else { r })
  }
  none
}

/// Wie `_neu`, gibt aber bei unveränderten Teilen das Original zurück.
#let _dezimal(body) = {
  let n = _neu(body)
  if n == none { body } else { n }
}

// Markiert bearbeitete Formeln, damit die Formel-Regel sie kein zweites Mal
// durchläuft. Unsichtbar und ohne Platzbedarf.
#let _fertig = metadata("stil-fertig")

/// Die Formel-Regel aus `stil`: Dezimalkomma und Einheiten.
#let _formel(it, iso: false) = {
  let b = it.body
  if b.func() == _seq and b.children.len() > 0 and b.children.first() == _fertig { return it }
  let neu = _neu(b, iso: iso)
  if neu == none { return it }
  // Die neu gebaute Formel zählt selbst mit; die ursprüngliche hat die Nummer
  // schon vergeben. Sonst wären nummerierte Formeln (2), (4), …
  if it.block and it.numbering != none { counter(math.equation).update(n => n - 1) }
  math.equation(
    [#_fertig#neu],
    block: it.block,
    numbering: it.numbering,
    number-align: it.number-align,
    supplement: it.supplement,
  )
}

// ─── Rechnungen ────────────────────────────────────────────────────────────

/// Ergebnis einer Rechnung, doppelt unterstrichen: `$x &= erg(0,4871)$`.
/// Kommas in den Argumenten werden wieder zu einer Dezimalzahl zusammengesetzt.
#let erg(..teile) = {
  let inhalt = teile.pos().map(t => if type(t) == content { t } else { [#t] }).join(_komma)
  math.underline(math.underline(inhalt))
}

// ─── Aufgaben ──────────────────────────────────────────────────────────────

/// Aufgabenstellung, hell hinterlegt. Die Lösung folgt einfach darunter.
///
///   #aufgabe[Text oder Screenshot]
///   #aufgabe(titel: "Geburten")[…]
///   #aufgabe(nr: "3.12")[…]          eigene Nummer, zählt nicht mit
///   #aufgabe(punkte: 4)[…]
#let aufgabe(titel: none, nr: auto, punkte: none, body) = {
  if nr == auto { _aufgabe.step() }
  _teil.update(0)
  context {
    let ak = _akzent.get().last()
    let nummer = if nr == auto { _aufgabe.display() } else { nr }
    if _akademisch() {
      // Wie auf Uni-Übungsblättern: Kopf als Zeile, die Stellung zwischen
      // zwei feinen Linien statt auf grauem Grund (druckt und kopiert sauber).
      block(width: 100%, above: 1.9em, below: 1em, breakable: true)[
        #set enum(numbering: "(a)")
        #block(below: 0.55em, sticky: true, grid(
          columns: (1fr, auto),
          text(fill: ak, weight: "bold")[Aufgabe #nummer#if titel != none [#h(0.7em)#text(fill: black, weight: "regular", titel)]],
          if punkte != none [(#punkte #if punkte == 1 [Punkt] else [Punkte])],
        ))
        #block(width: 100%, inset: (y: 0.6em), stroke: (top: 0.4pt, bottom: 0.4pt), body)
      ]
    } else {
    block(
      width: 100%,
      fill: _kasten.get().last(),
      inset: (x: 11pt, y: 9pt),
      radius: 2pt,
      above: 1.6em,
      below: 1em,
      breakable: true,
    )[
      // Aufzählungen in der Aufgabenstellung sind Teilaufgaben.
      #set enum(numbering: "a)")
      // Etwas Luft unter dem Kopf; Schriften mit hohen Oberlängen wie Libron
      // stoßen sonst an die erste Textzeile.
      #block(below: 0.85em, grid(
        columns: (1fr, auto),
        text(fill: ak, weight: "bold")[Aufgabe #nummer#if titel != none [#h(0.6em)#text(fill: black)[#titel]]],
        if punkte != none { text(size: 0.85em, fill: luma(90))[#punkte P.] },
      ))
      #body
    ]
    }
  }
  _teil.update(0)
}

/// Teilaufgabe mit Buchstaben links; zählt innerhalb einer Aufgabe a), b), c) …
///
///   #teil[$T(7) = 5202$]
///   #teil("d")[…]                     eigener Buchstabe
#let teil(..args) = {
  let pos = args.pos()
  let body = pos.last()
  let eigen = if pos.len() > 1 { pos.first() } else { none }
  if eigen == none { _teil.step() }
  // Besteht die Teilaufgabe nur aus einer einzeiligen abgesetzten Formel,
  // steht der Buchstabe mittig daneben; sonst auf Höhe der ersten Zeile.
  let teile = if body.func() == _seq { body.children } else { (body,) }
  teile = teile.filter(c => c.func() not in ([ ].func(), parbreak))
  let nur-formel = (
    teile.len() == 1 and teile.first().func() == math.equation
      and teile.first().block and not repr(teile.first().body).contains("linebreak")
  )
  context {
    let ak = _akzent.get().last()
    let b = if eigen == none { numbering("a", _teil.get().first()) } else { eigen }
    let ak-profil = _akademisch()
    // Akademisch: (a) in normaler Schrift, wie in LaTeX-Aufzählungen.
    let marke = if ak-profil { text(fill: ak)[(#b)] } else { text(fill: ak, weight: "bold")[#b)] }
    show math.equation.where(block: true): set block(above: 0.4em, below: 0.4em)
    block(above: 1em, below: 1em, grid(
      columns: (if ak-profil { 2.1em } else { 1.7em }, 1fr),
      align: if nur-formel { horizon } else { top },
      marke,
      body,
    ))
  }
}

// ─── Kleinigkeiten ─────────────────────────────────────────────────────────

/// Antwortsatz unter einer Rechnung.
#let antwort(body) = block(above: 0.8em, below: 1em)[_Antwort:_ #body]

/// Akzentfarbe an einer Stelle im Dokument nutzen: `#text(fill: akzent())[…]`
/// geht nur in `context`; für Text reicht `#betont[…]`.
#let betont(body) = context text(fill: _akzent.get().last(), body)

// ─── Grundeinstellungen ────────────────────────────────────────────────────

/// Alle Grundeinstellungen auf einmal: `#show: stil.with(…)`.
///
/// - profil: "klassisch" (Standard) oder "akademisch" (siehe STIL.md, Abschnitt 6)
/// - akzent: Farbe für Aufgabenköpfe und Teilaufgaben
/// - kasten: Hintergrund der Aufgabenstellung (im Profil „akademisch“ keiner)
/// - schrift: Textschrift, Standard ist die LaTeX-Schrift; z. B. "Charter" oder "Libron"
/// - groesse: Grundgröße des Textes (klassisch 12 pt, akademisch 11 pt)
/// - formeln: Schrift für Formeln
/// - rand: Seitenränder (akademisch: Satzspiegel für etwa 75 Zeichen pro Zeile)
#let stil(
  profil: "klassisch",
  akzent: black,
  kasten: auto,
  schrift: "New Computer Modern",
  groesse: auto,
  formeln: "New Computer Modern Math",
  rand: auto,
  body,
) = {
  assert(profil in ("klassisch", "akademisch"), message: "stil: profil ist \"klassisch\" oder \"akademisch\"")
  let ak = profil == "akademisch"
  let kasten = if kasten != auto { kasten } else if ak { none } else { luma(244) }
  let groesse = if groesse != auto { groesse } else if ak { 11pt } else { 12pt }
  let rand = if rand != auto { rand } else if ak { (x: 3.2cm, top: 2.7cm, bottom: 3.2cm) } else { (x: 2.2cm, y: 2cm) }

  _profil.update(s => s + (profil,))
  _akzent.update(s => s + (akzent,))
  _kasten.update(s => s + (kasten,))
  let faktor = _skalierung.at(schrift, default: 1)

  set page(paper: "a4", margin: rand, numbering: if ak { "1" } else { none })
  set text(
    font: (schrift, "New Computer Modern"),
    size: groesse * faktor,
    lang: "de",
    region: "DE",
  )
  // Akademisch: Blocksatz mit Silbentrennung, Zeilenabstand um 130 % der
  // Schriftgröße, Absätze durch halbe Leerzeile getrennt (KOMA parskip=half).
  set par(
    justify: ak,
    leading: if ak { 0.62em } else { 0.8em },
    spacing: if ak { 1.05em } else { 1.3em },
  )

  // Formeln: Computer Modern, Größe passend zur Textschrift.
  show math.equation: set text(font: formeln, size: groesse)
  show math.equation: _formel.with(iso: ak)
  set math.equation(numbering: none)
  show math.equation.where(block: true): set block(above: 1em, below: 1em)

  // Überschriften schlicht, ohne Nummern.
  set heading(numbering: none)
  // Die fette Computer Modern ist breit gebaut: Überschriften deshalb nur
  // wenig größer als der Text und mit etwas engeren Buchstaben.
  // Feste Größen (bei 12 pt: 15 / 13 / 12 pt), damit sich nichts aufaddiert.
  // Akademisch wie LaTeX bei 11 pt: 14,4 / 12 / 11 pt.
  show heading: set text(weight: "bold", tracking: -0.015em)
  show heading.where(level: 1): set text(size: groesse * faktor * if ak { 1.31 } else { 1.25 })
  show heading.where(level: 2): set text(size: groesse * faktor * if ak { 1.09 } else { 1.085 })
  show heading.where(level: 3): set text(size: groesse * faktor)
  show heading: set block(above: if ak { 1.9em } else { 1.6em }, below: 0.8em)
  show heading: set par(justify: false)

  // Code
  // Code in fester Größe relativ zur Grundgröße: Typst verkleinert raw
  // ohnehin auf 0,8 em, und neben Libron wirkte Code sonst zu klein.
  show raw: set text(font: ("Menlo", "DejaVu Sans Mono"), size: groesse * if ak { 0.82 } else { 0.8 })
  show raw.where(block: true): set par(justify: false)
  show raw.where(block: true): if ak {
    // Wie LaTeX-listings mit frame=lines: feine Linien statt Fläche.
    block.with(width: 100%, inset: (x: 0pt, y: 6pt), stroke: (top: 0.4pt, bottom: 0.4pt))
  } else {
    block.with(width: 100%, fill: luma(246), inset: 8pt, radius: 3pt)
  }

  // Abbildungen und Tabellen
  set figure(gap: 0.7em)
  show figure.caption: set text(size: 0.9em)
  set list(indent: 0.4em, body-indent: 0.6em)
  set enum(indent: 0.4em, body-indent: 0.6em)

  show: it => if ak {
    // Tabellen im Buchsatz-Stil (booktabs): keine senkrechten Linien,
    // kräftige Linie oben und unten, feine unter dem Kopf.
    // Tabellenunterschriften stehen über der Tabelle.
    set table(
      stroke: (_, y) => if y == 0 { (top: 0.8pt, bottom: 0.45pt) },
      inset: (x: 6pt, y: 4.5pt),
    )
    show table: t => box(stroke: (bottom: 0.8pt), t)
    show figure.where(kind: table): set figure.caption(position: top)
    // Abbildung 1: … mit fettem Etikett, wie in Fachartikeln.
    show figure.caption: c => if c.numbering == none { c } else [#text(weight: "bold")[#c.supplement #c.counter.display(c.numbering):] #c.body]
    // Längere Zitate eingerückt, ohne Anführungszeichen, etwas kleiner.
    show quote.where(block: true): q => block(above: 1.1em, below: 1.1em, inset: (x: 1.5em), {
      set text(size: 0.95em)
      q.body
      if q.attribution != none { linebreak(); h(1fr); q.attribution }
    })
    show footnote.entry: set text(size: 0.85em)
    it
  } else {
    set table(stroke: 0.5pt + luma(170), inset: (x: 7pt, y: 5pt))
    it
  }

  body
  _profil.update(s => s.slice(0, -1))
  _akzent.update(s => s.slice(0, -1))
  _kasten.update(s => s.slice(0, -1))
}
