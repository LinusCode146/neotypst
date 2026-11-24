import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";

import { api, isConflict, type FileEntry, type HistoryEntry, type OpenedProject, type StilDatei } from "./api";
import { StilDialog } from "./StilDialog";
import { HistoryDialog, zeitText } from "./HistoryDialog";
import { LiteratureDialog } from "./LiteratureDialog";
import { Editor, type EditorHandle } from "./editor/Editor";
import { matrixSnippet, tableSnippet } from "./editor/snippets";
import { Icon } from "./icons";
import { Palette, type PaletteItem } from "./Palette";
import { handleKey, keyLabel, paletteItems, withKeys, type Command } from "./workspace/commands";
import { buildCommands, SPELL_MODES, spellLabel } from "./workspace/commandList";
import { useSpell } from "./workspace/useSpell";
import { useCompile } from "./workspace/useCompile";
import { useEditorTools } from "./workspace/useEditorTools";
import { useFileActions } from "./workspace/useFileActions";
import type { Menu, Toast } from "./workspace/types";
import { createStore } from "./workspace/store";
import { Titlebar } from "./workspace/Titlebar";
import { StatusBar } from "./workspace/StatusBar";
import { Outline } from "./workspace/Outline";
import { EditorNotices } from "./workspace/EditorNotices";
import { SaveTemplateDialog } from "./workspace/SaveTemplateDialog";
import { PopupMenu, ToastView } from "./workspace/Overlays";
import { Preview, type Marker, type PreviewHandle } from "./Preview";
import { getSettings, setSettings, useSettings } from "./settings";

import { TableEditor } from "./TableEditor";
import { FileTree, fileIcon } from "./FileTree";
import { MatrixEditor } from "./MatrixEditor";
import { SymbolPalette } from "./SymbolPalette";
import { GraphicsGallery } from "./GraphicsGallery";
import { SearchPanel } from "./SearchPanel";
import { beforeRestart } from "./updater";
import { kbd } from "./platform";
import { outlineOf, type Heading } from "./outline";


const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp)$/i;


export function Workspace({ project, onClose }: { project: OpenedProject; onClose(): void }) {
  const settings = useSettings();
  const editor = useRef<EditorHandle>(null);
  const preview = useRef<PreviewHandle>(null);

  const [files, setFiles] = useState<FileEntry[]>(project.files);
  const [main, setMain] = useState(project.main);
  const [current, setCurrent] = useState<string | null>(null);
  // Der Text lebt im Editor. Gliederung und Suche bekommen ihn erst nach einer
  // kurzen Tipp-Pause, damit nicht jeder Tastendruck die ganze Ansicht neu rendert.
  const [outline, setOutline] = useState<Heading[]>([]);
  const [textVersion, setTextVersion] = useState(0);
  const textTimer = useRef<number | undefined>(undefined);
  const textSettled = useCallback((t: string) => {
    const next = outlineOf(t);
    setOutline((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    setTextVersion((v) => v + 1);
  }, []);
  const [marker, setMarker] = useState<Marker | null>(null);
  const [solutions, setSolutions] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [palette, setPalette] = useState<null | "all" | "files">(null);
  const [showProblems, setShowProblems] = useState(false);
  const [vimMode, setVimMode] = useState<string | null>(null);
  /** Cursorposition für die Statusleiste; ändert sich bei jedem Tastendruck, deshalb kein State hier. */
  const cursorStore = useMemo(() => createStore({ line: 1, col: 1 }), []);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [split, setSplit] = useState(() => Number(localStorage.getItem("neotypst.split")) || 0.5);
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [graphicsOpen, setGraphicsOpen] = useState(false);
  const [litOpen, setLitOpen] = useState(false);
  const [saveTpl, setSaveTpl] = useState<{ name: string } | null>(null);

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

  const unsaved = useRef(new Map<string, string>());
  /** Prüfsumme je Datei, wie sie der Editor zuletzt gelesen oder gespeichert hat. */
  const hashes = useRef(new Map<string, string>());
  /** Datei, die von außen geändert wurde, während hier ungespeicherte Änderungen lagen. */
  const [conflict, setConflictState] = useState<string | null>(null);
  const conflictRef = useRef<string | null>(null);
  const setConflict = (rel: string | null) => {
    conflictRef.current = rel;
    setConflictState(rel);
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Stil-Dateien des Projekts und ob der Hinweis dazu weggeklickt wurde. */
  const [stil, setStil] = useState<StilDatei[]>([]);
  const [stilOpen, setStilOpen] = useState(false);
  const [stilLater, setStilLater] = useState(false);
  const refreshStil = useCallback(() => api.stilStatus().then(setStil, () => setStil([])), []);
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

  const { spellInfo, scheduleSpell, onSpellAction } = useSpell({ editor, currentRef, current, root: project.root, showToast });

  const { pages, diags, diagsRef, millis, compiling, requestCompile, latest, svgCache } = useCompile({ editor, showToast });

  // ---------- Files ----------

  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const entries = [...unsaved.current.entries()];
    unsaved.current.clear();
    for (const [rel, t] of entries) {
      // Bis der Konflikt gelöst ist, bleibt die Datei ungespeichert.
      if (conflictRef.current === rel) {
        unsaved.current.set(rel, t);
        continue;
      }
      try {
        hashes.current.set(rel, await api.writeFile(rel, t, hashes.current.get(rel) ?? null));
      } catch (e) {
        unsaved.current.set(rel, t);
        if (isConflict(e)) setConflict(rel);
        else showToast({ text: `Speichern fehlgeschlagen: ${e}`, kind: "error" });
      }
    }
    setDirty(unsaved.current.size > 0);
  }, [showToast]);

  const refreshFiles = useCallback(async () => {
    setFiles(await api.listFiles());
  }, []);

  // Die offene Datei wurde außerhalb von NeoTypst geändert (anderer Editor,
  // Git, Finder): ohne eigene Änderungen still neu laden, sonst nachfragen.
  const checkExternal = useCallback(async () => {
    const rel = currentRef.current;
    if (!rel || conflictRef.current) return;
    const disk = await api.fileHash(rel).catch(() => null);
    if (disk == null || disk === hashes.current.get(rel)) return;
    if (unsaved.current.has(rel)) {
      setConflict(rel);
      return;
    }
    const o = await api.openText(rel);
    if (currentRef.current !== rel || !editor.current) return;
    const mine = editor.current.getText();
    await api.historySnapshot(rel, mine, "vor-neuladen").catch(() => {});
    hashes.current.set(rel, o.hash);
    editor.current.applyEdit(0, mine.length, o.text);
    showToast({ text: `${rel} wurde außerhalb geändert und neu geladen` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  const resolveConflict = useCallback(
    async (keep: "mine" | "disk") => {
      const rel = conflictRef.current;
      if (!rel || !editor.current) return;
      const mine = editor.current.getText();
      try {
        if (keep === "mine") {
          // Ohne Prüfsumme: überschreibt, die fremde Fassung kommt vorher in den Verlauf.
          hashes.current.set(rel, await api.writeFile(rel, mine, null));
          unsaved.current.delete(rel);
          setConflict(null);
        } else {
          await api.historySnapshot(rel, mine, "vor-neuladen");
          const o = await api.openText(rel);
          hashes.current.set(rel, o.hash);
          unsaved.current.delete(rel);
          setConflict(null);
          editor.current.applyEdit(0, mine.length, o.text);
        }
        setDirty(unsaved.current.size > 0);
      } catch (e) {
        showToast({ text: String(e), kind: "error" });
      }
    },
    [showToast],
  );

  const restoreFromHistory = useCallback(
    async (text: string, entry: HistoryEntry) => {
      const rel = currentRef.current;
      if (!rel || !editor.current) return;
      const mine = editor.current.getText();
      await api.historySnapshot(rel, mine, "vor-wiederherstellen").catch(() => {});
      editor.current.applyEdit(0, mine.length, text);
      setHistoryOpen(false);
      showToast({ text: `Stand von ${zeitText(entry.zeit)} wiederhergestellt. ${kbd("⌘Z")} macht es rückgängig.` }, 5000);
    },
    [showToast],
  );

  const stilUpdated = useCallback(
    async (updated: string[]) => {
      setStilOpen(false);
      for (const rel of updated) {
        unsaved.current.delete(rel);
        hashes.current.delete(rel);
        editor.current?.forgetFile(rel);
      }
      const cur = currentRef.current;
      if (cur && updated.includes(cur)) {
        currentRef.current = null;
        await openFile(cur);
      }
      requestCompile();
      void refreshStil();
      if (updated.length)
        showToast({ text: `Stil aktualisiert (${updated.length === 1 ? "1 Datei" : `${updated.length} Dateien`}). Die alten Fassungen liegen im Verlauf.` }, 5000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requestCompile, refreshStil, showToast],
  );

  // Pick up files added or removed in the Finder when coming back to the app.
  useEffect(() => {
    const onFocus = () => {
      void refreshFiles().catch(() => {});
      void checkExternal().catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshFiles, checkExternal]);

  const openFile = useCallback(
    async (rel: string, reveal?: number) => {
      if (rel === currentRef.current) {
        if (reveal != null) editor.current?.reveal(reveal);
        return;
      }
      await flushSave();
      try {
        const { text: t, hash } = await api.openText(rel);
        hashes.current.set(rel, hash);
        editor.current?.openFile(rel, t);
        setCurrent(rel);
        window.clearTimeout(textTimer.current);
        textSettled(t);
        latest.current = { rel, text: t };
        editor.current?.setDiagnostics(diagsRef.current);
        if (reveal != null) editor.current?.reveal(reveal);
      } catch (e) {
        showToast({ text: `Datei kann nicht geöffnet werden: ${e}`, kind: "error" });
      }
    },
    [flushSave, showToast],
  );

  // Initial load.
  useEffect(() => {
    svgCache.current.clear();
    openFile(project.main).then(() => requestCompile());
    void refreshStil();
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
      window.clearTimeout(textTimer.current);
      textTimer.current = window.setTimeout(() => textSettled(t), 300);
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
    cursorStore.set({ line, col });
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


  const tools = useEditorTools({ editor, currentRef, main, refreshFiles, requestCompile, showToast });
  const {
    tableEdit, setTableEdit, matEdit, setMatEdit, pathFromCurrent, insertImages, pasteImages, formatDocument,
    openMatrixEditor, applyMatrix, openGridEditor, openTableEditor, applyTable, insertSymbol, insertGraphic,
    editFileText, citeKey, addBibEntry, setBibStyle,
  } = tools;

  const { treeActions } = useFileActions({
    project, files, main, setMain, editor, currentRef, setCurrent, openFile, flushSave, refreshFiles,
    requestCompile, svgCache, showToast, setMenu, insertImages, pathFromCurrent,
  });

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

  const fileCommands = useMemo(
    (): Command[] =>
      files
        .filter((f) => f.kind !== "dir")
        .map((f) => ({
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
        })),
    [files, main, openFile, insertImages],
  );

  const commands = buildCommands(
    {
      settings,
      solutions,
      project,
      main,
      togglePalette: (kind) => setPalette((p) => (p ? null : kind)),
      exportPdf: (both) => void exportPdf(both),
      toggleSolutions: () => void toggleSolutions(),
      editorCommand: (name) => editor.current?.command(name),
      insertSnippet: (body) => editor.current?.insertSnippet(body),
      openLiterature: () => setLitOpen(true),
      openGraphics: () => setGraphicsOpen(true),
      insertGraphic,
      openSymbols: () => setSymbolsOpen(true),
      openGridEditor: () => {
        if (!tableEdit && !matEdit) void openGridEditor();
      },
      openTableEditor: () => void openTableEditor(),
      openMatrixEditor: () => void openMatrixEditor(),
      saveAsTemplate: () => setSaveTpl({ name: project.name }),
      openSearch,
      formatDocument: () => void formatDocument(),
      requestTree,
      openStil: () => void refreshStil().then(() => setStilOpen(true)),
      openHistory: () => currentRef.current && setHistoryOpen(true),
      cycleSpell: () => {
        const order = ["auto", "de", "en"] as const;
        const next = order[(order.indexOf(settings.spell as (typeof order)[number]) + 1) % order.length];
        setSettings({ spell: next });
        showToast({ text: `Rechtschreibung: ${spellLabel(next)}` }, 1500);
      },
      zoom: (f) => zoom(f === "fit" ? 1 : settings.zoom * f),
      save: () => void flushSave(),
      goHome: onClose,
    },
    fileCommands,
  );
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => void handleKey(commandsRef.current, e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const title = (id: string, label: string) => withKeys(commands, id, label);

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

  const firstError = diags.find((d) => d.severity === "error");



  return (
    <div className="workspace" onClick={() => menu && setMenu(null)}>
      <Titlebar
        projectName={project.name}
        current={current}
        dirty={dirty}
        sidebar={settings.sidebar}
        solutions={solutions}
        zoom={settings.zoom}
        title={title}
        onHome={onClose}
        onToggleSidebar={() => setSettings({ sidebar: !settings.sidebar })}
        onLiterature={() => setLitOpen(true)}
        onGraphics={() => setGraphicsOpen(true)}
        onSymbols={() => setSymbolsOpen(true)}
        onGrid={() => void openGridEditor()}
        onPalette={() => setPalette("all")}
        onToggleSolutions={() => void toggleSolutions()}
        onZoom={zoom}
        onExportMenu={(r) =>
          setMenu({
            x: r.right - 240,
            y: r.bottom + 6,
            items: [
              { label: "PDF exportieren", detail: keyLabel("mod+e"), run: () => exportPdf(false) },
              { label: "Aufgaben + Lösungen exportieren", detail: keyLabel("mod+shift+e"), run: () => exportPdf(true) },
              "sep",
              { label: "Ordner „out“ im Finder", run: () => revealItemInDir(project.root + "/out") },
            ],
          })
        }
      />

      <div className="panes" ref={panes}>
        {settings.sidebar && (
          <aside className="sidebar">
            {searchOpen ? (
              <SearchPanel
                files={files}
                current={current}
                textVersion={String(textVersion)}
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
            {!searchOpen && <Outline items={outline} onReveal={(line) => editor.current?.revealLine(line)} />}
          </aside>
        )}

        <section className="editor-pane" style={{ flexBasis: `${split * 100}%` }}>
          <EditorNotices
            stil={stil}
            diags={diags}
            stilLater={stilLater}
            onStilLater={() => setStilLater(true)}
            onStilOpen={() => setStilOpen(true)}
            conflict={conflict && conflict === current ? conflict : null}
            onResolve={(keep) => void resolveConflict(keep)}
          />
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

      <StatusBar
        diags={diags}
        compiling={compiling}
        millis={millis}
        pageCount={pages.length}
        spell={settings.spell}
        spellInfo={spellInfo}
        vimMode={vimMode}
        cursor={cursorStore}
        dirty={dirty}
        onToggleProblems={() => setShowProblems((s) => !s)}
        onSpellMenu={(r) =>
          setMenu({
            x: r.left,
            y: r.top - 8 - 4 * 28 - 10,
            items: SPELL_MODES.map((m) => ({
              label: (settings.spell === m ? "✓ " : "   ") + spellLabel(m),
              detail: m === "auto" ? "pro Absatz erkannt" : undefined,
              run: () => setSettings({ spell: m }),
            })),
          })
        }
      />

      {palette && (
        <Palette
          items={paletteItems(palette === "files" ? fileCommands : commands)}
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

      {stilOpen && (
        <StilDialog
          files={stil}
          broken={stil.filter((d) => diags.some((g) => g.severity === "error" && g.file === d.path)).map((d) => d.path)}
          onDone={(u) => void stilUpdated(u)}
          onClose={() => setStilOpen(false)}
        />
      )}

      {historyOpen && current && (
        <HistoryDialog
          rel={current}
          current={editor.current?.getText() ?? ""}
          onRestore={(t, e) => void restoreFromHistory(t, e)}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {saveTpl && (
        <SaveTemplateDialog
          initialName={saveTpl.name}
          onClose={() => setSaveTpl(null)}
          onSave={async (name, description) => {
            await flushSave();
            const dir = await api.saveAsTemplate(name, description);
            setSaveTpl(null);
            showToast({ text: `Vorlage „${name}“ gespeichert`, actions: [{ label: "Im Finder", run: () => revealItemInDir(dir) }] }, 6000);
          }}
        />
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

      {menu && <PopupMenu menu={menu} onClose={() => setMenu(null)} />}

      {toast && <ToastView toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
