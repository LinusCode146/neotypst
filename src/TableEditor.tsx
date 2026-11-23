import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { kbd, modKey } from "./platform";

/** What the Rust side reads from an existing `#table(...)`. */
export type TableModel = {
  from: number;
  to: number;
  columns: number;
  columns_raw: string | null;
  align: string[] | null;
  align_all: string | null;
  header: string[] | null;
  cells: string[];
  extra: [string, string][];
};

type Align = "left" | "center" | "right";
type Lines = "gitter" | "waagerecht" | "keine" | "eigene";

type Grid = {
  cols: number;
  header: boolean;
  rows: string[][];
  align: Align[];
  lines: Lines;
  /** Kept verbatim: column widths (if count unchanged), unknown named args. */
  columnsRaw: string | null;
  origCols: number;
  extra: [string, string][];
  customStroke: string | null;
};

const ALIGNS: Align[] = ["left", "center", "right"];
const BOOKTABS = /^\(_, y\) =>/;

export function emptyGrid(rows = 3, cols = 3): Grid {
  return {
    cols,
    header: true,
    rows: Array.from({ length: rows }, () => Array(cols).fill("")),
    align: Array(cols).fill("left"),
    lines: "gitter",
    columnsRaw: null,
    origCols: cols,
    extra: [],
    customStroke: null,
  };
}

export function gridFromModel(m: TableModel): Grid {
  const cols = Math.max(1, m.columns);
  const rows: string[][] = [];
  if (m.header) rows.push(pad(m.header.slice(0, cols), cols));
  for (let i = 0; i < m.cells.length; i += cols) rows.push(pad(m.cells.slice(i, i + cols), cols));
  if (rows.length === 0) rows.push(Array(cols).fill(""));

  let align: Align[] = Array(cols).fill("left");
  const extra = [...m.extra];
  if (m.align) {
    align = pad(m.align, cols).map((a) => (ALIGNS.includes(a as Align) ? (a as Align) : "left"));
  } else if (m.align_all) {
    if (ALIGNS.includes(m.align_all as Align)) align = Array(cols).fill(m.align_all);
    else extra.push(["align", m.align_all]);
  }

  let lines: Lines = "gitter";
  let customStroke: string | null = null;
  const si = extra.findIndex(([k]) => k === "stroke");
  if (si >= 0) {
    const s = extra[si][1].trim();
    extra.splice(si, 1);
    if (s === "none") lines = "keine";
    else if (BOOKTABS.test(s)) lines = "waagerecht";
    else {
      lines = "eigene";
      customStroke = s;
    }
  }
  return { cols, header: !!m.header, rows, align, lines, columnsRaw: m.columns_raw, origCols: cols, extra, customStroke };
}

function pad<T>(arr: T[], n: number, fill = "" as T): T[] {
  return arr.length >= n ? arr.slice(0, n) : [...arr, ...Array(n - arr.length).fill(fill)];
}

/** Turns the grid back into Typst code. */
export function generate(g: Grid, opts: { hash: boolean; indent: string }): string {
  const i1 = opts.indent + "  ";
  const out: string[] = [`${opts.hash ? "#" : ""}table(`];
  out.push(`${i1}columns: ${g.columnsRaw && g.cols === g.origCols ? g.columnsRaw : g.cols},`);
  if (g.align.some((a) => a !== "left")) {
    const same = g.align.every((a) => a === g.align[0]);
    out.push(`${i1}align: ${same ? g.align[0] : `(${g.align.join(", ")})`},`);
  }
  const nRows = g.rows.length;
  if (g.lines === "keine") out.push(`${i1}stroke: none,`);
  if (g.lines === "waagerecht") {
    out.push(
      `${i1}stroke: (_, y) => (top: if y == 0 { 1pt } else if y == ${g.header ? 1 : 0} { 0.5pt } else { 0pt }, bottom: if y == ${nRows - 1} { 1pt } else { 0pt }),`,
    );
  }
  if (g.lines === "eigene" && g.customStroke) out.push(`${i1}stroke: ${g.customStroke},`);
  for (const [k, v] of g.extra) out.push(`${i1}${k}: ${v},`);
  const cell = (c: string) => `[${c}]`;
  g.rows.forEach((row, r) => {
    if (r === 0 && g.header) out.push(`${i1}table.header${row.map(cell).join("")},`);
    else out.push(`${i1}${row.map(cell).join(", ")},`);
  });
  out.push(`${opts.indent})`);
  return out.join("\n");
}

type Props = {
  initial: Grid;
  isNew: boolean;
  onApply(grid: Grid): void;
  onClose(): void;
};

export function TableEditor({ initial, isNew, onApply, onClose }: Props) {
  const [g, setG] = useState<Grid>(initial);
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());

  // Move DOM focus whenever the logical focus changes.
  useLayoutEffect(() => {
    const el = refs.current.get(`${focus[0]}:${focus[1]}`);
    if (el && document.activeElement !== el) {
      el.focus();
      el.select();
    }
  }, [focus, g.rows.length, g.cols]);

  // Auto-grow textareas.
  useEffect(() => {
    refs.current.forEach((el) => {
      el.style.height = "0";
      el.style.height = el.scrollHeight + "px";
    });
  });

  const update = (fn: (d: Grid) => void) =>
    setG((prev) => {
      const d: Grid = { ...prev, rows: prev.rows.map((r) => [...r]), align: [...prev.align], extra: [...prev.extra] };
      fn(d);
      return d;
    });

  const setCell = (r: number, c: number, v: string) => update((d) => void (d.rows[r][c] = v));
  const addRow = (at = g.rows.length) =>
    update((d) => void d.rows.splice(at, 0, Array(d.cols).fill("")));
  const addCol = (at = g.cols) =>
    update((d) => {
      d.rows.forEach((r) => r.splice(at, 0, ""));
      d.align.splice(at, 0, d.align[Math.max(0, at - 1)] ?? "left");
      d.cols++;
    });
  const delRow = (r: number) =>
    update((d) => {
      if (d.rows.length > 1) d.rows.splice(r, 1);
    });
  const delCol = (c: number) =>
    update((d) => {
      if (d.cols <= 1) return;
      d.rows.forEach((r) => r.splice(c, 1));
      d.align.splice(c, 1);
      d.cols--;
    });
  const cycleAlign = (c: number) =>
    update((d) => void (d.align[c] = ALIGNS[(ALIGNS.indexOf(d.align[c]) + 1) % 3]));

  const move = (r: number, c: number) => {
    if (r >= g.rows.length) {
      addRow();
    }
    setFocus([Math.max(0, r), Math.max(0, Math.min(c, g.cols - 1))]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, r: number, c: number) => {
    const el = e.currentTarget;
    if (e.key === "Enter" && modKey(e)) {
      e.preventDefault();
      onApply(g);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (c > 0) move(r, c - 1);
        else if (r > 0) move(r - 1, g.cols - 1);
      } else if (c < g.cols - 1) move(r, c + 1);
      else move(r + 1, 0);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      move(r + 1, c);
    } else if (e.key === "ArrowUp" && !el.value.slice(0, el.selectionStart).includes("\n") && r > 0) {
      e.preventDefault();
      move(r - 1, c);
    } else if (e.key === "ArrowDown" && !el.value.slice(el.selectionEnd).includes("\n") && r < g.rows.length - 1) {
      e.preventDefault();
      move(r + 1, c);
    } else if (e.key === "ArrowLeft" && el.selectionStart === 0 && el.selectionEnd === 0 && c > 0) {
      e.preventDefault();
      move(r, c - 1);
    } else if (e.key === "ArrowRight" && el.selectionStart === el.value.length && c < g.cols - 1) {
      e.preventDefault();
      move(r, c + 1);
    } else if (e.key === "Backspace" && modKey(e) && e.shiftKey) {
      e.preventDefault();
      delRow(r);
      setFocus([Math.max(0, r - 1), c]);
    }
  };

  /** Pasting several cells (from Excel, Numbers, CSV or a Markdown table) fills the grid. */
  const onPaste = (e: React.ClipboardEvent, r0: number, c0: number) => {
    const text = e.clipboardData.getData("text/plain").replace(/\r/g, "").replace(/\n+$/, "");
    const isMd = /^\s*\|.*\|\s*$/m.test(text);
    if (!text.includes("\t") && !text.includes("\n") && !isMd) return;
    e.preventDefault();
    let rows = text.split("\n");
    let cells: string[][];
    if (isMd) {
      rows = rows.filter((l) => !/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l));
      cells = rows.map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((s) => s.trim()));
    } else if (text.includes("\t")) {
      cells = rows.map((l) => l.split("\t").map((s) => s.trim()));
    } else {
      const sep = text.includes(";") ? ";" : ",";
      cells = rows.map((l) => l.split(sep).map((s) => s.trim()));
    }
    update((d) => {
      const needCols = c0 + Math.max(...cells.map((r) => r.length));
      while (d.cols < needCols) {
        d.rows.forEach((row) => row.push(""));
        d.align.push(d.align[d.align.length - 1] ?? "left");
        d.cols++;
      }
      while (d.rows.length < r0 + cells.length) d.rows.push(Array(d.cols).fill(""));
      cells.forEach((row, i) => row.forEach((v, j) => (d.rows[r0 + i][c0 + j] = v)));
    });
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog table-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head table-head">
          <div>
            <h2>{isNew ? "Neue Tabelle" : "Tabelle bearbeiten"}</h2>
            <p>Tab / Enter springen weiter · Shift+Enter neue Zeile in der Zelle · Einfügen aus Excel, Numbers oder Markdown</p>
          </div>
        </div>
        <div className="table-toolbar">
          <button className={"toggle" + (g.header ? " on" : "")} onClick={() => update((d) => void (d.header = !d.header))}>
            <span className="knob" /> Kopfzeile
          </button>
          <div className="segmented" title="Linien">
            {(["gitter", "waagerecht", "keine"] as Lines[]).map((l) => (
              <button key={l} className={g.lines === l ? "on" : ""} onClick={() => update((d) => void (d.lines = l))}>
                <LinesIcon kind={l} />
                {l === "gitter" ? "Gitter" : l === "waagerecht" ? "Waagerecht" : "Keine"}
              </button>
            ))}
            {g.customStroke && (
              <button className={g.lines === "eigene" ? "on" : ""} onClick={() => update((d) => void (d.lines = "eigene"))}>
                Eigene
              </button>
            )}
          </div>
          <div className="grow" />
          <span className="dim">
            {g.rows.length} × {g.cols}
          </span>
          <button className="btn" onClick={() => addRow()}>
            <Icon.plus /> Zeile
          </button>
          <button className="btn" onClick={() => addCol()}>
            <Icon.plus /> Spalte
          </button>
        </div>
        <div className="dialog-body table-body">
          <table className="grid-editor">
            <thead>
              <tr>
                <th />
                {g.align.map((a, c) => (
                  <th key={c}>
                    <div className="col-tools">
                      <button className="mini" title="Ausrichtung ändern" onClick={() => cycleAlign(c)}>
                        <AlignIcon a={a} />
                      </button>
                      <button className="mini" title="Spalte davor einfügen" onClick={() => addCol(c)}>
                        <Icon.plus />
                      </button>
                      <button className="mini danger" title="Spalte löschen" onClick={() => delCol(c)} disabled={g.cols <= 1}>
                        ×
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.rows.map((row, r) => (
                <tr key={r} className={r === 0 && g.header ? "is-header" : ""}>
                  <td className="row-tools">
                    <button className="mini danger" title={kbd("Zeile löschen (⌘⇧⌫)")} onClick={() => delRow(r)} disabled={g.rows.length <= 1}>
                      ×
                    </button>
                  </td>
                  {row.map((v, c) => (
                    <td key={c} className={focus[0] === r && focus[1] === c ? "focused" : ""}>
                      <textarea
                        ref={(el) => {
                          const k = `${r}:${c}`;
                          if (el) refs.current.set(k, el);
                          else refs.current.delete(k);
                        }}
                        rows={1}
                        spellCheck={false}
                        value={v}
                        style={{ textAlign: g.align[c] }}
                        placeholder={r === 0 && g.header ? `Spalte ${c + 1}` : ""}
                        onFocus={() => setFocus([r, c])}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        onKeyDown={(e) => onKey(e, r, c)}
                        onPaste={(e) => onPaste(e, r, c)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button className="add-row" onClick={() => addRow()}>
            <Icon.plus /> Zeile hinzufügen
          </button>
        </div>
        <div className="dialog-foot">
          <span className="dim">Zellen sind Typst-Markup: $x^2$, *fett*, _kursiv_</span>
          <div className="grow" />
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={() => onApply(g)}>
            {isNew ? "Einfügen" : "Übernehmen"} <kbd style={{ background: "transparent", color: "inherit", borderColor: "rgba(255,255,255,.35)" }}>{kbd("⌘↩")}</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

function AlignIcon({ a }: { a: Align }) {
  const lines = a === "left" ? [[4, 16], [4, 12], [4, 18]] : a === "center" ? [[4, 20], [7, 17], [5, 19]] : [[8, 20], [12, 20], [6, 20]];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      {lines.map(([x1, x2], i) => (
        <path key={i} d={`M${x1} ${7 + i * 5}H${x2}`} />
      ))}
    </svg>
  );
}

function LinesIcon({ kind }: { kind: Lines }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {kind === "gitter" && (
        <>
          <rect x="4" y="5" width="16" height="14" />
          <path d="M4 10h16M4 14.5h16M12 5v14" />
        </>
      )}
      {kind === "waagerecht" && <path d="M4 5h16M4 10h16M4 19h16" strokeWidth="1.5" />}
      {kind === "keine" && <path d="M4 5h16M4 10h16M4 14.5h16M4 19h16" strokeDasharray="1.5 2.5" opacity="0.6" />}
    </svg>
  );
}
