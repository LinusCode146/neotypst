// stil – einheitlicher Stil für Arbeitsblätter, Hausaufgaben und Lab-Protokolle.
//
//   #import "@local/stil:0.1.0": *
//   #show: stil                         schwarz, 12 pt
//   #show: stil.with(akzent: rgb("#2b50c8"), groesse: 11pt)
//
// Regeln und Beispiele: STIL.md im selben Ordner.

// ─── Einstellungen ─────────────────────────────────────────────────────────

#let _akzent = state("stil-akzent", black)
#let _kasten = state("stil-kasten", luma(244))
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
#let _ist-text(c, muster) = (
  // Ziffern sind `text`, das Komma ist je nach Typst-Version `text` oder `symbol`.
  type(c) == content and c.has("text") and type(c.text) == str and c.text.match(muster) != none
)

// ─── Einheiten ─────────────────────────────────────────────────────────────
// Direkt nach einer Zahl werden Einheiten erkannt und aufrecht mit schmalem
// Abstand gesetzt: $100 km/h$, $3,5 m/s^2$, $9,81 N/kg$, $20 °C$.
// Ohne Zahl davor bleibt alles Formel: $v = s/t$ hat kursive Variablen.

// Einbuchstabige Einheiten. Typst liest sie als Variablen (`symbol`).
#let _einheit-zeichen = (
  "m", "s", "g", "h", "l", "L", "t",
  "N", "V", "A", "W", "J", "K", "C", "F", "T", "H", "S", "Ω", "°", "%",
)

#let _ist-symbol(c) = type(c) == content and repr(c.func()) == "symbol"
#let _leer = [ ].func()

/// Ist c eine Einheit? Mit folge: true auch mehrere Einheiten hintereinander
/// wie `kg m` (für Zähler und Nenner von km/h, kg m/s^2 …).
#let _ist-einheit(c, folge: false) = {
  if type(c) != content { return false }
  let f = c.func()
  // Text in Anführungszeichen und die vordefinierten Namen (km, kg, …)
  if f == text { return c.text.match(regex("^[\pL°µ]")) != none }
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

#let _dezimal(body) = {
  if type(body) != content { return body }
  let f = body.func()
  if f == _seq {
    let ch = body.children
    let neu = ()
    let geaendert = false
    let i = 0
    while i < ch.len() {
      let c = ch.at(i)
      let davor = if i > 0 { ch.at(i - 1) } else { none }
      let danach = if i + 1 < ch.len() { ch.at(i + 1) } else { none }
      if _ist-text(c, regex("^,$")) and _ist-text(davor, regex("\d$")) and _ist-text(danach, regex("^\d")) {
        // 0,4871: Komma ohne Abstand
        neu.push(_komma)
        geaendert = true
      } else if _ist-text(c, regex("\\d$")) and _einheit-nach(ch, i + 1) != none {
        // 100 km/h: schmaler Abstand, Einheiten aufrecht, auch mehrere
        // hintereinander wie N m oder °C
        neu.push(c)
        let j = _einheit-nach(ch, i + 1)
        neu.push(math.thin)
        neu.push(_einheit-satz(ch.at(j)))
        i = j
        while true {
          if i + 1 < ch.len() and _ist-einheit(ch.at(i + 1)) {
            neu.push(_einheit-satz(ch.at(i + 1)))
            i += 1
          } else if i + 2 < ch.len() and ch.at(i + 1).func() == _leer and _ist-einheit(ch.at(i + 2)) {
            neu.push(math.thin)
            neu.push(_einheit-satz(ch.at(i + 2)))
            i += 2
          } else { break }
        }
        geaendert = true
      } else {
        let d = _dezimal(c)
        if d != c { geaendert = true }
        neu.push(d)
      }
      i += 1
    }
    return if geaendert { neu.join() } else { body }
  }
  // In verschachtelte Formelteile hineinschauen.
  if f == math.frac {
    return math.frac(_dezimal(body.num), _dezimal(body.denom))
  }
  if f == math.attach {
    let felder = body.fields()
    let base = felder.remove("base")
    for (k, v) in felder { felder.insert(k, _dezimal(v)) }
    return math.attach(_dezimal(base), ..felder)
  }
  if f == math.lr { return math.lr(_dezimal(body.body)) }
  if f == math.underline { return math.underline(_dezimal(body.body)) }
  if f == math.overline { return math.overline(_dezimal(body.body)) }
  if f == math.root {
    let index = body.at("index", default: none)
    return math.root(if index == none { none } else { _dezimal(index) }, _dezimal(body.radicand))
  }
  body
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
    let ak = _akzent.get()
    let nummer = if nr == auto { _aufgabe.display() } else { nr }
    block(
      width: 100%,
      fill: _kasten.get(),
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
    let ak = _akzent.get()
    let b = if eigen == none { numbering("a", _teil.get().first()) } else { eigen }
    show math.equation.where(block: true): set block(above: 0.4em, below: 0.4em)
    block(above: 1em, below: 1em, grid(
      columns: (1.7em, 1fr),
      align: if nur-formel { horizon } else { top },
      text(fill: ak, weight: "bold")[#b)],
      body,
    ))
  }
}

// ─── Kleinigkeiten ─────────────────────────────────────────────────────────

/// Antwortsatz unter einer Rechnung.
#let antwort(body) = block(above: 0.8em, below: 1em)[_Antwort:_ #body]

/// Akzentfarbe an einer Stelle im Dokument nutzen: `#text(fill: akzent())[…]`
/// geht nur in `context`; für Text reicht `#betont[…]`.
#let betont(body) = context text(fill: _akzent.get(), body)

// ─── Grundeinstellungen ────────────────────────────────────────────────────

/// Alle Grundeinstellungen auf einmal: `#show: stil.with(…)`.
///
/// - akzent: Farbe für Aufgabenköpfe und Teilaufgaben
/// - kasten: Hintergrund der Aufgabenstellung
/// - schrift: Textschrift, z. B. "Charter" oder "Libron"
/// - groesse: Grundgröße des Textes
/// - formeln: Schrift für Formeln
#let stil(
  akzent: black,
  kasten: luma(244),
  schrift: "Charter",
  groesse: 12pt,
  formeln: "New Computer Modern Math",
  rand: (x: 2.2cm, y: 2cm),
  body,
) = {
  _akzent.update(akzent)
  _kasten.update(kasten)
  let faktor = _skalierung.at(schrift, default: 1)

  set page(paper: "a4", margin: rand)
  set text(
    font: (schrift, "New Computer Modern"),
    size: groesse * faktor,
    lang: "de",
    region: "DE",
  )
  set par(justify: false, leading: 0.8em, spacing: 1.3em)

  // Formeln: Computer Modern, Größe passend zur Textschrift.
  show math.equation: set text(font: formeln, size: groesse)
  show math.equation: it => {
    let neu = _dezimal(it.body)
    if neu == it.body { it } else { math.equation(neu, block: it.block, numbering: it.numbering) }
  }
  set math.equation(numbering: none)
  show math.equation.where(block: true): set block(above: 1em, below: 1em)

  // Überschriften schlicht, ohne Nummern.
  set heading(numbering: none)
  show heading: set text(weight: "bold")
  show heading.where(level: 1): set text(size: 1.45em)
  show heading.where(level: 2): set text(size: 1.2em)
  show heading.where(level: 3): set text(size: 1.05em)
  show heading: set block(above: 1.6em, below: 0.8em)

  // Code
  // Code in fester Größe relativ zur Grundgröße: Typst verkleinert raw
  // ohnehin auf 0,8 em, und neben Libron wirkte Code sonst zu klein.
  show raw: set text(font: ("Menlo", "DejaVu Sans Mono"), size: groesse * 0.8)
  show raw.where(block: true): block.with(
    width: 100%, fill: luma(246), inset: 8pt, radius: 3pt,
  )

  // Abbildungen und Tabellen
  set figure(gap: 0.7em)
  show figure.caption: set text(size: 0.9em)
  set table(stroke: 0.5pt + luma(170), inset: (x: 7pt, y: 5pt))
  set list(indent: 0.4em, body-indent: 0.6em)
  set enum(indent: 0.4em, body-indent: 0.6em)

  body
}
