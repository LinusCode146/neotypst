// Werkzeuge, die in den Editor-Text schreiben: Bilder, Formatieren,
// Tabellen- und Matrix-Editor, Symbole, Grafiken und Literatur.

import { useCallback, useState, type RefObject } from "react";
import { api, type BibOverview } from "../api";
import type { EditorHandle } from "../editor/Editor";
import type { GraphicBlock } from "../graphics";
import { emptyMatrix, generateMatrix, parseMatrix, type MatrixGrid } from "../MatrixEditor";
import type { SymbolEntry } from "../symbolData";
import { emptyGrid, generate, gridFromModel } from "../TableEditor";
import type { Toast } from "./types";

export function useEditorTools({
  editor,
  currentRef,
  main,
  refreshFiles,
  requestCompile,
  showToast,
}: {
  editor: RefObject<EditorHandle | null>;
  currentRef: RefObject<string | null>;
  main: string;
  refreshFiles(): Promise<void>;
  requestCompile(): void;
  showToast(t: Toast, ms?: number): void;
}) {
  const [tableEdit, setTableEdit] = useState<{
    grid: ReturnType<typeof emptyGrid>;
    isNew: boolean;
    from: number;
    to: number;
    hash: boolean;
    indent: string;
  } | null>(null);

  const [matEdit, setMatEdit] = useState<{
    grid: MatrixGrid;
    isNew: boolean;
    from: number;
    to: number;
    indent: string;
    /** Not inside a formula: wrap the result in `$ … $`. */
    wrap: boolean;
  } | null>(null);

  /** Path of `rel` as it would be written in the current file (`#image(…)`, `#include …`). */
  const pathFromCurrent = useCallback((rel: string) => {
    const from = (currentRef.current ?? main).split("/").slice(0, -1);
    const to = rel.split("/");
    let k = 0;
    while (k < from.length && k < to.length - 1 && from[k] === to[k]) k++;
    return [...Array(from.length - k).fill(".."), ...to.slice(k)].join("/");
  }, [main]);

  const insertImages = useCallback(
    (rels: string[]) => {
      const body = rels
        .map(pathFromCurrent)
        .map((r, i) => `#figure(\n  image("${r}", width: \${${i * 2 + 1}:70%}),\n  caption: [\${${i * 2 + 2}:Beschriftung}],\n)`)
        .join("\n\n");
      editor.current?.insertSnippet(body + "\n");
    },
    [pathFromCurrent],
  );

  /** ⌘V with an image on the clipboard: save it in assets/ and insert a figure. */
  const pasteImages = useCallback(
    async (images: File[]) => {
      if (!currentRef.current?.endsWith(".typ")) return;
      try {
        const rels: string[] = [];
        for (const f of images) rels.push(await api.saveAsset(f.name || "image.png", f));
        await refreshFiles();
        insertImages(rels);
        showToast({ text: `Gespeichert: ${rels.join(", ")}` }, 2500);
      } catch (e) {
        showToast({ text: `Bild konnte nicht gespeichert werden: ${e}`, kind: "error" });
      }
    },
    [insertImages, refreshFiles, showToast],
  );

  /** ⌥⇧F: format the selection, or the whole file without one. */
  const formatDocument = useCallback(async () => {
    const ed = editor.current;
    const rel = currentRef.current;
    if (!ed || !rel?.endsWith(".typ")) return;
    const text = ed.getText();
    const sel = ed.selection();
    const ranged = sel.to > sel.from;
    try {
      const res = await api.formatTypst(text, ranged ? sel.from : undefined, ranged ? sel.to : undefined);
      if (ed.getText() !== text) return; // typed meanwhile
      if (!res) {
        showToast({ text: ranged ? "Auswahl ist schon formatiert" : "Schon formatiert" }, 1500);
        return;
      }
      ed.applyEdit(res.from, res.to, res.text);
    } catch (e) {
      showToast({ text: String(e), kind: "error" }, 4000);
    }
  }, [showToast]);

  /** Matrix editor: edits the `mat(…)`/`vec(…)` at the cursor or inserts a new one. */
  const openMatrixEditor = useCallback(async () => {
    const ed = editor.current;
    if (!ed) return;
    const offset = ed.cursor();
    const text = ed.getText();
    const found = await api.matrixAt(text, offset).catch(() => null);
    if (found) {
      setMatEdit({ grid: parseMatrix(found.func, found.args), isNew: false, from: found.from, to: found.to, indent: ed.indentAt(found.from), wrap: false });
      return;
    }
    const mode = await api.modeAt(text, offset).catch(() => "markup" as const);
    setMatEdit({ grid: emptyMatrix(3, 3), isNew: true, from: offset, to: offset, indent: ed.indentAt(offset), wrap: mode !== "math" });
  }, []);

  const applyMatrix = useCallback(
    (grid: MatrixGrid) => {
      const m = matEdit;
      const ed = editor.current;
      setMatEdit(null);
      if (!m || !ed) return;
      let code = generateMatrix(grid, m.indent);
      if (m.isNew) {
        const before = ed.charBefore(m.from);
        if (m.wrap) code = `$ ${code} $`;
        else if (before && /[\p{L}\p{N})\]]/u.test(before)) code = " " + code;
      }
      ed.replaceRange(m.from, m.to, code);
      ed.focus();
    },
    [matEdit],
  );

  /** ⌘T: matrix editor inside a formula, table editor everywhere else. */
  const openGridEditor = useCallback(async () => {
    const ed = editor.current;
    if (!ed) return;
    const offset = ed.cursor();
    const text = ed.getText();
    const [found, mode] = await Promise.all([
      api.matrixAt(text, offset).catch(() => null),
      api.modeAt(text, offset).catch(() => "markup" as const),
    ]);
    if (found || mode === "math") openMatrixEditor();
    else openTableEditor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMatrixEditor]);

  const openTableEditor = useCallback(async () => {
    const ed = editor.current;
    if (!ed) return;
    const offset = ed.cursor();
    const res = await api.tableAt(ed.getText(), offset).catch(() => ({ status: "none" as const }));
    if (res.status === "ok") {
      setTableEdit({
        grid: gridFromModel(res),
        isNew: false,
        from: res.from,
        to: res.to,
        hash: ed.charBefore(res.from + 1) === "#",
        indent: ed.indentAt(res.from),
      });
    } else {
      if (res.status === "unsupported") {
        showToast({ text: `Diese Tabelle kann nicht grafisch bearbeitet werden: ${res.reason}. Neue Tabelle wird eingefügt.` }, 6000);
      }
      setTableEdit({ grid: emptyGrid(3, 3), isNew: true, from: offset, to: offset, hash: true, indent: ed.indentAt(offset) });
    }
  }, [showToast]);

  const applyTable = useCallback(
    (grid: ReturnType<typeof emptyGrid>) => {
      const t = tableEdit;
      const ed = editor.current;
      setTableEdit(null);
      if (!t || !ed) return;
      let code = generate(grid, { hash: t.hash, indent: t.indent });
      if (t.isNew) {
        const lineBefore = ed.getText().slice(0, t.from).split("\n").pop() ?? "";
        if (lineBefore.trim() !== "") code = "\n\n" + t.indent + code;
        else code = code;
      }
      ed.replaceRange(t.from, t.to, code);
    },
    [tableEdit],
  );

  /** Inserts a symbol so that it works where the cursor is (math, text or code). */
  const insertSymbol = useCallback(async (e: SymbolEntry) => {
    const ed = editor.current;
    if (!ed) return;
    const pos = ed.cursor();
    const text = ed.getText();
    const mode = await api.modeAt(text, pos).catch(() => "markup" as const);
    if (e.snippet) {
      ed.insertSnippet(mode === "math" ? e.snippet : "$" + e.snippet + "$");
      return;
    }
    let t = mode === "math" ? e.name : mode === "code" ? "sym." + e.name : "$" + e.name + "$";
    if (mode === "math") {
      const wordChar = /[\p{L}\p{N}]/u;
      if (wordChar.test(ed.charBefore(pos))) t = " " + t;
      if (wordChar.test(text.charAt(pos))) t = t + " ";
    }
    ed.insertText(t);
  }, []);

  /** Inserts a graphic block; adds missing `#import`s at the top of the file. */
  const insertGraphic = useCallback((g: GraphicBlock) => {
    const ed = editor.current;
    if (!ed) return;
    const text = ed.getText();
    const missing = g.imports.filter((imp) => {
      const spec = imp.match(/"(@[^"]+)"/)?.[1];
      return spec ? !text.includes(spec) : !text.includes(imp);
    });
    if (missing.length) {
      const lines = text.split("\n");
      let lastImport = -1;
      lines.forEach((l, i) => {
        if (/^#import\s/.test(l)) lastImport = i;
      });
      let pos = 0;
      let insert = missing.join("\n") + "\n";
      if (lastImport >= 0) {
        pos = lines.slice(0, lastImport + 1).join("\n").length;
        insert = "\n" + missing.join("\n");
      } else {
        insert += "\n";
      }
      ed.insertAtKeepCursor(pos, insert);
    }
    const cur = ed.cursor();
    const now = ed.getText();
    const lineStart = now.lastIndexOf("\n", cur - 1) + 1;
    const prefix = now.slice(lineStart, cur).trim() ? "\n\n" : "";
    ed.insertSnippet(prefix + g.body + "\n");
  }, []);


  /** Applies a text transformation to a project file (through the editor if it is open). */
  const editFileText = useCallback(
    async (rel: string, fn: (text: string) => string) => {
      const ed = editor.current;
      if (ed && rel === currentRef.current) {
        const old = ed.getText();
        const next = fn(old);
        if (next === old) return;
        // Replace only the changed middle part so the cursor and undo stay sane.
        let a = 0;
        while (a < old.length && a < next.length && old[a] === next[a]) a++;
        let b = 0;
        while (b < old.length - a && b < next.length - a && old[old.length - 1 - b] === next[next.length - 1 - b]) b++;
        ed.replaceRangeKeepCursor(a, old.length - b, next.slice(a, next.length - b));
      } else {
        const old = await api.readFile(rel);
        await api.writeFile(rel, fn(old));
        requestCompile();
      }
    },
    [requestCompile],
  );

  const citeKey = useCallback((key: string, supplement?: string) => {
    const ed = editor.current;
    if (!ed) return;
    const pos = ed.cursor();
    const before = ed.charBefore(pos);
    const space = before && !/[\s(\[~]/.test(before) ? " " : "";
    ed.insertText(`${space}@${key}${supplement ? `[${supplement}]` : ""}`);
  }, []);

  const addBibEntry = useCallback(
    async (bibtex: string, target: string, ov: BibOverview) => {
      await api.bibAppend(target, bibtex);
      if (!ov.call_file) {
        await editFileText(main, (t) => t.replace(/\s*$/, "") + `\n\n#bibliography("${target}", title: [Literatur])\n`);
        showToast({ text: `${target} angelegt und #bibliography am Ende von ${main} eingefügt` }, 5000);
      }
      refreshFiles();
      requestCompile();
    },
    [editFileText, main, refreshFiles, requestCompile, showToast],
  );

  const setBibStyle = useCallback(
    async (style: string, ov: BibOverview) => {
      if (!ov.call_file) return;
      await editFileText(ov.call_file, (t) => {
        const start = t.indexOf("bibliography(");
        if (start < 0) return t;
        // Find the matching close paren of the call.
        let depth = 0;
        let end = -1;
        for (let i = start + "bibliography".length; i < t.length; i++) {
          if (t[i] === "(") depth++;
          else if (t[i] === ")" && --depth === 0) {
            end = i;
            break;
          }
        }
        if (end < 0) return t;
        let args = t.slice(start + "bibliography(".length, end);
        if (/style:\s*"[^"]*"/.test(args)) {
          args = style ? args.replace(/style:\s*"[^"]*"/, `style: "${style}"`) : args.replace(/,?\s*style:\s*"[^"]*"/, "");
        } else if (style) {
          args = args.replace(/\s*,?\s*$/, "") + `, style: "${style}"`;
        }
        return t.slice(0, start) + "bibliography(" + args + t.slice(end);
      });
      requestCompile();
    },
    [editFileText, requestCompile],
  );

  return {
    tableEdit, setTableEdit, matEdit, setMatEdit, pathFromCurrent, insertImages, pasteImages, formatDocument,
    openMatrixEditor, applyMatrix, openGridEditor, openTableEditor, applyTable, insertSymbol, insertGraphic,
    editFileText, citeKey, addBibEntry, setBibStyle,
  };
}
