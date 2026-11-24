// Dateien im Projekt: Hauptdatei festlegen, anlegen, umbenennen und die
// Aktionen des Dateibaums (Duplizieren, Papierkorb, Pfad kopieren …).

import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useMemo, type RefObject } from "react";
import { api, type FileEntry, type OpenedProject } from "../api";
import type { EditorHandle } from "../editor/Editor";
import type { TreeActions } from "../FileTree";
import type { Menu, Toast } from "./types";

export function useFileActions({
  project,
  files,
  main,
  setMain,
  editor,
  currentRef,
  setCurrent,
  openFile,
  flushSave,
  refreshFiles,
  requestCompile,
  svgCache,
  showToast,
  setMenu,
  insertImages,
  pathFromCurrent,
}: {
  project: OpenedProject;
  files: FileEntry[];
  main: string;
  setMain(rel: string): void;
  editor: RefObject<EditorHandle | null>;
  currentRef: RefObject<string | null>;
  setCurrent(rel: string | null): void;
  openFile(rel: string, reveal?: number): Promise<void>;
  flushSave(): Promise<void>;
  refreshFiles(): Promise<void>;
  requestCompile(): void;
  svgCache: RefObject<Map<string, string>>;
  showToast(t: Toast, ms?: number): void;
  setMenu(m: Menu | null): void;
  insertImages(rels: string[]): void;
  pathFromCurrent(rel: string): string;
}) {
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

  return { setMainFile, createFile, renameFile, treeActions };
}
