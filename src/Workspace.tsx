import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";

import { api, type BibOverview, type CompileOut, type Diag, type FileEntry, type OpenedProject } from "./api";
import { LiteratureDialog } from "./LiteratureDialog";
import { Editor, type EditorHandle } from "./editor/Editor";
import { SNIPPETS, matrixSnippet, tableSnippet } from "./editor/snippets";
import { Icon } from "./icons";
import { Palette, type PaletteItem } from "./Palette";
import { Preview, type Marker, type PageView, type PreviewHandle } from "./Preview";
import { getSettings, setSettings, useSettings } from "./settings";

const getSettingsSpell = () => getSettings().spell;
import { TableEditor, emptyGrid, generate, gridFromModel } from "./TableEditor";
import { FileTree, fileIcon, type MenuItem, type TreeActions } from "./FileTree";
import { MatrixEditor, emptyMatrix, generateMatrix, parseMatrix, type MatrixGrid } from "./MatrixEditor";
import { SymbolPalette } from "./SymbolPalette";
import { GraphicsGallery } from "./GraphicsGallery";
import { SearchPanel } from "./SearchPanel";
import { beforeRestart, checkForUpdate } from "./updater";
import { GRAPHICS, type GraphicBlock } from "./graphics";
import type { SymbolEntry } from "./symbolData";
import { isMac, kbd, modKey } from "./platform";
import { outlineOf } from "./outline";

type Toast = { text: string; kind?: "error"; actions?: { label: string; run(): void }[] };
type Menu = { x: number; y: number; items: MenuItem[] };

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp)$/i;


export function Workspace({ project, onClose }: { project: OpenedProject; onClose(): void }) {
  const settings = useSettings();
  const editor = useRef<EditorHandle>(null);
  const preview = useRef<PreviewHandle>(null);

  const [files, setFiles] = useState<FileEntry[]>(project.files);
  const [main, setMain] = useState(project.main);
  const [current, setCurrent] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pages, setPages] = useState<PageView[]>([]);
  const [diags, setDiags] = useState<Diag[]>([]);
  const [millis, setMillis] = useState<number | null>(null);
  const [compiling, setCompiling] = useState(true);
  const [marker, setMarker] = useState<Marker | null>(null);
  const [solutions, setSolutions] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [palette, setPalette] = useState<null | "all" | "files">(null);
  const [showProblems, setShowProblems] = useState(false);
  const [vimMode, setVimMode] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [menu, setMenu] = useState<Menu | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [split, setSplit] = useState(() => Number(localStorage.getItem("neotypst.split")) || 0.5);
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [graphicsOpen, setGraphicsOpen] = useState(false);
  const [litOpen, setLitOpen] = useState(false);
  const [saveTpl, setSaveTpl] = useState<{ name: string; description: string; error?: string } | null>(null);
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

  const [searchOpen, setSearchOpen] = useState<{ n: number; initial: string } | null>(null);
  const openSearch = useCallback(() => {
    if (!getSettings().sidebar) setSettings({ sidebar: true });
    const sel = editor.current?.selection();
    const picked = sel && sel.to > sel.from ? editor.current!.getText().slice(sel.from, sel.to) : "";
    setSearchOpen((s) => ({ n: (s?.n ?? 0) + 1, initial: picked && !picked.includes("\n") ? picked : "" }));
  }, []);

  const [treeRequest, setTreeRequest] = useState<{ kind: "file" | "dir"; n: number } | null>(null);
  const requestTree = useCallback((kind: "file" | "dir") => {
    if (!getSettings().sidebar) setSettings({ sidebar: true });
    setTreeRequest((r) => ({ kind, n: (r?.n ?? 0) + 1 }));
  }, []);

  const svgCache = useRef(new Map<string, string>());
  const latest = useRef<{ rel: string; text: string } | null>(null);
  const compileFlags = useRef({ inflight: false, pending: false });
  const unsaved = useRef(new Map<string, string>());
  const saveTimer = useRef<number | undefined>(undefined);
  const lastEdit = useRef(0);
  const cursorTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);
  const currentRef = useRef<string | null>(null);
  currentRef.current = current;

  const showToast = useCallback((t: Toast, ms = 3500) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  // ---------- Spelling ----------

  const projectWords = useRef<string[]>([]);
  const ignoredWords = useRef(new Set<string>());
  const [spellInfo, setSpellInfo] = useState<{ count: number; dominant: string | null }>({ count: 0, dominant: null });
  const spellTimer = useRef<number | undefined>(undefined);
  const spellRun = useRef(0);

  useEffect(() => {
    api
      .readFile(".neotypst-woerter.txt")
      .then((t) => (projectWords.current = t.split("\n").map((w) => w.trim()).filter(Boolean)))
      .catch(() => (projectWords.current = []));
  }, [project.root]);

  const runSpell = useCallback(() => {
    const ed = editor.current;
    const rel = currentRef.current;
    if (!ed || !rel) return;
    const mode = getSettingsSpell();
    if (mode === "off" || !rel.endsWith(".typ")) {
      ed.setSpelling([]);
      setSpellInfo({ count: 0, dominant: null });
      return;
    }
    const text = ed.getText();
    const run = ++spellRun.current;
    api
      .spellcheck(text, mode, projectWords.current)
      .then((r) => {
        // Drop stale results: a newer check is coming.
        if (run !== spellRun.current || editor.current?.getText() !== text) return;
        const issues = r.issues.filter((i) => !ignoredWords.current.has(i.word.toLowerCase()));
        editor.current?.setSpelling(issues);
        setSpellInfo({ count: issues.length, dominant: r.dominant });
      })
      .catch(() => {});
  }, []);

  const scheduleSpell = useCallback(
    (delay = 600) => {
      window.clearTimeout(spellTimer.current);
      spellTimer.current = window.setTimeout(runSpell, delay);
    },
    [runSpell],
  );

  useEffect(() => {
    scheduleSpell(50);
  }, [settings.spell, current, scheduleSpell]);

  const onSpellAction = useCallback(
    async (action: "learn" | "project" | "ignore", word: string) => {
      if (action === "learn") {
        await api.learnWord(word).catch(() => {});
        showToast({ text: `„${word}“ wurde zum macOS-Wörterbuch hinzugefügt` });
      } else if (action === "project") {
        projectWords.current = [...new Set([...projectWords.current, word])].sort((a, b) => a.localeCompare(b));
        await api.writeFile(".neotypst-woerter.txt", projectWords.current.join("\n") + "\n").catch(() => {});
        showToast({ text: `„${word}“ ist in diesem Projekt erlaubt` });
      } else {
        ignoredWords.current.add(word.toLowerCase());
      }
      runSpell();
    },
    [runSpell, showToast],
  );

  const SPELL_MODES = ["auto", "de", "en", "off"] as const;
  const spellLabel = (m: string) => ({ auto: "Automatisch", de: "Deutsch", en: "Englisch", off: "Aus" })[m] ?? m;

  // ---------- Compile ----------

  const applyResult = useCallback((out: CompileOut) => {
    setMillis(out.millis);
    setDiags(out.diagnostics);
    editor.current?.setDiagnostics(out.diagnostics);
    if (!out.pages) return;
    const cache = svgCache.current;
    let missing = false;
    const next = out.pages.map((p) => {
      if (p.svg != null) cache.set(p.hash, p.svg);
      const svg = p.svg ?? cache.get(p.hash);
      if (svg == null) missing = true;
      return { hash: p.hash, svg: svg ?? "", width: p.width, height: p.height };
    });
    // Drop SVGs for pages that no longer exist.
    const keep = new Set(next.map((p) => p.hash));
    for (const k of cache.keys()) if (!keep.has(k)) cache.delete(k);
    setPages(next);
    if (missing) {
      api.forgetPreview().then(() => requestCompile());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestCompile = useCallback(() => {
    const flags = compileFlags.current;
    if (flags.inflight) {
      flags.pending = true;
      return;
    }
    flags.inflight = true;
    setCompiling(true);
    const job = latest.current;
    api
      .compile(job?.rel, job?.text)
      .then(applyResult)
      .catch((e) => showToast({ text: String(e), kind: "error" }))
      .finally(() => {
        flags.inflight = false;
        setCompiling(false);
        if (flags.pending) {
          flags.pending = false;
          requestCompile();
        }
      });
  }, [applyResult, showToast]);

  // ---------- Files ----------

  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const entries = [...unsaved.current.entries()];
    unsaved.current.clear();
    for (const [rel, t] of entries) {
      try {
        await api.writeFile(rel, t);
      } catch (e) {
        unsaved.current.set(rel, t);
        showToast({ text: `Speichern fehlgeschlagen: ${e}`, kind: "error" });
      }
    }
    setDirty(unsaved.current.size > 0);
  }, [showToast]);

  const refreshFiles = useCallback(async () => {
    setFiles(await api.listFiles());
  }, []);

  // Pick up files added or removed in the Finder when coming back to the app.
  useEffect(() => {
    const onFocus = () => void refreshFiles().catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshFiles]);

  const openFile = useCallback(
    async (rel: string, reveal?: number) => {
      if (rel === currentRef.current) {
        if (reveal != null) editor.current?.reveal(reveal);
        return;
      }
      await flushSave();
      try {
        const t = await api.readFile(rel);
        editor.current?.openFile(rel, t);
        setCurrent(rel);
        setText(t);
        latest.current = { rel, text: t };
        editor.current?.setDiagnostics(diagsRef.current);
        if (reveal != null) editor.current?.reveal(reveal);
      } catch (e) {
        showToast({ text: `Datei kann nicht geöffnet werden: ${e}`, kind: "error" });
      }
    },
    [flushSave, showToast],
  );
  const diagsRef = useRef<Diag[]>([]);
  diagsRef.current = diags;

  // Initial load.
  useEffect(() => {
    svgCache.current.clear();
    openFile(project.main).then(() => requestCompile());
    return () => {
      flushSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.root]);

  // Save before the window closes / reloads.
  useEffect(() => {
    const onBlur = () => flushSave();
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBlur);
    };
  }, [flushSave]);

  const onChange = useCallback(
    (rel: string, t: string) => {
      lastEdit.current = Date.now();
      setText(t);
      latest.current = { rel, text: t };
      unsaved.current.set(rel, t);
      setDirty(true);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flushSave, 700);
      requestCompile();
      scheduleSpell();
    },
    [flushSave, requestCompile, scheduleSpell],
  );

  const cursorOffset = useRef(0);
  const onCursor = useCallback((rel: string, offset: number, line: number, col: number) => {
    setCursor({ line, col });
    cursorOffset.current = offset;
    window.clearTimeout(cursorTimer.current);
    // Die Vorschau folgt immer der Seite, auf der gerade gearbeitet wird. Beim
    // Tippen erst nach einer kurzen Pause (dann ist neu kompiliert) und ohne
    // Markierung, bei bewussten Cursorbewegungen sofort mit Markierung.
    const typing = Date.now() - lastEdit.current < 120;
    cursorTimer.current = window.setTimeout(async () => {
      const positions = await api.jumpFromCursor(rel, offset).catch(() => []);
      const p = positions[0];
      if (!p) return;
      if (!typing) setMarker({ ...p, key: Date.now() });
      preview.current?.center(p.page, p.y);
    }, typing ? 450 : 180);
  }, []);

  const revealInPreview = useCallback(async () => {
    const rel = currentRef.current;
    if (!rel) return;
    const positions = await api.jumpFromCursor(rel, cursorOffset.current).catch(() => []);
    const p = positions[0];
    if (!p) return;
    setMarker({ ...p, key: Date.now() });
    preview.current?.scrollTo(p.page, p.y, false);
  }, []);

  const onPreviewClick = useCallback(
    async (page: number, x: number, y: number) => {
      const jump = await api.jumpFromClick(page, x, y).catch(() => null);
      if (!jump) return;
      if (jump.kind === "file") openFile(jump.file, jump.offset);
      else if (jump.kind === "url") openUrl(jump.url);
      else preview.current?.scrollTo(jump.page, jump.y, false);
    },
    [openFile],
  );

  // ---------- Actions ----------

  const toggleSolutions = useCallback(async () => {
    const next = !solutions;
    setSolutions(next);
    await api.setSolutions(next);
    requestCompile();
  }, [solutions, requestCompile]);

  const exportPdf = useCallback(
    async (both: boolean) => {
      await flushSave();
      showToast({ text: "Exportiere …" }, 10000);
      try {
        const paths = await api.exportPdf(both);
        const names = paths.map((p) => p.split("/").slice(-2).join("/"));
        showToast(
          {
            text: `Exportiert: ${names.join(", ")}`,
            actions: [
              { label: "Öffnen", run: () => openPath(paths[0]) },
              { label: "Im Finder", run: () => revealItemInDir(paths[0]) },
            ],
          },
          7000,
        );
        refreshFiles();
      } catch (e) {
        showToast({ text: String(e), kind: "error" }, 6000);
      }
    },
    [flushSave, refreshFiles, showToast],
  );

  const setMainFile = useCallback(
    async (rel: string) => {
      await api.setMain(rel);
      setMain(rel);
      svgCache.current.clear();
      requestCompile();
    },
    [requestCompile],
  );

  const createFile = useCallback(
    async (name: string): Promise<string | null> => {
      let rel = name.trim().replace(/^\/+/, "");
      if (!rel) return null;
      if (!/\.\w+$/.test(rel)) rel += ".typ";
      try {
        await api.createFile(rel);
        await refreshFiles();
        if (rel.endsWith(".typ") || /\.(bib|csv|txt|md|json|yml|yaml|toml)$/.test(rel)) openFile(rel);
        return rel;
      } catch (e) {
        showToast({ text: String(e), kind: "error" });
        return null;
      }
    },
    [openFile, refreshFiles, showToast],
  );

  /** Renames or moves a file or folder; keeps open file, main file and editor state in sync. */
  const renameFile = useCallback(
    async (from: string, to: string): Promise<boolean> => {
      to = to.trim().replace(/^\/+|\/+$/g, "");
      if (!to || to === from) return false;
      const mapped = (p: string) => (p === from ? to : p.startsWith(from + "/") ? to + p.slice(from.length) : null);
      try {
        await flushSave();
        await api.renameFile(from, to);
        for (const f of files) if (mapped(f.path)) editor.current?.forgetFile(f.path);
        await refreshFiles();
        const newMain = mapped(main);
        if (newMain) setMainFile(newMain);
        const cur = currentRef.current;
        const newCur = cur ? mapped(cur) : null;
        if (newCur) {
          setCurrent(null);
          currentRef.current = null;
          openFile(newCur);
        }
        return true;
      } catch (e) {
        showToast({ text: String(e), kind: "error" });
        return false;
      }
    },
    [files, flushSave, main, openFile, refreshFiles, setMainFile, showToast],
  );

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

  // ---------- Literature ----------

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

  // Drag & drop of files from Finder.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    getCurrentWebview()
      .onDragDropEvent(async (e) => {
        if (e.payload.type !== "drop") return;
        const paths = e.payload.paths;
        if (paths.length === 0) return;
        const images = paths.filter((p) => IMAGE_EXT.test(p));
        const others = paths.filter((p) => !IMAGE_EXT.test(p));
        try {
          if (images.length) {
            const rels = await api.importFiles(images, "assets");
            insertImages(rels);
          }
          if (others.length) await api.importFiles(others, "");
        } catch (err) {
          showToast({ text: String(err), kind: "error" });
        }
        refreshFiles();
      })
      .then((u) => {
        if (disposed) u();
        else unlisten = u;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      try {
        unlisten?.();
      } catch {
        /* listener already gone */
      }
    };
  }, [insertImages, refreshFiles, showToast]);

  // Save open files before an update restarts the app.
  useEffect(() => {
    beforeRestart.add(flushSave);
    return () => void beforeRestart.delete(flushSave);
  }, [flushSave]);

  const zoom = (z: number) => setSettings({ zoom: Math.min(4, Math.max(0.25, Math.round(z * 1000) / 1000)) });

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!modKey(e)) return;
      // Unter Windows ist die Befehlstaste Strg: Strg-J/K/N/P gehören dann der Vorschlagsliste.
      if (!isMac && document.querySelector(".cm-tooltip-autocomplete")) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        setPalette((p) => (p ? null : "all"));
      } else if (k === "p") {
        e.preventDefault();
        setPalette((p) => (p ? null : "files"));
      } else if (k === "l" && e.altKey) {
        e.preventDefault();
        const order = ["auto", "de", "en"] as const;
        const next = order[(order.indexOf(settings.spell as (typeof order)[number]) + 1) % order.length];
        setSettings({ spell: next });
        showToast({ text: `Rechtschreibung: ${spellLabel(next)}` }, 1500);
      } else if (k === "f" && e.shiftKey && !e.altKey) {
        e.preventDefault();
        openSearch();
      } else if (k === "b" && e.shiftKey) {
        e.preventDefault();
        setLitOpen(true);
      } else if (k === "g" && e.shiftKey) {
        e.preventDefault();
        setGraphicsOpen(true);
      } else if (k === "s" && e.shiftKey) {
        e.preventDefault();
        setSymbolsOpen(true);
      } else if (k === "t" && !e.shiftKey) {
        e.preventDefault();
        if (!tableEdit && !matEdit) openGridEditor();
      } else if (k === "e") {
        e.preventDefault();
        exportPdf(e.shiftKey);
      } else if (k === "l" && e.shiftKey) {
        e.preventDefault();
        toggleSolutions();
      } else if (k === "\\") {
        e.preventDefault();
        setSettings({ sidebar: !settings.sidebar });
      } else if (k === "=" || k === "+") {
        e.preventDefault();
        zoom(settings.zoom * 1.15);
      } else if (k === "-") {
        e.preventDefault();
        zoom(settings.zoom / 1.15);
      } else if (k === "0") {
        e.preventDefault();
        zoom(1);
      } else if (k === "s") {
        e.preventDefault();
        flushSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- Splitter ----------

  const panes = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const rect = panes.current!.getBoundingClientRect();
    const sidebarW = settings.sidebar ? 232 : 0;
    const move = (ev: MouseEvent) => {
      const ratio = (ev.clientX - rect.left - sidebarW) / (rect.width - sidebarW);
      setSplit(Math.min(0.8, Math.max(0.2, ratio)));
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setSplit((s) => {
        localStorage.setItem("neotypst.split", String(s));
        return s;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ---------- Palette ----------

  const paletteItems = useMemo((): PaletteItem[] => {
    const fileItems: PaletteItem[] = files.filter((f) => f.kind !== "dir").map((f) => ({
      id: "file:" + f.path,
      label: f.path,
      group: "Dateien",
      icon: fileIcon(f.kind),
      detail: f.path === main ? "Hauptdatei" : undefined,
      run: () => {
        if (f.kind === "typ" || f.kind === "text") openFile(f.path);
        else if (f.kind === "image") insertImages([f.path]);
        else api.absolutePath(f.path).then(openPath);
      },
    }));
    if (palette === "files") return fileItems;

    const actions: PaletteItem[] = [
      { id: "export", label: "Als PDF exportieren", detail: kbd("⌘E"), group: "Aktionen", icon: <Icon.export />, run: () => exportPdf(false) },
      {
        id: "export-both",
        label: "PDF exportieren: Aufgaben + Lösungen",
        detail: kbd("⌘⇧E"),
        keywords: "beide loesung",
        group: "Aktionen",
        icon: <Icon.export />,
        run: () => exportPdf(true),
      },
      {
        id: "solutions",
        label: solutions ? "Lösungen ausblenden" : "Lösungen einblenden",
        detail: kbd("⌘⇧L"),
        keywords: "loesung",
        group: "Aktionen",
        icon: <Icon.eye />,
        run: toggleSolutions,
      },
      {
        id: "convert-table",
        label: "Markdown-Tabelle in Typst umwandeln",
        detail: kbd("⌘⇧T"),
        keywords: "pipe tabelle",
        group: "Aktionen",
        icon: <Icon.table />,
        run: () => editor.current?.command("convertTable"),
      },
      {
        id: "literature",
        label: "Literatur & Zitate …",
        detail: kbd("⌘⇧B"),
        keywords: "literatur zitat quelle bibliography doi isbn cite bib",
        group: "Aktionen",
        icon: <Icon.book />,
        run: () => setLitOpen(true),
      },
      {
        id: "graphics",
        label: "Grafik einfügen …",
        detail: kbd("⌘⇧G"),
        keywords: "grafik diagramm plot koordinatensystem schaltkreis flussdiagramm",
        group: "Aktionen",
        icon: <Icon.chart />,
        run: () => setGraphicsOpen(true),
      },
      ...GRAPHICS.map((g) => ({
        id: "graphic:" + g.id,
        label: g.label,
        detail: g.category,
        keywords: "grafik " + g.description,
        group: "Einfügen · Grafiken",
        icon: <Icon.chart />,
        run: () => insertGraphic(g),
      })),
      {
        id: "symbols",
        label: "Symbolpalette öffnen",
        detail: kbd("⌘⇧S"),
        keywords: "symbol griechisch pfeil zeichen sonderzeichen",
        group: "Aktionen",
        icon: <Icon.math />,
        run: () => setSymbolsOpen(true),
      },
      {
        id: "table-editor",
        label: "Tabellen-Editor öffnen",
        detail: kbd("⌘T"),
        keywords: "tabelle grid bearbeiten",
        group: "Aktionen",
        icon: <Icon.table />,
        run: openTableEditor,
      },
      {
        id: "matrix-editor",
        label: "Matrix-Editor öffnen",
        detail: kbd("⌘T in Formeln"),
        keywords: "matrix mat vektor vec determinante lgs gauß",
        group: "Aktionen",
        icon: <Icon.table />,
        run: openMatrixEditor,
      },
      {
        id: "save-template",
        label: "Projekt als Vorlage speichern …",
        keywords: "vorlage template",
        group: "Aktionen",
        icon: <Icon.star />,
        run: () => setSaveTpl({ name: project.name, description: "" }),
      },
      {
        id: "project-search",
        label: "Im Projekt suchen und ersetzen",
        detail: kbd("⌘⇧F"),
        keywords: "suchen finden ersetzen replace search alle dateien",
        group: "Aktionen",
        icon: <Icon.search />,
        run: openSearch,
      },
      {
        id: "format",
        label: "Dokument formatieren",
        detail: kbd("⌥⇧F"),
        keywords: "format formatieren aufräumen einrücken typstyle auswahl",
        group: "Aktionen",
        icon: <Icon.code />,
        run: formatDocument,
      },
      {
        id: "update",
        label: "Nach Updates suchen",
        keywords: "update version aktualisieren",
        group: "Aktionen",
        icon: <Icon.bolt />,
        run: () => void checkForUpdate(true),
      },
      { id: "new-file", label: "Neue Datei …", group: "Aktionen", icon: <Icon.plus />, run: () => requestTree("file") },
      { id: "new-dir", label: "Neuer Ordner …", keywords: "ordner verzeichnis", group: "Aktionen", icon: <Icon.folder />, run: () => requestTree("dir") },
      {
        id: "finder",
        label: "Projektordner im Finder zeigen",
        group: "Aktionen",
        icon: <Icon.folderOpen />,
        run: () => revealItemInDir(project.root + "/" + main),
      },
      { id: "home", label: "Zur Projektübersicht", group: "Aktionen", icon: <Icon.home />, run: onClose },
    ];
    const insert: PaletteItem[] = SNIPPETS.map((s) => ({
      id: "snip:" + s.label,
      label: s.detail,
      detail: s.label + " ⇥",
      keywords: s.label + " " + s.group,
      group: "Einfügen · " + s.group,
      icon: s.group === "Tabellen" ? <Icon.table /> : s.group === "Mathe" ? <Icon.math /> : s.group === "Informatik" ? <Icon.code /> : <Icon.bolt />,
      run: () => editor.current?.insertSnippet(s.body),
    }));
    const prefs: PaletteItem[] = [
      ...SPELL_MODES.map((m) => ({
        id: "spell-" + m,
        label: `Rechtschreibung: ${spellLabel(m)}${settings.spell === m ? " ✓" : ""}`,
        detail: m === "auto" ? "Sprache pro Absatz erkennen" : undefined,
        keywords: "rechtschreibung sprache deutsch englisch spell language",
        group: "Einstellungen",
        icon: <Icon.check />,
        run: () => setSettings({ spell: m }),
      })),
      { id: "vim", label: `Vim-Modus ${settings.vim ? "ausschalten" : "einschalten"}`, group: "Einstellungen", icon: <Icon.settings />, run: () => setSettings({ vim: !settings.vim }) },
      { id: "ln", label: `Zeilennummern ${settings.lineNumbers ? "aus" : "an"}`, group: "Einstellungen", icon: <Icon.settings />, run: () => setSettings({ lineNumbers: !settings.lineNumbers }) },
      { id: "mathquote", label: `Text in Formeln automatisch quoten ${settings.mathQuote ? "aus" : "an"}`, group: "Einstellungen", icon: <Icon.settings />, run: () => setSettings({ mathQuote: !settings.mathQuote }) },
      { id: "wrap", label: `Zeilenumbruch ${settings.wrap ? "aus" : "an"}`, group: "Einstellungen", icon: <Icon.settings />, run: () => setSettings({ wrap: !settings.wrap }) },
      { id: "sidebar", label: `Seitenleiste ${settings.sidebar ? "ausblenden" : "einblenden"}`, detail: kbd("⌘\\"), group: "Einstellungen", icon: <Icon.sidebar />, run: () => setSettings({ sidebar: !settings.sidebar }) },
      { id: "font+", label: "Editor-Schrift größer", detail: `${settings.fontSize}px`, group: "Einstellungen", icon: <Icon.zoomIn />, run: () => setSettings({ fontSize: Math.min(24, settings.fontSize + 1) }) },
      { id: "font-", label: "Editor-Schrift kleiner", detail: `${settings.fontSize}px`, group: "Einstellungen", icon: <Icon.zoomOut />, run: () => setSettings({ fontSize: Math.max(10, settings.fontSize - 1) }) },
      { id: "theme-system", label: "Design: wie System", keywords: "theme dark light", group: "Einstellungen", icon: <Icon.settings />, run: () => setSettings({ theme: "system" }) },
      { id: "theme-light", label: "Design: hell", keywords: "theme light", group: "Einstellungen", icon: <Icon.settings />, run: () => setSettings({ theme: "light" }) },
      { id: "theme-dark", label: "Design: dunkel", keywords: "theme dark", group: "Einstellungen", icon: <Icon.settings />, run: () => setSettings({ theme: "dark" }) },
    ];
    return [...actions, ...insert, ...fileItems, ...prefs];
  }, [files, main, palette, solutions, settings, exportPdf, toggleSolutions, openFile, insertImages, onClose, project.root, openTableEditor, openMatrixEditor, openSearch, formatDocument]);

  const dynamicItems = useCallback((q: string): PaletteItem[] => {
    const m = q.match(/^(?:tab(?:elle)?|tbl|mat(?:rix)?)?\s*(\d{1,2})\s*[x×*]\s*(\d{1,2})$/i);
    if (!m) return [];
    const r = Number(m[1]);
    const c = Number(m[2]);
    const isMat = /^mat/i.test(q);
    const items: PaletteItem[] = [
      {
        id: "dyn-table",
        label: `Tabelle mit ${r} Zeilen × ${c} Spalten einfügen`,
        detail: `tbl${r}x${c} ⇥`,
        group: "Einfügen",
        icon: <Icon.table />,
        run: () => editor.current?.insertSnippet(tableSnippet(r, c)),
      },
      {
        id: "dyn-mat",
        label: `Matrix ${r} × ${c} einfügen`,
        detail: `mat${r}x${c} ⇥`,
        group: "Einfügen",
        icon: <Icon.math />,
        run: () => editor.current?.insertSnippet(`$ ${matrixSnippet(r, c)} $`),
      },
    ];
    return isMat ? items.reverse() : items;
  }, []);

  // ---------- Render ----------

  const errors = diags.filter((d) => d.severity === "error");
  const warnings = diags.filter((d) => d.severity === "warning");
  const outline = useMemo(() => outlineOf(text), [text]);
  const firstError = errors[0];


  const treeActions: TreeActions = useMemo(
    () => ({
      open: (rel) => openFile(rel),
      insertImage: (rel) => insertImages([rel]),
      setMain: (rel) => setMainFile(rel),
      openExternal: (rel) => void api.absolutePath(rel).then(openPath),
      reveal: (rel) => (rel ? void api.absolutePath(rel).then(revealItemInDir) : void openPath(project.root)),
      copyPath: (rel) => {
        const p = pathFromCurrent(rel);
        void navigator.clipboard.writeText(p).then(() => showToast({ text: `Pfad kopiert: ${p}` }, 2000));
      },
      createFile,
      createDir: async (rel) => {
        try {
          await api.createDir(rel.trim().replace(/^\/+|\/+$/g, ""));
          await refreshFiles();
          return true;
        } catch (e) {
          showToast({ text: String(e), kind: "error" });
          return false;
        }
      },
      rename: renameFile,
      duplicate: async (rel) => {
        try {
          const copy = await api.duplicateFile(rel);
          await refreshFiles();
          return copy;
        } catch (e) {
          showToast({ text: String(e), kind: "error" });
          return null;
        }
      },
      trash: async (rel) => {
        const inside = (p: string) => p === rel || p.startsWith(rel + "/");
        if (inside(main)) {
          showToast({ text: "Die Hauptdatei kann nicht gelöscht werden. Lege zuerst eine andere .typ-Datei als Hauptdatei fest.", kind: "error" }, 5000);
          return;
        }
        try {
          await flushSave();
          const trashed = await api.trashFile(rel);
          for (const f of files) if (inside(f.path)) editor.current?.forgetFile(f.path);
          if (currentRef.current && inside(currentRef.current)) {
            setCurrent(null);
            currentRef.current = null;
            openFile(main);
          }
          await refreshFiles();
          const name = rel.split("/").pop();
          showToast(
            {
              text: `„${name}“ liegt im Papierkorb`,
              actions: trashed
                ? [{ label: "Rückgängig", run: () => void api.restoreFile(trashed, rel).then(refreshFiles, (e) => showToast({ text: String(e), kind: "error" })) }]
                : undefined,
            },
            7000,
          );
        } catch (e) {
          showToast({ text: String(e), kind: "error" });
        }
      },
      showMenu: (x, y, items) => setMenu({ x, y, items }),
    }),
    [createFile, files, flushSave, insertImages, main, openFile, pathFromCurrent, project.root, refreshFiles, renameFile, setMainFile, showToast],
  );

  return (
    <div className="workspace" onClick={() => menu && setMenu(null)}>
      <div className="titlebar" data-tauri-drag-region>
        <button className="icon-btn" title="Projektübersicht" onClick={onClose}>
          <Icon.home />
        </button>
        <button className={"icon-btn" + (settings.sidebar ? " on" : "")} title={kbd("Seitenleiste (⌘\\)")} onClick={() => setSettings({ sidebar: !settings.sidebar })}>
          <Icon.sidebar />
        </button>
        <div className="crumbs" data-tauri-drag-region>
          <span>{project.name}</span>
          {current && (
            <>
              <span className="sep">/</span>
              <span className="file">{current}</span>
            </>
          )}
          {dirty && <span className="dirty" title="Ungespeicherte Änderungen" />}
        </div>
        <div className="spacer" data-tauri-drag-region />
        <button className="icon-btn" title={kbd("Literatur & Zitate (⌘⇧B)")} onClick={() => setLitOpen(true)}>
          <Icon.book />
        </button>
        <button className="icon-btn" title={kbd("Grafik einfügen (⌘⇧G)")} onClick={() => setGraphicsOpen(true)}>
          <Icon.chart />
        </button>
        <button className="icon-btn" title={kbd("Symbole (⌘⇧S)")} onClick={() => setSymbolsOpen(true)}>
          <Icon.math />
        </button>
        <button className="icon-btn" title={kbd("Tabellen-Editor (⌘T) – in Formeln: Matrix-Editor")} onClick={openGridEditor}>
          <Icon.table />
        </button>
        <button className="btn ghost" onClick={() => setPalette("all")} title="Befehle, Bausteine, Dateien">
          <Icon.search /> <span style={{ color: "var(--muted)" }}>Befehle</span> <kbd>{kbd("⌘K")}</kbd>
        </button>
        <div className="divider" />
        <button className={"toggle" + (solutions ? " on" : "")} onClick={toggleSolutions} title={kbd("Lösungen ein-/ausblenden (⌘⇧L)")}>
          <span className="knob" /> Lösungen
        </button>
        <div className="divider" />
        <div className="group">
          <button className="icon-btn" title={kbd("Verkleinern (⌘−)")} onClick={() => zoom(settings.zoom / 1.15)}>
            <Icon.zoomOut />
          </button>
          <button className="btn ghost zoom-label" style={{ padding: 0 }} title={kbd("An Breite anpassen (⌘0)")} onClick={() => zoom(1)}>
            {Math.round(settings.zoom * 100)}%
          </button>
          <button className="icon-btn" title={kbd("Vergrößern (⌘+)")} onClick={() => zoom(settings.zoom * 1.15)}>
            <Icon.zoomIn />
          </button>
        </div>
        <div className="divider" />
        <button
          className="btn primary"
          onClick={(e) => {
            e.stopPropagation();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({
              x: r.right - 240,
              y: r.bottom + 6,
              items: [
                { label: "PDF exportieren", detail: kbd("⌘E"), run: () => exportPdf(false) },
                { label: "Aufgaben + Lösungen exportieren", detail: kbd("⌘⇧E"), run: () => exportPdf(true) },
                "sep",
                { label: "Ordner „out“ im Finder", run: () => revealItemInDir(project.root + "/out") },
              ],
            });
          }}
        >
          <Icon.export /> Export <Icon.chevronDown />
        </button>
      </div>

      <div className="panes" ref={panes}>
        {settings.sidebar && (
          <aside className="sidebar">
            {searchOpen ? (
              <SearchPanel
                files={files}
                current={current}
                textVersion={text}
                initialQuery={searchOpen.initial}
                focusKey={searchOpen.n}
                liveText={(rel) => (rel === currentRef.current ? (editor.current?.getText() ?? null) : (unsaved.current.get(rel) ?? null))}
                open={async (rel, from, to, focusEditor) => {
                  await openFile(rel);
                  editor.current?.select(from, to, focusEditor);
                }}
                edit={editFileText}
                notify={(msg, undo) => showToast({ text: msg, actions: undo ? [{ label: "Rückgängig", run: undo }] : undefined }, 10000)}
                close={() => {
                  setSearchOpen(null);
                  editor.current?.focus();
                }}
              />
            ) : (
              <FileTree projectRoot={project.root} files={files} current={current} main={main} actions={treeActions} request={treeRequest} />
            )}
            {!searchOpen && outline.length > 0 && (
              <div className="outline">
                <div className="sidebar-head" style={{ paddingLeft: 8 }}>
                  <span>Gliederung</span>
                </div>
                {outline.map((h, i) => (
                  <div
                    key={i}
                    className="outline-row"
                    style={{ paddingLeft: 8 + (h.level - 1) * 12, fontWeight: h.level === 1 ? 500 : 400 }}
                    onClick={() => editor.current?.revealLine(h.line)}
                  >
                    {h.title}
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}

        <section className="editor-pane" style={{ flexBasis: `${split * 100}%` }}>
          <Editor
            ref={editor}
            onChange={onChange}
            onCursor={onCursor}
            onSave={flushSave}
            onRevealInPreview={revealInPreview}
            onVimMode={setVimMode}
            onTableEditor={openGridEditor}
            onSymbols={() => setSymbolsOpen(true)}
            onGraphics={() => setGraphicsOpen(true)}
            onSpellAction={onSpellAction}
            onLiterature={() => setLitOpen(true)}
            onPasteImage={pasteImages}
            onFormat={formatDocument}
          />
          {showProblems && diags.length > 0 && (
            <div className="problems">
              {diags.map((d, i) => (
                <div
                  key={i}
                  className="problem"
                  onClick={() => d.file && d.from != null && openFile(d.file, d.from)}
                >
                  <span className={"dot " + d.severity} />
                  <div>
                    <div className="msg">{d.message}</div>
                    {d.hints.map((h, j) => (
                      <div key={j} className="hint">
                        Tipp: {h}
                      </div>
                    ))}
                  </div>
                  <span className="loc">{d.file ? `${d.file}:${d.line}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className={"splitter" + (dragging ? " dragging" : "")} onMouseDown={startDrag} />

        <div style={{ flexBasis: `${(1 - split) * 100}%`, display: "flex", minWidth: 260, flexGrow: 1, flexShrink: 1 }}>
          <Preview
            ref={preview}
            pages={pages}
            zoom={settings.zoom}
            onZoom={zoom}
            marker={marker}
            loading={compiling}
            error={firstError ? `${firstError.message}${firstError.line ? ` (Zeile ${firstError.line})` : ""}` : null}
            onClick={onPreviewClick}
          />
        </div>
      </div>

      <footer className="statusbar">
        <button className="item" onClick={() => setShowProblems((s) => !s)} title="Probleme anzeigen">
          {errors.length === 0 && warnings.length === 0 ? (
            <span className="okc">✓ Keine Fehler</span>
          ) : (
            <>
              {errors.length > 0 && <span className="err">● {errors.length} Fehler</span>}
              {warnings.length > 0 && <span className="warn">▲ {warnings.length} Warnung{warnings.length > 1 ? "en" : ""}</span>}
            </>
          )}
        </button>
        <span className="item">{compiling ? "kompiliert …" : millis != null ? `${millis} ms` : ""}</span>
        <span className="item">
          {pages.length} Seite{pages.length === 1 ? "" : "n"}
        </span>
        <span className="grow" />
        <button
          className="item spell-item"
          title={kbd("Rechtschreibung: Sprache wählen (⌥⌘L wechselt)")}
          onClick={(e) => {
            e.stopPropagation();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({
              x: r.left,
              y: r.top - 8 - 4 * 28 - 10,
              items: SPELL_MODES.map((m) => ({
                label: (settings.spell === m ? "✓ " : "   ") + spellLabel(m),
                detail: m === "auto" ? "pro Absatz erkannt" : undefined,
                run: () => setSettings({ spell: m }),
              })),
            });
          }}
        >
          <span className="abc">ABC</span>
          {settings.spell === "off"
            ? "Aus"
            : settings.spell === "auto"
              ? `Auto${spellInfo.dominant ? " · " + spellInfo.dominant.toUpperCase() : ""}`
              : settings.spell.toUpperCase()}
          {settings.spell !== "off" && spellInfo.count > 0 && <span className="spell-count">{spellInfo.count}</span>}
        </button>
        {vimMode && <span className="item vim">{vimMode.toUpperCase()}</span>}
        <span className="item">
          Z {cursor.line}, S {cursor.col}
        </span>
        <span className="item">{dirty ? "Ungespeichert" : "Gespeichert"}</span>
      </footer>

      {palette && (
        <Palette
          items={paletteItems}
          dynamic={palette === "all" ? dynamicItems : undefined}
          placeholder={palette === "files" ? "Datei öffnen …" : "Befehl, Baustein oder Datei … (z. B. „tabelle 3x4“)"}
          onClose={() => {
            setPalette(null);
            editor.current?.focus();
          }}
        />
      )}

      {litOpen && (
        <LiteratureDialog
          onCite={(key, supplement) => {
            setLitOpen(false);
            citeKey(key, supplement);
          }}
          onAdd={addBibEntry}
          onStyle={setBibStyle}
          onClose={() => {
            setLitOpen(false);
            editor.current?.focus();
          }}
        />
      )}

      {graphicsOpen && (
        <GraphicsGallery
          onInsert={(g) => {
            setGraphicsOpen(false);
            insertGraphic(g);
          }}
          onClose={() => {
            setGraphicsOpen(false);
            editor.current?.focus();
          }}
        />
      )}

      {symbolsOpen && (
        <SymbolPalette
          onInsert={(e, keepOpen) => {
            if (!keepOpen) setSymbolsOpen(false);
            insertSymbol(e);
          }}
          onClose={() => {
            setSymbolsOpen(false);
            editor.current?.focus();
          }}
        />
      )}

      {saveTpl && (
        <div className="overlay" onMouseDown={() => setSaveTpl(null)}>
          <div className="dialog small-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialog-head">
              <h2>Als Vorlage speichern</h2>
              <p>
                Alle Dateien außer <code>out/</code> werden kopiert. Platzhalter wie <code>{"{{titel}}"}</code> oder{" "}
                <code>{"{{datum}}"}</code> in .typ-Dateien werden beim Anlegen ausgefüllt.
              </p>
            </div>
            <div className="dialog-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field">
                <label htmlFor="tpl-name">Name</label>
                <input
                  id="tpl-name"
                  autoFocus
                  value={saveTpl.name}
                  onChange={(e) => setSaveTpl({ ...saveTpl, name: e.target.value, error: undefined })}
                />
              </div>
              <div className="field">
                <label htmlFor="tpl-desc">Beschreibung</label>
                <input
                  id="tpl-desc"
                  placeholder="optional"
                  value={saveTpl.description}
                  onChange={(e) => setSaveTpl({ ...saveTpl, description: e.target.value })}
                />
              </div>
              {saveTpl.error && <div className="form-error">{saveTpl.error}</div>}
            </div>
            <div className="dialog-foot">
              <div className="grow" />
              <button className="btn" onClick={() => setSaveTpl(null)}>
                Abbrechen
              </button>
              <button
                className="btn primary"
                onClick={async () => {
                  try {
                    await flushSave();
                    const dir = await api.saveAsTemplate(saveTpl.name, saveTpl.description);
                    setSaveTpl(null);
                    showToast({ text: `Vorlage „${saveTpl.name}“ gespeichert`, actions: [{ label: "Im Finder", run: () => revealItemInDir(dir) }] }, 6000);
                  } catch (e) {
                    setSaveTpl({ ...saveTpl, error: String(e) });
                  }
                }}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {tableEdit && (
        <TableEditor
          initial={tableEdit.grid}
          isNew={tableEdit.isNew}
          onApply={applyTable}
          onClose={() => {
            setTableEdit(null);
            editor.current?.focus();
          }}
        />
      )}

      {matEdit && (
        <MatrixEditor
          initial={matEdit.grid}
          isNew={matEdit.isNew}
          onApply={applyMatrix}
          onClose={() => {
            setMatEdit(null);
            editor.current?.focus();
          }}
        />
      )}

      {menu && (
        <div
          className="menu"
          style={{
            left: Math.min(menu.x, window.innerWidth - 250),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - 16 - menu.items.reduce((h, it) => h + (it === "sep" ? 11 : 28), 10))),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.items.map((it, i) =>
            it === "sep" ? (
              <hr key={i} />
            ) : (
              <button
                key={i}
                className={it.danger ? "danger" : undefined}
                onClick={() => {
                  setMenu(null);
                  it.run();
                }}
              >
                {it.label}
                {it.detail && <span className="detail">{it.detail}</span>}
              </button>
            ),
          )}
        </div>
      )}

      {toast && (
        <div className={"toast" + (toast.kind === "error" ? " error" : "")}>
          <span>{toast.text}</span>
          {toast.actions?.map((a) => (
            <button
              key={a.label}
              onClick={() => {
                a.run();
                setToast(null);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
