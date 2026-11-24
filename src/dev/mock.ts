// Browser-only mock of the Tauri backend, used to work on the UI in a normal
// browser (`npm run dev`). Never loaded inside the app or in production builds.
import fixture from "./fixture.json";
import musterPdf from "./muster.pdf?url";
import musterPng from "./muster.png?url";

const templates = [
  { id: "arbeitsblatt", name: "Arbeitsblatt", description: "Aufgaben mit Punkten, Rechenplatz und ein-/ausblendbaren Lösungen.", category: "Mathe & Physik" },
  { id: "hausaufgabe", name: "Hausaufgabe", description: "Abgabe mit Aufgabenstellung, Lösungsweg und markierten Ergebnissen.", category: "Mathe & Physik" },
  { id: "wettbewerb", name: "Wettbewerb", description: "Olympiade-Format: jede Aufgabe auf eigener Seite, Behauptung und Beweis.", category: "Mathe & Physik" },
  { id: "dokumentation", name: "Dokumentation", description: "Deckblatt, Inhaltsverzeichnis, Codeblöcke und Hinweiskästen.", category: "Informatik" },
  { id: "leer", name: "Leeres Dokument", description: "Nur die Grundeinstellungen: A4, Deutsch, Blocksatz.", category: "Allgemein" },
];

const now = Date.now() / 1000;
let files: { path: string; kind: string }[] = [
  { path: "main.typ", kind: "typ" },
  { path: "assets/schiefe-ebene.png", kind: "image" },
  { path: "out/main.pdf", kind: "pdf" },
  { path: "templates/arbeitsblatt.typ", kind: "typ" },
  { path: "assets", kind: "dir" },
  { path: "out", kind: "dir" },
  { path: "templates", kind: "dir" },
];
const kindOf = (p: string) =>
  /\.typ$/.test(p) ? "typ" : /\.(png|jpe?g|svg|gif|webp)$/i.test(p) ? "image" : /\.pdf$/.test(p) ? "pdf" : /\.(bib|csv|txt|md|json|ya?ml|toml)$/.test(p) ? "text" : "other";
const exists = (p: string) => files.some((f) => f.path === p);
const under = (p: string, dir: string) => p === dir || p.startsWith(dir + "/");
const trash = new Map<string, { path: string; kind: string }[]>();

const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
  projects_dir: () => "/Users/du/Documents/Typst",
  list_projects: () => [
    { name: "Physik Blatt 3 – Kinematik", path: "/p/1", modified: now - 600, files: 6 },
    { name: "Analysis Hausaufgabe 5", path: "/p/2", modified: now - 86400 * 2, files: 3 },
    { name: "Doku Sortieralgorithmen", path: "/p/3", modified: now - 86400 * 9, files: 12 },
  ],
  list_templates: () => (fixture as unknown as { templates: unknown }).templates ?? templates,
  template_preview: ({ id }) => (fixture as unknown as { previews: Record<string, string> }).previews[id as string] ?? "",
  templates_dir: () => "/Users/du/Documents/Typst/_Vorlagen",
  save_as_template: () => "/Users/du/Documents/Typst/_Vorlagen/x",
  create_project: () => "/p/new",
  open_project: () => ({ root: "/p/1", name: "Physik Blatt 3 – Kinematik", main: "main.typ", files }),
  close_project: () => null,
  list_files: () => files,
  create_file: ({ rel }) => {
    if (exists(rel as string)) throw "Datei existiert bereits";
    files = [...files, { path: rel as string, kind: kindOf(rel as string) }];
    return null;
  },
  create_dir: ({ rel }) => {
    if (exists(rel as string)) throw "Ordner existiert bereits";
    files = [...files, { path: rel as string, kind: "dir" }];
    return null;
  },
  rename_file: ({ from, to }) => {
    if (exists(to as string)) throw "Ziel existiert bereits";
    const f = from as string;
    files = files.map((e) => (under(e.path, f) ? { ...e, path: (to as string) + e.path.slice(f.length) } : e));
    return null;
  },
  duplicate_file: ({ rel }) => {
    const r = rel as string;
    const m = /^(.*?)(\.[^./]+)?$/.exec(r)!;
    let n = 1;
    let t = "";
    do t = `${m[1]} kopie${n > 1 ? " " + n : ""}${m[2] ?? ""}`, n++; while (exists(t));
    files = [...files, ...files.filter((e) => under(e.path, r)).map((e) => ({ ...e, path: t + e.path.slice(r.length) }))];
    return t;
  },
  trash_file: ({ rel }) => {
    const id = "/Users/du/.Trash/" + rel + "-" + Date.now();
    trash.set(id, files.filter((e) => under(e.path, rel as string)));
    files = files.filter((e) => !under(e.path, rel as string));
    return id;
  },
  restore_file: ({ trashed }) => {
    files = [...files, ...(trash.get(trashed as string) ?? [])];
    return null;
  },
  absolute_path: ({ rel }) => "/Users/du/Documents/Typst/Physik/" + rel,
  read_file: () => disk,
  read_bytes: async ({ rel }) => (await fetch(/\.pdf$/.test(rel as string) ? musterPdf : musterPng)).arrayBuffer(),
  open_text: () => ({ text: disk, hash: mockHash(disk) }),
  file_hash: () => mockHash(disk),
  write_file: ({ text, expected }) => {
    if (expected != null && expected !== mockHash(disk)) throw "konflikt: Die Datei wurde außerhalb von NeoTypst geändert";
    disk = text as string;
    return mockHash(disk);
  },
  history_list: () => verlauf.map((v, i) => ({ id: `${v.zeit}_${v.grund}.txt`, zeit: v.zeit, grund: v.grund, bytes: v.text.length, i })),
  history_read: ({ id }) => verlauf.find((v) => id === `${v.zeit}_${v.grund}.txt`)?.text ?? "",
  stil_status: () => mockStil,
  stil_bundled: () => disk.replace("#import", "// neotypst-stil 0.5.0\n#import"),
  stil_update: ({ paths }) => {
    mockStil = mockStil.map((d) => ((paths as string[]).includes(d.path) ? { ...d, status: "aktuell", version: "0.5.0" } : d));
    return paths;
  },
  stil_scan_all: () => [
    { name: "Physik Blatt 3 – Kinematik", path: "/mock/a", veraltet: ["templates/stil.typ", "templates/arbeitsblatt.typ"], angepasst: [] },
    { name: "Doku Sortieralgorithmen", path: "/mock/b", veraltet: ["templates/stil.typ"], angepasst: ["templates/dokumentation.typ"] },
  ],
  stil_update_project: ({ paths }) => paths,
  history_snapshot: ({ text, reason }) => {
    verlauf.unshift({ zeit: Date.now(), grund: reason as string, text: text as string });
    return true;
  },
  compile: () => fixture.compile,
  highlight: () => fixture.highlight,
  jump_from_cursor: () => [{ page: 0, x: 120, y: 260 }],
  jump_from_click: () => ({ kind: "file", file: "main.typ", offset: 200 }),
  complete: () => ({
    from: 0,
    items: [
      { kind: "func", label: "table", apply: "table(${})", detail: "A table of items." },
      { kind: "func", label: "text", apply: "text(${})", detail: "Customizes the look and layout of text." },
    ],
  }),
  forget_preview: () => null,
  symbols: () => (fixture as unknown as { symbols: unknown }).symbols,
  mode_at: () => "math",
  // Stand-in for the parser-based lookup: innermost mat(/vec( around the cursor.
  matrix_at: ({ text, offset }) => {
    const t = text as string;
    const o = offset as number;
    const re = /\b(mat|vec)\(/g;
    let best: { from: number; to: number; func: string; args: string } | null = null;
    for (let m; (m = re.exec(t)); ) {
      let depth = 0;
      let end = -1;
      for (let i = m.index + m[1].length; i < t.length; i++) {
        if (t[i] === "(") depth++;
        else if (t[i] === ")" && --depth === 0) {
          end = i + 1;
          break;
        }
      }
      if (end > 0 && o >= m.index && o <= end) best = { from: m.index, to: end, func: m[1], args: t.slice(m.index + m[1].length + 1, end - 1) };
    }
    return best;
  },
  // Rough stand-in: the real check resolves scopes in Rust.
  math_word: ({ text, offset }) => {
    const t = (text as string).slice(0, offset as number);
    const m = /(\p{L}{2,})$/u.exec(t);
    if (!m || (t.split("$").length - 1) % 2 === 0) return null;
    const syms = (fixture as unknown as { symbols: [string, string][] }).symbols.map((s) => s[0].split(".")[0]);
    const known = new Set([...syms, "sin", "cos", "tan", "log", "ln", "exp", "lim", "sum", "frac", "sqrt", "vec"]);
    return { from: (offset as number) - m[1].length, to: offset, known: known.has(m[1]) };
  },
  render_snippet: ({ key }) => (fixture as unknown as { graphics: Record<string, string> }).graphics?.[key as string] ?? "",
  spellcheck: ({ text }) => {
    const t = text as string;
    const i = t.indexOf("beschleunigter");
    return { issues: i >= 0 ? [{ from: i, to: i + 14, word: "beschleunigter", lang: "de", suggestions: ["beschleunigte", "beschleunigten"] }] : [], dominant: "de", pending: false };
  },
  learn_word: () => null,
  bib_overview: () => ({
    files: ["literatur.bib"],
    target: "literatur.bib",
    call_file: "main.typ",
    style: "ieee",
    errors: [],
    entries: [
      { key: "einstein1935can", kind: "article", title: "Can Quantum-Mechanical Description of Physical Reality Be Considered Complete?", authors: ["A. Einstein", "B. Podolsky", "N. Rosen"], year: 1935, container: "Physical Review", file: "literatur.bib" },
      { key: "knuth1997art", kind: "book", title: "The Art of Computer Programming", authors: ["Donald Knuth"], year: 1997, container: null, file: "literatur.bib" },
      { key: "tipler2019physik", kind: "book", title: "Physik für Studierende der Naturwissenschaften und Technik", authors: ["Paul A. Tipler", "Gene Mosca"], year: 2019, container: null, file: "literatur.bib" },
    ],
  }),
  bib_lookup: () => ({
    bibtex: "@article{feynman1948space,\n  title={Space-Time Approach to Non-Relativistic Quantum Mechanics},\n  author={Feynman, R. P.},\n  journal={Reviews of Modern Physics},\n  year={1948}\n}",
    entry: { key: "feynman1948space", kind: "article", title: "Space-Time Approach to Non-Relativistic Quantum Mechanics", authors: ["R. P. Feynman"], year: 1948, container: "Reviews of Modern Physics", file: "" },
  }),
  bib_append: () => null,
  bib_styles: () => [["ieee", "IEEE – nummeriert [1]"], ["apa", "APA – Autor (Jahr)"], ["iso-690-numeric", "ISO 690 (DIN) – nummeriert"]],
  bib_make_key: () => "neu2024quelle",
  table_at: () => ({
    status: "ok",
    from: 0,
    to: 0,
    columns: 4,
    columns_raw: null,
    align: null,
    align_all: "center",
    header: ["$t$ in s", "$0$", "$4$", "$8$"],
    cells: ["$s$ in m", "$0$", "", ""],
    extra: [],
  }),
  save_asset: (args) => {
    let n = 1;
    while (exists(`assets/bild-${n}.png`)) n++;
    const rel = `assets/bild-${n}.png`;
    files = [...files, { path: rel, kind: "image" }];
    console.info("[mock] save_asset", (args as unknown as Uint8Array).length, "bytes →", rel);
    return rel;
  },
  // Rough stand-in for typstyle: spaces around `=` in #let and after commas in calls.
  format_typst: ({ text, from, to }) => {
    const t = text as string;
    const [a, b] = from != null && to != null ? [from as number, to as number] : [0, t.length];
    const out = t
      .slice(a, b)
      .split("\n")
      .map((l) => l.replace(/\s+$/, "").replace(/^(#let [\w-]+(?:\([^)]*\))?)\s*=\s*/, "$1 = ").replace(/,(?=\S)/g, ", "))
      .join("\n");
    return out === t.slice(a, b) ? null : { from: a, to: b, text: out };
  },
  export_pdf: ({ target }) => [(target as string | undefined) ?? "/Users/du/Documents/Typst/Physik/out/main.pdf"],
  "plugin:path|resolve_directory": () => "/Users/du/Downloads",
  "plugin:path|join": ({ paths }) => (paths as string[]).join("/"),
  "plugin:dialog|save": (args) => {
    console.info("[mock] save dialog", JSON.stringify(args));
    return (args as { options: { defaultPath: string } }).options.defaultPath;
  },
  "plugin:event|listen": () => 1,
  "plugin:event|unlisten": () => null,
};

// Platte und Verlauf im Speicher. `__mockAussen("…")` in der Konsole
// simuliert eine Änderung von außen.
let disk = fixture.main;
const mockHash = (t: string) => String(t.length) + ":" + [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
const verlauf: { zeit: number; grund: string; text: string }[] = [
  { zeit: Date.now() - 4 * 60_000, grund: "auto", text: fixture.main.replace(/\n[^\n]*$/, "") },
  { zeit: Date.now() - 50 * 60_000, grund: "loeschung", text: fixture.main + "\n\n= Beispielaufgabe\n\nDrei Münzen werden geworfen …\n" },
  { zeit: Date.now() - 26 * 3600_000, grund: "auto", text: "= Erster Entwurf\n" },
];
(window as unknown as Record<string, unknown>).__mockAussen = (t: string) => (disk = t);

let mockStil = [
  { path: "templates/stil.typ", status: "veraltet", version: null as string | null },
  { path: "templates/arbeitsblatt.typ", status: "angepasst", version: "0.4.0" },
];

let cb = 0;
(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  invoke: async (cmd: string, args: Record<string, unknown>) => {
    const h = handlers[cmd];
    if (!h) {
      console.warn("[mock] unhandled", cmd, args);
      return null;
    }
    return h(args);
  },
  transformCallback: () => ++cb,
  unregisterCallback: () => {},
  metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
};
(window as unknown as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
