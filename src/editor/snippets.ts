import { snippet } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";

/**
 * Bausteine: short abbreviations that expand with Tab (or via completion).
 * Bodies use CodeMirror snippet syntax: `${1:Platzhalter}` jumps with Tab.
 */
export type SnippetDef = {
  label: string;
  detail: string;
  body: string;
  group: "Tabellen" | "Mathe" | "Abbildungen" | "Arbeitsblatt" | "Struktur" | "Informatik";
};

export const SNIPPETS: SnippetDef[] = [
  // Tabellen
  {
    label: "tbl",
    group: "Tabellen",
    detail: "Tabelle mit Kopfzeile (tbl3x4 = 3 Zeilen × 4 Spalten)",
    body: tableSnippet(3, 3),
  },
  {
    label: "tblcsv",
    group: "Tabellen",
    detail: "Tabelle aus CSV-Datei",
    body: '#let daten = csv("${1:daten.csv}")\n#table(\n  columns: daten.first().len(),\n  table.header(..daten.first().map(strong)),\n  ..daten.slice(1).flatten(),\n)',
  },
  {
    label: "wertetabelle",
    group: "Tabellen",
    detail: "Wertetabelle x | f(x)",
    body: '#table(\n  columns: ${1:6},\n  align: center,\n  [$x$], ${2:[$-2$], [$-1$], [$0$], [$1$], [$2$]},\n  [$${3:f(x)}$], ${4:[], [], [], [], []},\n)',
  },
  // Mathe
  { label: "eq", group: "Mathe", detail: "Abgesetzte Formel", body: "$ ${1:formel} $" },
  { label: "eqn", group: "Mathe", detail: "Formel mit Label", body: "$ ${1:formel} $ <${2:eq-name}>" },
  {
    label: "ali",
    group: "Mathe",
    detail: "Ausgerichtete Umformung",
    body: "$\n  ${1:a} &= ${2:b} \\\\\n    &= erg(${3:c})\n$",
  },
  { label: "frac", group: "Mathe", detail: "Bruch", body: "(${1:a})/(${2:b})" },
  { label: "vec", group: "Mathe", detail: "Spaltenvektor", body: "vec(${1:x}, ${2:y}, ${3:z})" },
  { label: "mat", group: "Mathe", detail: "Matrix (mat2x3 = 2 Zeilen × 3 Spalten)", body: matrixSnippet(2, 2) },
  {
    label: "cases",
    group: "Mathe",
    detail: "Fallunterscheidung",
    body: 'cases(\n  ${1:a} & "falls" ${2:x > 0},\n  ${3:b} & "sonst",\n)',
  },
  { label: "int", group: "Mathe", detail: "Bestimmtes Integral", body: "integral_(${1:a})^(${2:b}) ${3:f(x)} dif ${4:x}" },
  { label: "sum", group: "Mathe", detail: "Summe", body: "sum_(${1:i=1})^(${2:n}) ${3:a_i}" },
  { label: "lim", group: "Mathe", detail: "Grenzwert", body: "lim_(${1:x} -> ${2:oo}) ${3:f(x)}" },
  { label: "abl", group: "Mathe", detail: "Ableitung d/dx", body: "(dif ${1:f})/(dif ${2:x})" },
  { label: "einheit", group: "Mathe", detail: "Größe mit Einheit", body: "$${1:5} ${2:km/h}$" },
  // Abbildungen
  {
    label: "fig",
    group: "Abbildungen",
    detail: "Bild mit Beschriftung",
    body: '#figure(\n  image("${1:assets/bild.png}", width: ${2:70%}),\n  caption: [${3:Beschriftung}],\n) <${4:fig-name}>',
  },
  {
    label: "figt",
    group: "Abbildungen",
    detail: "Tabelle mit Beschriftung",
    body: "#figure(\n  table(\n    columns: ${1:3},\n    table.header[${2:A}][${3:B}][${4:C}],\n    ${5:[], [], []},\n  ),\n  caption: [${6:Beschriftung}],\n) <${7:tab-name}>",
  },
  {
    label: "grid",
    group: "Abbildungen",
    detail: "Zwei Spalten nebeneinander (grid3 = drei)",
    body: gridSnippet(2),
  },
  // Arbeitsblatt
  {
    label: "aufgabe",
    group: "Arbeitsblatt",
    detail: "Aufgabe mit Nummer, die Lösung folgt darunter",
    body: '#aufgabe(nr: "${1:1}")[\n  ${2:Aufgabenstellung}\n]\n\n${3}',
  },
  {
    label: "aufgabet",
    group: "Arbeitsblatt",
    detail: "Aufgabe mit Nummer und Thema",
    body: '#aufgabe(nr: "${1:1}", titel: "${2:Thema}")[\n  ${3:Aufgabenstellung}\n]\n\n${4}',
  },
  {
    label: "aufgabel",
    group: "Arbeitsblatt",
    detail: "Arbeitsblatt-Vorlage: Aufgabe mit Punkten und ausblendbarer Lösung",
    body: "#aufgabe(punkte: ${1:2})[\n  ${2:Aufgabenstellung}\n][\n  ${3:Lösung}\n]",
  },
  { label: "teil", group: "Arbeitsblatt", detail: "Teilaufgabe a), b), c) in der Lösung", body: "#teil[\n  ${1}\n]" },
  {
    label: "teile",
    group: "Arbeitsblatt",
    detail: "Teilaufgaben in der Aufgabenstellung",
    body: "+ ${1:Erste Teilaufgabe}\n+ ${2:Zweite Teilaufgabe}\n+ ${3:Dritte Teilaufgabe}",
  },
  { label: "erg", group: "Arbeitsblatt", detail: "Endergebnis doppelt unterstrichen (in Formeln)", body: "erg(${1})" },
  { label: "antwort", group: "Arbeitsblatt", detail: "Antwortsatz unter einer Rechnung", body: "#antwort[${1}]" },
  { label: "platz", group: "Arbeitsblatt", detail: "Rechenplatz (Karo)", body: '#platz(${1:4cm}, art: "${2:karo}")' },
  { label: "merke", group: "Arbeitsblatt", detail: "Merkkasten", body: "#merke[\n  ${1:Inhalt}\n]" },
  { label: "loesung", group: "Arbeitsblatt", detail: "Nur in der Lösung sichtbar", body: "#loesung[${1:Lösung}]" },
  // Struktur
  { label: "pb", group: "Struktur", detail: "Seitenumbruch", body: "#pagebreak()\n" },
  { label: "fn", group: "Struktur", detail: "Fußnote", body: "#footnote[${1:Text}]" },
  { label: "box", group: "Struktur", detail: "Umrandeter Kasten", body: "#block(stroke: 0.5pt, inset: 10pt, radius: 3pt, width: 100%)[\n  ${1:Inhalt}\n]" },
  { label: "outline", group: "Struktur", detail: "Inhaltsverzeichnis", body: "#outline(title: [Inhaltsverzeichnis])\n" },
  { label: "bib", group: "Struktur", detail: "Literaturverzeichnis", body: '#bibliography("${1:literatur.bib}", title: [Literatur])' },
  // Informatik
  { label: "code", group: "Informatik", detail: "Codeblock", body: "```${1:python}\n${2:code}\n```" },
  { label: "codefile", group: "Informatik", detail: "Code aus Datei einbinden", body: '#raw(read("${1:src/main.py}"), lang: "${2:python}", block: true)' },
  {
    label: "hinweis",
    group: "Informatik",
    detail: "Hinweiskasten (Dokumentation)",
    body: "#hinweis[\n  ${1:Inhalt}\n]",
  },
];

/** `rows` includes the header row. */
export function tableSnippet(rows: number, cols: number): string {
  let n = 1;
  const field = (ph = "") => `\${${n++}:${ph}}`;
  const header = Array.from({ length: cols }, (_, c) => `[${field(`Spalte ${c + 1}`)}]`).join("");
  const body = Array.from({ length: Math.max(rows - 1, 1) }, () =>
    "  " + Array.from({ length: cols }, () => `[${field()}]`).join(", ") + ",",
  ).join("\n");
  return `#table(\n  columns: ${cols},\n  table.header${header},\n${body}\n)`;
}

export function matrixSnippet(rows: number, cols: number): string {
  let n = 1;
  const lines = Array.from({ length: rows }, (_, r) =>
    "  " + Array.from({ length: cols }, (_, c) => `\${${n++}:a_(${r + 1}${c + 1})}`).join(", ") + ";",
  );
  return `mat(\n${lines.join("\n")}\n)`;
}

export function gridSnippet(cols: number): string {
  let n = 1;
  const cells = Array.from({ length: cols }, (_, i) => `  [\n    \${${n++}:Spalte ${i + 1}}\n  ],`).join("\n");
  return `#grid(\n  columns: ${cols},\n  gutter: 1em,\n${cells}\n)`;
}

/** Rough check whether `pos` is inside `$…$` (counts unescaped dollars before it). */
function inMath(text: string, pos: number): boolean {
  let count = 0;
  for (let i = 0; i < pos; i++) {
    const c = text[i];
    if (c === "\\") i++;
    else if (c === "$") count++;
  }
  return count % 2 === 1;
}

/** Tab-expansion: `tbl3x4`, `mat2x2`, `grid3` and every snippet label. */
export function expandAbbreviation(view: EditorView): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const before = line.text.slice(0, sel.head - line.from);

  const m = before.match(/(?:^|[^\w])(#?)([a-zäöü]+)(\d{0,2})(?:x(\d{1,2}))?$/i);
  if (!m) return false;
  const [, hash, word, a, b] = m;
  const typed = hash + word + a + (b ? "x" + b : "");
  const from = sel.head - typed.length;
  let body: string | null = null;

  const r = Number(a);
  const c = Number(b);
  if ((word === "tbl" || word === "tab") && a && b && r > 0 && c > 0 && r <= 30 && c <= 15) {
    body = tableSnippet(r, c);
  } else if (word === "mat" && a && b && r > 0 && c > 0 && r <= 10 && c <= 10) {
    body = matrixSnippet(r, c);
    if (!inMath(state.doc.toString(), from)) body = `$ ${body} $`;
  } else if (word === "grid" && a && !b && r > 1 && r <= 6) {
    body = gridSnippet(r);
  } else if (!a && !b) {
    const def = SNIPPETS.find((s) => s.label === word);
    if (def) {
      body = def.body;
      if (def.group === "Mathe" && def.label !== "einheit" && !def.body.startsWith("$") && !inMath(state.doc.toString(), from)) {
        body = `$${body}$`;
      }
    }
  }
  if (body == null) return false;
  // The typed text (including a leading `#`, if any) is replaced entirely.
  snippet(body)(view, null as never, from, sel.head);
  return true;
}

/** Wraps the selection (or inserts an empty pair) with the given markers. */
export function wrapSelection(view: EditorView, left: string, right = left): boolean {
  const changes = view.state.changeByRange((range) => {
    const text = view.state.sliceDoc(range.from, range.to);
    return {
      changes: { from: range.from, to: range.to, insert: left + text + right },
      range: range.empty
        ? { anchor: range.from + left.length, head: range.from + left.length }
        : { anchor: range.from + left.length, head: range.to + left.length },
    } as never;
  });
  view.dispatch(view.state.update(changes, { scrollIntoView: true, userEvent: "input" }));
  return true;
}

/**
 * Converts a Markdown-style pipe table around the cursor into `#table(...)`.
 *
 *   | Größe | Formel |
 *   |-------|:------:|
 *   | Kraft | F = m a |
 */
export function convertPipeTable(view: EditorView): boolean {
  const { state } = view;
  const doc = state.doc;
  const sel = state.selection.main;
  const isRow = (n: number) => n >= 1 && n <= doc.lines && doc.line(n).text.trim().startsWith("|");
  let first = doc.lineAt(sel.from).number;
  let last = doc.lineAt(sel.to).number;
  if (!isRow(first)) return false;
  while (isRow(first - 1)) first--;
  while (isRow(last + 1)) last++;

  const split = (t: string) => {
    let s = t.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).map((c) => c.trim());
  };
  const isSep = (cells: string[]) => cells.every((c) => /^:?-{1,}:?$/.test(c));

  const rows: string[][] = [];
  let header: string[] | null = null;
  let aligns: string[] | null = null;
  for (let n = first; n <= last; n++) {
    const cells = split(doc.line(n).text);
    if (isSep(cells)) {
      if (rows.length === 1 && !header) header = rows.pop()!;
      aligns = cells.map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left"));
      continue;
    }
    rows.push(cells);
  }
  const cols = Math.max(header?.length ?? 0, ...rows.map((r) => r.length));
  if (cols === 0) return false;
  const pad = (r: string[]) => [...r, ...Array(cols - r.length).fill("")];
  const indent = doc.line(first).text.match(/^\s*/)![0];
  const lines = [`${indent}#table(`, `${indent}  columns: ${cols},`];
  if (aligns && aligns.some((a) => a !== "left")) lines.push(`${indent}  align: (${pad(aligns).map((a) => a || "left").join(", ")}),`);
  if (header) lines.push(`${indent}  table.header${pad(header).map((c) => `[${c}]`).join("")},`);
  for (const r of rows) lines.push(`${indent}  ${pad(r).map((c) => `[${c}]`).join(", ")},`);
  lines.push(`${indent})`);

  const from = doc.line(first).from;
  const to = doc.line(last).to;
  view.dispatch({ changes: { from, to, insert: lines.join("\n") }, userEvent: "input" });
  return true;
}
