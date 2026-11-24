import { invoke } from "@tauri-apps/api/core";
import type { TableModel } from "./TableEditor";

export type ProjectInfo = { name: string; path: string; modified: number; files: number };
export type Field = {
  key: string;
  label: string;
  placeholder: string;
  default: string;
  kind: "text" | "date" | "choice";
  options: string[];
  remember: boolean;
};
export type Template = { id: string; name: string; description: string; category: string; fields: Field[]; user: boolean };
export type FileKind = "typ" | "image" | "pdf" | "text" | "other" | "dir";
export type FileEntry = { path: string; kind: FileKind };
export type OpenedProject = { root: string; name: string; main: string; files: FileEntry[] };

export type PageOut = { hash: string; svg: string | null; width: number; height: number };
export type Diag = {
  severity: "error" | "warning";
  message: string;
  hints: string[];
  file: string | null;
  from: number | null;
  to: number | null;
  line: number | null;
};
export type CompileOut = { pages: PageOut[] | null; diagnostics: Diag[]; millis: number };

export type Jump =
  | { kind: "file"; file: string; offset: number }
  | { kind: "url"; url: string }
  | { kind: "position"; page: number; x: number; y: number };
export type Pos = { page: number; x: number; y: number };
export type BibEntry = { key: string; kind: string; title: string; authors: string[]; year: number | null; container: string | null; file: string };
export type BibOverview = { files: string[]; target: string; call_file: string | null; style: string | null; entries: BibEntry[]; errors: string[] };
export type SpellIssue = { from: number; to: number; word: string; lang: string; suggestions: string[] };

export type StilDatei = { path: string; status: "aktuell" | "veraltet" | "angepasst"; version: string | null };
export type ProjektStil = { name: string; path: string; veraltet: string[]; angepasst: string[] };
export type HistoryEntry = { id: string; zeit: number; grund: string; bytes: number };
/** Fehlertext von write_file, wenn die Datei von außen geändert wurde. */
export const isConflict = (e: unknown) => String(e).startsWith("konflikt");

export type CompletionKind = string | { symbol: string };
export type Completion = { kind: CompletionKind; label: string; apply: string | null; detail: string | null };

export const api = {
  projectsDir: () => invoke<string>("projects_dir"),
  listProjects: () => invoke<ProjectInfo[]>("list_projects"),
  listTemplates: () => invoke<Template[]>("list_templates"),
  createProject: (name: string, template: string, fields: [string, string][] = []) =>
    invoke<string>("create_project", { name, template, fields }),
  templatePreview: (id: string) => invoke<string>("template_preview", { id }),
  saveAsTemplate: (name: string, description: string) => invoke<string>("save_as_template", { name, description }),
  templatesDir: () => invoke<string>("templates_dir"),
  openProject: (path: string) => invoke<OpenedProject>("open_project", { path }),
  closeProject: () => invoke<void>("close_project"),

  listFiles: () => invoke<FileEntry[]>("list_files"),
  readFile: (rel: string) => invoke<string>("read_file", { rel }),
  /** Rohdaten einer Datei, z. B. ein PDF oder Bild für den Betrachter. */
  readBytes: (rel: string) => invoke<ArrayBuffer>("read_bytes", { rel }),
  /** Speichert; mit `expected` nur, wenn die Datei nicht von außen geändert wurde. Gibt die neue Prüfsumme zurück. */
  writeFile: (rel: string, text: string, expected?: string | null) => invoke<string>("write_file", { rel, text, expected }),
  openText: (rel: string) => invoke<{ text: string; hash: string }>("open_text", { rel }),
  fileHash: (rel: string) => invoke<string | null>("file_hash", { rel }),
  historyList: (rel: string) => invoke<HistoryEntry[]>("history_list", { rel }),
  historyRead: (rel: string, id: string) => invoke<string>("history_read", { rel, id }),
  stilStatus: () => invoke<StilDatei[]>("stil_status"),
  stilBundled: (path: string) => invoke<string>("stil_bundled", { path }),
  stilUpdate: (paths: string[]) => invoke<string[]>("stil_update", { paths }),
  stilScanAll: () => invoke<ProjektStil[]>("stil_scan_all"),
  stilUpdateProject: (path: string, paths: string[]) => invoke<string[]>("stil_update_project", { path, paths }),
  historySnapshot: (rel: string, text: string, reason: string) => invoke<boolean>("history_snapshot", { rel, text, reason }),
  createFile: (rel: string) => invoke<void>("create_file", { rel }),
  renameFile: (from: string, to: string) => invoke<void>("rename_file", { from, to }),
  createDir: (rel: string) => invoke<void>("create_dir", { rel }),
  duplicateFile: (rel: string) => invoke<string>("duplicate_file", { rel }),
  trashFile: (rel: string) => invoke<string>("trash_file", { rel }),
  restoreFile: (trashed: string, rel: string) => invoke<void>("restore_file", { trashed, rel }),
  importFiles: (paths: string[], subdir = "assets") => invoke<string[]>("import_files", { paths, subdir }),
  absolutePath: (rel: string) => invoke<string>("absolute_path", { rel }),
  /** Saves pasted image bytes in assets/; returns the project-relative path. */
  saveAsset: async (name: string, data: Blob) =>
    invoke<string>("save_asset", new Uint8Array(await data.arrayBuffer()), { headers: { "x-name": encodeURIComponent(name) } }),
  formatTypst: (text: string, from?: number, to?: number, width?: number) =>
    invoke<{ from: number; to: number; text: string } | null>("format_typst", { text, from, to, width }),

  compile: (rel?: string, text?: string) => invoke<CompileOut>("compile", { rel, text }),
  setMain: (rel: string) => invoke<void>("set_main", { rel }),
  forgetPreview: () => invoke<void>("forget_preview"),
  jumpFromClick: (page: number, x: number, y: number) => invoke<Jump | null>("jump_from_click", { page, x, y }),
  jumpFromCursor: (rel: string, offset: number) => invoke<Pos[]>("jump_from_cursor", { rel, offset }),
  complete: (rel: string, text: string, offset: number, explicit: boolean) =>
    invoke<{ from: number; items: Completion[] } | null>("complete", { rel, text, offset, explicit }),
  /** Nach out/ exportieren; mit `target` genau eine PDF an diesen Ort (Speichern unter). */
  exportPdf: (both: boolean, target?: string) => invoke<string[]>("export_pdf", { both, target }),
  matrixAt: (text: string, offset: number) =>
    invoke<{ from: number; to: number; func: string; args: string } | null>("matrix_at", { text, offset }),
  tableAt: (text: string, offset: number) =>
    invoke<{ status: "none" } | ({ status: "ok" } & TableModel) | { status: "unsupported"; reason: string }>("table_at", { text, offset }),
  symbols: () => invoke<[string, string][]>("symbols"),
  mathWord: (rel: string, text: string, offset: number) =>
    invoke<{ from: number; to: number; known: boolean } | null>("math_word", { rel, text, offset }),
  modeAt: (text: string, offset: number) => invoke<"markup" | "math" | "code">("mode_at", { text, offset }),
  renderSnippet: (code: string, key?: string) => invoke<string>("render_snippet", { code, key }),
  spellcheck: (text: string, mode: string, allowed: string[]) =>
    invoke<{ issues: SpellIssue[]; dominant: string | null }>("spellcheck", { text, mode, allowed }),
  learnWord: (word: string) => invoke<void>("learn_word", { word }),
  bibOverview: () => invoke<BibOverview>("bib_overview"),
  bibLookup: (query: string, taken: string[]) => invoke<{ bibtex: string; entry: BibEntry }>("bib_lookup", { query, taken }),
  bibAppend: (file: string, bibtex: string) => invoke<void>("bib_append", { file, bibtex }),
  bibStyles: () => invoke<[string, string][]>("bib_styles"),
  bibMakeKey: (authors: string[], year: number | null, title: string, taken: string[]) =>
    invoke<string>("bib_make_key", { authors, year, title, taken }),
  highlight: (text: string) => invoke<[number, number, string][]>("highlight", { text }),
};
