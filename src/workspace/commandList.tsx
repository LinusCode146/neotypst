// Die Befehle des Arbeitsbereichs. Was sie tun, kommt aus dem Arbeitsbereich
// (ctx); hier steht nur, wie sie heißen, wo sie einsortiert sind und welches
// Kürzel sie haben.

import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { SNIPPETS } from "../editor/snippets";
import { GRAPHICS, type GraphicBlock } from "../graphics";
import { Icon } from "../icons";
import { setSettings, type Settings } from "../settings";
import { checkForUpdate } from "../updater";
import type { Command } from "./commands";

export const SPELL_MODES = ["auto", "de", "en", "off"] as const;
export const spellLabel = (m: string) => ({ auto: "Automatisch", de: "Deutsch", en: "Englisch", off: "Aus" })[m] ?? m;

export type CommandContext = {
  settings: Settings;
  solutions: boolean;
  project: { name: string; root: string };
  main: string;
  togglePalette(kind: "all" | "files"): void;
  exportPdf(both: boolean): void;
  exportPdfAs(): void;
  toggleSolutions(): void;
  editorCommand(name: "convertTable"): void;
  insertSnippet(body: string): void;
  openLiterature(): void;
  openGraphics(): void;
  insertGraphic(g: GraphicBlock): void;
  openSymbols(): void;
  openGridEditor(): void;
  openTableEditor(): void;
  openMatrixEditor(): void;
  saveAsTemplate(): void;
  openSearch(): void;
  formatDocument(): void;
  requestTree(kind: "file" | "dir"): void;
  openStil(): void;
  openHistory(): void;
  cycleSpell(): void;
  zoom(factor: number | "fit"): void;
  save(): void;
  goHome(): void;
};

export function buildCommands(ctx: CommandContext, files: Command[]): Command[] {
  const { settings } = ctx;
  const actions: Command[] = [
    { id: "palette", label: "Befehlspalette", group: "Aktionen", keys: "mod+k", hidden: true, run: () => ctx.togglePalette("all") },
    { id: "open-file", label: "Datei öffnen", group: "Aktionen", keys: "mod+p", hidden: true, run: () => ctx.togglePalette("files") },
    { id: "save", label: "Speichern", group: "Aktionen", keys: "mod+s", hidden: true, run: ctx.save },
    { id: "spell-cycle", label: "Rechtschreibung wechseln", group: "Einstellungen", keys: "mod+alt+l", hidden: true, run: ctx.cycleSpell },
    { id: "zoom-in", label: "Vergrößern", group: "Ansicht", keys: "mod++", hidden: true, run: () => ctx.zoom(1.15) },
    { id: "zoom-in-eq", label: "Vergrößern", group: "Ansicht", keys: "mod+=", hidden: true, run: () => ctx.zoom(1.15) },
    { id: "zoom-out", label: "Verkleinern", group: "Ansicht", keys: "mod+-", hidden: true, run: () => ctx.zoom(1 / 1.15) },
    { id: "zoom-fit", label: "An Breite anpassen", group: "Ansicht", keys: "mod+0", hidden: true, run: () => ctx.zoom("fit") },

    { id: "export", label: "Als PDF exportieren", group: "Aktionen", keys: "mod+e", icon: <Icon.export />, run: () => ctx.exportPdf(false) },
    {
      id: "export-both",
      label: "PDF exportieren: Aufgaben + Lösungen",
      keys: "mod+shift+e",
      keywords: "beide loesung",
      group: "Aktionen",
      icon: <Icon.export />,
      run: () => ctx.exportPdf(true),
    },
    {
      id: "export-as",
      label: "PDF speichern unter …",
      keywords: "export downloads ordner speichern",
      group: "Aktionen",
      icon: <Icon.export />,
      run: ctx.exportPdfAs,
    },
    {
      id: "solutions",
      label: ctx.solutions ? "Lösungen ausblenden" : "Lösungen einblenden",
      keys: "mod+shift+l",
      keywords: "loesung",
      group: "Aktionen",
      icon: <Icon.eye />,
      run: ctx.toggleSolutions,
    },
    {
      id: "convert-table",
      label: "Markdown-Tabelle in Typst umwandeln",
      // Das Kürzel gehört dem Editor (nur dort sinnvoll), hier nur die Beschriftung.
      detail: "⌘⇧T",
      keywords: "pipe tabelle",
      group: "Aktionen",
      icon: <Icon.table />,
      run: () => ctx.editorCommand("convertTable"),
    },
    {
      id: "literature",
      label: "Literatur & Zitate …",
      keys: "mod+shift+b",
      keywords: "literatur zitat quelle bibliography doi isbn cite bib",
      group: "Aktionen",
      icon: <Icon.book />,
      run: ctx.openLiterature,
    },
    {
      id: "graphics",
      label: "Grafik einfügen …",
      keys: "mod+shift+g",
      keywords: "grafik diagramm plot koordinatensystem schaltkreis flussdiagramm",
      group: "Aktionen",
      icon: <Icon.chart />,
      run: ctx.openGraphics,
    },
    ...GRAPHICS.map((g) => ({
      id: "graphic:" + g.id,
      label: g.label,
      detail: g.category,
      keywords: "grafik " + g.description,
      group: "Einfügen · Grafiken",
      icon: <Icon.chart />,
      run: () => ctx.insertGraphic(g),
    })),
    {
      id: "symbols",
      label: "Symbolpalette öffnen",
      keys: "mod+shift+s",
      keywords: "symbol griechisch pfeil zeichen sonderzeichen",
      group: "Aktionen",
      icon: <Icon.math />,
      run: ctx.openSymbols,
    },
    { id: "grid-editor", label: "Tabellen- oder Matrix-Editor", group: "Aktionen", keys: "mod+t", hidden: true, run: ctx.openGridEditor },
    {
      id: "table-editor",
      label: "Tabellen-Editor öffnen",
      detail: "⌘T",
      keywords: "tabelle grid bearbeiten",
      group: "Aktionen",
      icon: <Icon.table />,
      run: ctx.openTableEditor,
    },
    {
      id: "matrix-editor",
      label: "Matrix-Editor öffnen",
      detail: "⌘T in Formeln",
      keywords: "matrix mat vektor vec determinante lgs gauß",
      group: "Aktionen",
      icon: <Icon.table />,
      run: ctx.openMatrixEditor,
    },
    {
      id: "save-template",
      label: "Projekt als Vorlage speichern …",
      keywords: "vorlage template",
      group: "Aktionen",
      icon: <Icon.star />,
      run: ctx.saveAsTemplate,
    },
    {
      id: "project-search",
      label: "Im Projekt suchen und ersetzen",
      keys: "mod+shift+f",
      keywords: "suchen finden ersetzen replace search alle dateien",
      group: "Aktionen",
      icon: <Icon.search />,
      run: ctx.openSearch,
    },
    {
      id: "format",
      label: "Dokument formatieren",
      // Kürzel im Editor (⌥⇧F hat keine Befehlstaste).
      detail: "⌥⇧F",
      keywords: "format formatieren aufräumen einrücken typstyle auswahl",
      group: "Aktionen",
      icon: <Icon.code />,
      run: ctx.formatDocument,
    },
    {
      id: "stil",
      label: "Stil aktualisieren …",
      detail: "stil.typ und Vorlagen",
      keywords: "stil vorlage update",
      group: "Aktionen",
      icon: <Icon.bolt />,
      run: ctx.openStil,
    },
    {
      id: "history",
      label: "Verlauf dieser Datei",
      detail: "frühere Stände",
      keywords: "verlauf history wiederherstellen backup",
      group: "Aktionen",
      icon: <Icon.book />,
      run: ctx.openHistory,
    },
    {
      id: "update",
      label: "Nach Updates suchen",
      keywords: "update version aktualisieren",
      group: "Aktionen",
      icon: <Icon.bolt />,
      run: () => void checkForUpdate(true),
    },
    { id: "new-file", label: "Neue Datei …", group: "Aktionen", icon: <Icon.plus />, run: () => ctx.requestTree("file") },
    { id: "new-dir", label: "Neuer Ordner …", keywords: "ordner verzeichnis", group: "Aktionen", icon: <Icon.folder />, run: () => ctx.requestTree("dir") },
    {
      id: "finder",
      label: "Projektordner im Finder zeigen",
      group: "Aktionen",
      icon: <Icon.folderOpen />,
      run: () => void revealItemInDir(ctx.project.root + "/" + ctx.main),
    },
    { id: "home", label: "Zur Projektübersicht", group: "Aktionen", icon: <Icon.home />, run: ctx.goHome },
  ];

  const insert: Command[] = SNIPPETS.map((s) => ({
    id: "snip:" + s.label,
    label: s.detail,
    detail: s.label + " ⇥",
    keywords: s.label + " " + s.group,
    group: "Einfügen · " + s.group,
    icon: s.group === "Tabellen" ? <Icon.table /> : s.group === "Mathe" ? <Icon.math /> : s.group === "Informatik" ? <Icon.code /> : <Icon.bolt />,
    run: () => ctx.insertSnippet(s.body),
  }));

  const toggle = (id: string, label: string, key: "vim" | "lineNumbers" | "mathQuote" | "wrap"): Command => ({
    id,
    label,
    group: "Einstellungen",
    icon: <Icon.settings />,
    run: () => setSettings({ [key]: !settings[key] }),
  });
  const prefs: Command[] = [
    ...SPELL_MODES.map((m) => ({
      id: "spell-" + m,
      label: `Rechtschreibung: ${spellLabel(m)}${settings.spell === m ? " ✓" : ""}`,
      detail: m === "auto" ? "Sprache pro Absatz erkennen" : undefined,
      keywords: "rechtschreibung sprache deutsch englisch spell language",
      group: "Einstellungen",
      icon: <Icon.check />,
      run: () => setSettings({ spell: m }),
    })),
    toggle("vim", `Vim-Modus ${settings.vim ? "ausschalten" : "einschalten"}`, "vim"),
    toggle("ln", `Zeilennummern ${settings.lineNumbers ? "aus" : "an"}`, "lineNumbers"),
    toggle("mathquote", `Text in Formeln automatisch quoten ${settings.mathQuote ? "aus" : "an"}`, "mathQuote"),
    toggle("wrap", `Zeilenumbruch ${settings.wrap ? "aus" : "an"}`, "wrap"),
    {
      id: "sidebar",
      label: `Seitenleiste ${settings.sidebar ? "ausblenden" : "einblenden"}`,
      keys: "mod+\\",
      group: "Einstellungen",
      icon: <Icon.sidebar />,
      run: () => setSettings({ sidebar: !settings.sidebar }),
    },
    { id: "font+", label: "Editor-Schrift größer", detail: `${settings.fontSize}px`, group: "Einstellungen", icon: <Icon.zoomIn />, run: () => setSettings({ fontSize: Math.min(24, settings.fontSize + 1) }) },
    { id: "font-", label: "Editor-Schrift kleiner", detail: `${settings.fontSize}px`, group: "Einstellungen", icon: <Icon.zoomOut />, run: () => setSettings({ fontSize: Math.max(10, settings.fontSize - 1) }) },
    { id: "theme-system", label: "Design: wie System", keywords: "theme dark light", group: "Einstellungen", icon: <Icon.settings />, run: () => setSettings({ theme: "system" }) },
    { id: "theme-light", label: "Design: hell", keywords: "theme light", group: "Einstellungen", icon: <Icon.settings />, run: () => setSettings({ theme: "light" }) },
    { id: "theme-dark", label: "Design: dunkel", keywords: "theme dark", group: "Einstellungen", icon: <Icon.settings />, run: () => setSettings({ theme: "dark" }) },
  ];
  return [...actions, ...insert, ...files, ...prefs];
}
