import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "./api";
import { Icon } from "./icons";

export type Delim = "(" | "[" | "{" | "|" | "||" | "none";

export type MatrixGrid = {
  kind: "mat" | "vec";
  rows: string[][];
  delim: Delim;
  /** Vertical line after this many columns (augmented matrix), or null. */
  augment: number | null;
  /** Named arguments the editor doesn't model (gap, align, …), kept verbatim. */
  extra: [string, string][];
  multiline: boolean;
};

const DELIMS: { d: Delim; label: string; title: string }[] = [
  { d: "(", label: "( )", title: "Runde Klammern" },
  { d: "[", label: "[ ]", title: "Eckige Klammern" },
  { d: "{", label: "{ }", title: "Geschweifte Klammern" },
  { d: "|", label: "| |", title: "Betragsstriche (Determinante)" },
  { d: "||", label: "‖ ‖", title: "Doppelstriche (Norm)" },
  { d: "none", label: "keine", title: "Ohne Klammern" },
];
const NAMED = /^(delim|augment|gap|row-gap|column-gap|align)\s*:\s*([\s\S]+)$/;

/** Splits at `sep` on the top level (outside brackets and strings). */
export function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "\\") i++;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
    else if (ch === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

export function emptyMatrix(rows = 3, cols = 3, kind: "mat" | "vec" = "mat"): MatrixGrid {
  return {
    kind,
    rows: Array.from({ length: rows }, () => Array(kind === "vec" ? 1 : cols).fill("")),
    delim: "(",
    augment: null,
    extra: [],
    multiline: kind === "mat" && rows > 1,
  };
}

/** Reads the raw argument text of `mat(...)` / `vec(...)`. */
export function parseMatrix(func: string, args: string): MatrixGrid {
  const kind = func === "vec" ? "vec" : "mat";
  const named: [string, string][] = [];
  const takeCells = (row: string) => {
    const cells = splitTop(row, ",").map((c) => c.trim());
    if (cells.length > 1 && cells[cells.length - 1] === "") cells.pop(); // trailing comma
    return cells.filter((c) => {
      const m = NAMED.exec(c);
      if (m) named.push([m[1], m[2].trim()]);
      return !m;
    });
  };
  let rows: string[][];
  if (kind === "vec") {
    rows = takeCells(args).map((c) => [c]);
  } else {
    const raw = splitTop(args, ";");
    if (raw.length > 1 && raw[raw.length - 1].trim() === "") raw.pop();
    rows = raw.map(takeCells).filter((r) => r.length > 0);
  }
  rows = rows.map((r) => r.map((c) => (c === '""' ? "" : c)));
  const cols = Math.max(1, ...rows.map((r) => r.length));
  rows = rows.map((r) => [...r, ...Array(cols - r.length).fill("")]);
  if (rows.length === 0) rows = [Array(cols).fill("")];

  let delim: Delim = "(";
  let augment: number | null = null;
  const extra: [string, string][] = [];
  for (const [k, v] of named) {
    if (k === "delim") {
      const s = v.replace(/^#/, "");
      const d = s === "none" ? "none" : s.replace(/^"|"$/g, "");
      if (DELIMS.some((x) => x.d === d)) delim = d as Delim;
      else if (d === "‖") delim = "||";
      else extra.push([k, v]);
    } else if (k === "augment" && /^#?-?\d+$/.test(v)) {
      const n = parseInt(v.replace("#", ""), 10);
      const k2 = n < 0 ? cols + n : n;
      if (k2 > 0 && k2 < cols) augment = k2;
    } else extra.push([k, v]);
  }
  return { kind, rows, delim, augment, extra, multiline: args.includes("\n") };
}

/** Turns the grid back into Typst math. */
export function generateMatrix(g: MatrixGrid, indent: string): string {
  const cols = g.rows[0]?.length ?? 1;
  const named: string[] = [];
  if (g.delim !== "(") named.push(g.delim === "none" ? "delim: #none" : `delim: "${g.delim === "||" ? "‖" : g.delim}"`);
  if (g.kind === "mat" && g.augment && g.augment < cols) named.push(`augment: #${g.augment}`);
  for (const [k, v] of g.extra) named.push(`${k}: ${v}`);
  const cell = (c: string) => (c.trim() === "" ? '""' : c.trim());
  const rows = g.rows.map((r) => r.map(cell));

  if (g.kind === "vec") {
    const items = [...named, ...rows.map((r) => r[0])];
    if (!g.multiline) return `vec(${items.join(", ")})`;
    return `vec(\n${items.map((x) => `${indent}  ${x},`).join("\n")}\n${indent})`;
  }
  if (!g.multiline) {
    const body = rows.map((r) => r.join(", ")).join("; ");
    return `mat(${named.length ? named.join(", ") + ", " : ""}${body})`;
  }
  // Pad columns so the source reads like the matrix.
  const width = Array.from({ length: cols }, (_, c) => Math.max(...rows.map((r) => [...r[c]].length)));
  const line = (r: string[]) =>
    r.map((c, i) => (i < cols - 1 ? (c + ",").padEnd(width[i] + 1) : c)).join(" ").trimEnd() + ";";
  return ["mat(", ...named.map((n) => `${indent}  ${n},`), ...rows.map((r) => `${indent}  ${line(r)}`), `${indent})`].join("\n");
}

type Props = {
  initial: MatrixGrid;
  isNew: boolean;
  onApply(g: MatrixGrid): void;
  onClose(): void;
};

export function MatrixEditor({ initial, isNew, onApply, onClose }: Props) {
  const [g, setG] = useState<MatrixGrid>(initial);
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const [preview, setPreview] = useState<{ svg?: string; error?: string }>({});
  const refs = useRef(new Map<string, HTMLInputElement>());
  const cols = g.rows[0]?.length ?? 1;
  const square = g.rows.length === cols;

  useLayoutEffect(() => {
    const el = refs.current.get(`${focus[0]}:${focus[1]}`);
    if (el && document.activeElement !== el) {
      el.focus();
      el.select();
    }
  }, [focus, g.rows.length, cols]);

  // Live preview, rendered by Typst.
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      api
        .renderSnippet(`$ ${generateMatrix(g, "")} $`)
        .then((svg) => alive && setPreview({ svg }))
        .catch((e) => alive && setPreview((p) => ({ svg: p.svg, error: String(e) })));
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [g]);

  const update = (fn: (d: MatrixGrid) => void) =>
    setG((prev) => {
      const d: MatrixGrid = { ...prev, rows: prev.rows.map((r) => [...r]), extra: [...prev.extra] };
      fn(d);
      const n = d.rows[0]?.length ?? 1;
      if (n > 1) d.kind = "mat";
      if (d.augment !== null && d.augment >= n) d.augment = null;
      return d;
    });

  const setCell = (r: number, c: number, v: string) => update((d) => void (d.rows[r][c] = v));
  const addRow = (at = g.rows.length) => update((d) => void d.rows.splice(at, 0, Array(d.rows[0].length).fill("")));
  const addCol = (at = cols) =>
    update((d) => {
      d.rows.forEach((r) => r.splice(at, 0, ""));
      if (d.augment !== null && at <= d.augment) d.augment++;
    });
  const delRow = (r: number) => update((d) => void (d.rows.length > 1 && d.rows.splice(r, 1)));
  const delCol = (c: number) =>
    update((d) => {
      if (d.rows[0].length <= 1) return;
      d.rows.forEach((r) => r.splice(c, 1));
      if (d.augment !== null && c < d.augment) d.augment--;
      if (d.augment === 0) d.augment = null;
    });
  const identity = () => update((d) => d.rows.forEach((r, i) => r.forEach((_, j) => (r[j] = i === j ? "1" : "0"))));

  const move = (r: number, c: number) => {
    if (r >= g.rows.length) addRow();
    setFocus([Math.max(0, r), Math.max(0, Math.min(c, cols - 1))]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const el = e.currentTarget;
    if (e.key === "Enter" && e.metaKey) {
      e.preventDefault();
      onApply(g);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (c > 0) move(r, c - 1);
        else if (r > 0) move(r - 1, cols - 1);
      } else if (c < cols - 1) move(r, c + 1);
      else move(r + 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      move(r + 1, e.shiftKey ? c : 0);
    } else if (e.key === "ArrowUp" && r > 0) {
      e.preventDefault();
      move(r - 1, c);
    } else if (e.key === "ArrowDown" && r < g.rows.length - 1) {
      e.preventDefault();
      move(r + 1, c);
    } else if (e.key === "ArrowLeft" && el.selectionStart === 0 && el.selectionEnd === 0 && c > 0) {
      e.preventDefault();
      move(r, c - 1);
    } else if (e.key === "ArrowRight" && el.selectionStart === el.value.length && c < cols - 1) {
      e.preventDefault();
      move(r, c + 1);
    } else if (e.key === "Backspace" && e.metaKey && e.shiftKey) {
      e.preventDefault();
      delRow(r);
      setFocus([Math.max(0, r - 1), c]);
    }
  };

  /** Pasting a block (spreadsheet, CSV, or whitespace-separated numbers) fills the grid. */
  const onPaste = (e: React.ClipboardEvent, r0: number, c0: number) => {
    const text = e.clipboardData.getData("text/plain").replace(/\r/g, "").trim();
    if (!/[\t\n;]/.test(text) && !/\S\s+\S/.test(text)) return;
    e.preventDefault();
    const lines = text.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
    const cells = lines.map((l) => (l.includes("\t") ? l.split("\t") : l.includes(",") ? l.split(",") : l.split(/\s+/)).map((s) => s.trim()));
    update((d) => {
      const need = c0 + Math.max(...cells.map((r) => r.length));
      while (d.rows[0].length < need) d.rows.forEach((row) => row.push(""));
      while (d.rows.length < r0 + cells.length) d.rows.push(Array(d.rows[0].length).fill(""));
      cells.forEach((row, i) => row.forEach((v, j) => (d.rows[r0 + i][c0 + j] = v)));
    });
  };

  const title = g.kind === "vec" ? "Vektor" : "Matrix";
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog table-dialog matrix-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head table-head">
          <div>
            <h2>{isNew ? `Neue ${title}` : `${title} bearbeiten`}</h2>
            <p>Tab / Enter springen weiter · Zellen sind Typst-Mathe (x^2, 1/2, alpha) · Einfügen aus Excel, Numbers oder Text</p>
          </div>
        </div>
        <div className="table-toolbar">
          <div className="segmented" title="Typ">
            <button className={g.kind === "mat" ? "on" : ""} onClick={() => update((d) => void (d.kind = "mat"))}>
              Matrix
            </button>
            <button
              className={g.kind === "vec" ? "on" : ""}
              disabled={cols > 1}
              title={cols > 1 ? "Ein Vektor hat nur eine Spalte" : "vec(…)"}
              onClick={() => update((d) => void (d.kind = "vec"))}
            >
              Vektor
            </button>
          </div>
          <div className="segmented" title="Klammern">
            {DELIMS.map((x) => (
              <button key={x.d} title={x.title} className={g.delim === x.d ? "on" : ""} onClick={() => update((d) => void (d.delim = x.d))}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="grow" />
          <span className="dim">
            {g.rows.length} × {cols}
          </span>
          {square && cols > 1 && (
            <button className="btn" title="Einsen auf der Diagonale, sonst Nullen" onClick={identity}>
              Einheitsmatrix
            </button>
          )}
          <button className="btn" onClick={() => addRow()}>
            <Icon.plus /> Zeile
          </button>
          <button className="btn" onClick={() => addCol()}>
            <Icon.plus /> Spalte
          </button>
        </div>
        <div className="dialog-body table-body matrix-body">
          <table className="grid-editor matrix-grid">
            <thead>
              <tr>
                <th />
                {g.rows[0].map((_, c) => (
                  <th key={c}>
                    <div className="col-tools">
                      {g.kind === "mat" && c < cols - 1 && (
                        <button
                          className={"mini" + (g.augment === c + 1 ? " on" : "")}
                          title="Trennstrich nach dieser Spalte (erweiterte Matrix, z. B. für LGS)"
                          onClick={() => update((d) => void (d.augment = d.augment === c + 1 ? null : c + 1))}
                        >
                          ┃
                        </button>
                      )}
                      <button className="mini" title="Spalte davor einfügen" onClick={() => addCol(c)}>
                        <Icon.plus />
                      </button>
                      <button className="mini danger" title="Spalte löschen" onClick={() => delCol(c)} disabled={cols <= 1}>
                        ×
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.rows.map((row, r) => (
                <tr key={r}>
                  <td className="row-tools">
                    <button className="mini danger" title="Zeile löschen (⌘⇧⌫)" onClick={() => delRow(r)} disabled={g.rows.length <= 1}>
                      ×
                    </button>
                  </td>
                  {row.map((v, c) => (
                    <td
                      key={c}
                      className={(focus[0] === r && focus[1] === c ? "focused" : "") + (g.kind === "mat" && g.augment === c + 1 ? " augment" : "")}
                    >
                      <input
                        ref={(el) => {
                          const k = `${r}:${c}`;
                          if (el) refs.current.set(k, el);
                          else refs.current.delete(k);
                        }}
                        spellCheck={false}
                        value={v}
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
          <div className={"matrix-preview" + (preview.error ? " stale" : "")} title={preview.error}>
            {preview.svg ? <div dangerouslySetInnerHTML={{ __html: preview.svg }} /> : <span className="dim">Vorschau …</span>}
          </div>
        </div>
        <div className="dialog-foot">
          <button className={"toggle" + (g.multiline ? " on" : "")} onClick={() => update((d) => void (d.multiline = !d.multiline))}>
            <span className="knob" /> Mehrzeilig im Code
          </button>
          <div className="grow" />
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={() => onApply(g)}>
            {isNew ? "Einfügen" : "Übernehmen"} <kbd className="on-primary">⌘↩</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
