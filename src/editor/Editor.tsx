import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Compartment, EditorSelection, EditorState, Prec, type Extension, type Transaction } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, isolateHistory, historyKeymap, indentMore, indentLess, toggleComment } from "@codemirror/commands";
import { bracketMatching, indentUnit } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap, search } from "@codemirror/search";
import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  snippet,
  startCompletion,
} from "@codemirror/autocomplete";
import { lintKeymap, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { vim, Vim, getCM } from "@replit/codemirror-vim";

import { api, type Diag, type SpellIssue } from "../api";
import { getSettings, useSettings } from "../settings";
import { typstHighlight } from "./highlight";
import { snippetSource, typstSource } from "./completion";
import { convertPipeTable, expandAbbreviation, wrapSelection } from "./snippets";

export type EditorHandle = {
  openFile(rel: string, text: string): void;
  forgetFile(rel: string): void;
  currentFile(): string | null;
  getText(): string;
  reveal(offset: number, focus?: boolean): void;
  revealLine(line: number): void;
  setDiagnostics(diags: Diag[]): void;
  setSpelling(issues: SpellIssue[]): void;
  insertSnippet(body: string): void;
  insertText(text: string): void;
  command(name: EditorCommand): void;
  focus(): void;
  cursor(): number;
  /** Replaces a range and selects nothing; returns the inserted end. */
  replaceRange(from: number, to: number, text: string): void;
  /** Leading whitespace of the line containing `pos`. */
  indentAt(pos: number): string;
  charBefore(pos: number): string;
  /** Inserts text at `pos` without moving the cursor (except by mapping). */
  insertAtKeepCursor(pos: number, text: string): void;
  replaceRangeKeepCursor(from: number, to: number, text: string): void;
  /** Main selection range. */
  selection(): { from: number; to: number };
  /** Selects a range and scrolls it to the middle. */
  select(from: number, to: number, focus?: boolean): void;
  /** Replaces `[from, to)` line by line, so the cursor stays where lines are unchanged. */
  applyEdit(from: number, to: number, text: string): void;
};

export type EditorCommand = "bold" | "italic" | "math" | "displayMath" | "convertTable" | "comment" | "complete";

type Props = {
  onChange(rel: string, text: string): void;
  onCursor(rel: string, offset: number, line: number, col: number): void;
  onSave(): void;
  onRevealInPreview(): void;
  onVimMode(mode: string | null): void;
  onTableEditor(): void;
  onSymbols(): void;
  onGraphics(): void;
  onSpellAction(action: "learn" | "project" | "ignore", word: string): void;
  onLiterature(): void;
  onPasteImage(files: File[]): void;
  onFormat(): void;
};

const vimCompartment = new Compartment();
const gutterCompartment = new Compartment();
const wrapCompartment = new Compartment();

const vimExt = () => (getSettings().vim ? vim({ status: false }) : []);
const gutterExt = () => (getSettings().lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []);
const wrapExt = () => (getSettings().wrap ? EditorView.lineWrapping : []);

/**
 * Shift+Enter (only without vim): jump to the next line, keeping the column;
 * on the last line a new empty line is appended first.
 */
function lineDownOrAppend(v: EditorView): boolean {
  if (getSettings().vim) return false;
  const { state } = v;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const col = head - line.from;
  if (line.number < state.doc.lines) {
    const next = state.doc.line(line.number + 1);
    v.dispatch({ selection: { anchor: next.from + Math.min(col, next.length) }, scrollIntoView: true, userEvent: "select" });
  } else {
    const end = state.doc.length;
    v.dispatch({ changes: { from: end, insert: "\n" }, selection: { anchor: end + 1 }, scrollIntoView: true, userEvent: "input" });
  }
  return true;
}

/** Space between auto-paired `$|$` → `$ | $` (display math). */
const mathSpace = EditorView.inputHandler.of((v, from, to, text) => {
  if (text !== " " || from !== to || v.state.selection.ranges.length > 1) return false;
  if (v.state.doc.sliceString(from - 1, from + 1) !== "$$") return false;
  v.dispatch({ changes: { from, insert: "  " }, selection: { anchor: from + 1 }, userEvent: "input.type" });
  return true;
});

/** Backspace in `$ | $` removes both spaces again. */
function mathSpaceBackspace(v: EditorView): boolean {
  if (getSettings().vim && !(getCM(v) as any)?.state?.vim?.insertMode) return false;
  const sel = v.state.selection;
  if (sel.ranges.length > 1 || !sel.main.empty) return false;
  const at = sel.main.head;
  if (v.state.doc.sliceString(at - 2, at + 2) !== "$  $") return false;
  v.dispatch({ changes: { from: at - 1, to: at + 1 }, userEvent: "delete.backward" });
  return true;
}

/** Characters that end a word in a formula and trigger the auto-quote check. */
const WORD_END = /^[\s,;=+\-*/)\]}^_<>!?:.|&$]/;
/** Known identifiers that are still joined into a preceding text string. */
const TEXT_WORDS = new Set(["in", "and", "or", "not", "for", "to", "of", "at", "on", "as", "if", "is"]);

/** Wraps `[from, to)` in quotes — or appends it to a string right before it (`"a" b` → `"a b"`). */
function quoteWord(v: EditorView, from: number, to: number, joinOnly = false): boolean {
  const line = v.state.doc.lineAt(from);
  const prefix = v.state.doc.sliceString(line.from, from);
  const join = /"(?:[^"\\]|\\.)*" $/.test(prefix);
  if (joinOnly && !join) return false;
  const changes = join
    ? [{ from: from - 2, to: from - 1 }, { from: to, insert: '"' }]
    : [{ from, insert: '"' }, { from: to, insert: '"' }];
  v.dispatch({ changes, annotations: isolateHistory.of("full"), userEvent: "input.autoquote" });
  return true;
}

/** Number of unescaped `"` in a string — odd means we are inside a string literal. */
const quoteCount = (s: string) => (s.match(/(?<!\\)"/g) ?? []).length;

const IMAGE_NAME = /^[^\n/]+\.(png|jpe?g|gif|webp|svg|tiff?|heic)$/i;

/**
 * Images on the clipboard (screenshot, copied image, image file from Finder).
 * Text wins when real text comes along — Numbers/Excel put a picture of the cells there too.
 */
export function clipboardImages(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = [...data.files].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return [];
  const text = data.getData("text/plain");
  if (text && !text.split("\n").every((l) => !l.trim() || IMAGE_NAME.test(l.trim().split("/").pop()!))) return [];
  return files;
}

/** Line-level changes turning `a` into `b` (LCS); falls back to one change for huge inputs. */
export function lineChanges(a: string, b: string, offset: number): { from: number; to: number; insert: string }[] {
  const A = a.split("\n");
  const B = b.split("\n");
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a2 = A.slice(pre, A.length - suf);
  const b2 = B.slice(pre, B.length - suf);
  const lineStart = (lines: string[], i: number) => lines.slice(0, i).reduce((n, l) => n + l.length + 1, 0);
  const base = offset + lineStart(A, pre);
  const n = a2.length;
  const m = b2.length;
  // The line walk below needs a common last line (every changed line ends in "\n").
  if (suf === 0 || n * m > 4_000_000) {
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let q = 0;
    while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
    if (p === a.length && p === b.length) return [];
    return [{ from: offset + p, to: offset + a.length - q, insert: b.slice(p, b.length - q) }];
  }
  // LCS table over the differing middle.
  const dp = new Int32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i * (m + 1) + j] = a2[i] === b2[j] ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
  const out: { from: number; to: number; insert: string }[] = [];
  let i = 0;
  let j = 0;
  let pos = base; // start of line a2[i] in the old document
  let cur: { from: number; to: number; ins: string[] } | null = null;
  const flush = () => {
    if (cur) out.push({ from: cur.from, to: cur.to, insert: cur.ins.map((l) => l + "\n").join("") });
    cur = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && a2[i] === b2[j]) {
      flush();
      pos += a2[i].length + 1;
      i++;
      j++;
    } else if (j < m && (i === n || dp[i * (m + 1) + j + 1] >= dp[(i + 1) * (m + 1) + j])) {
      cur ??= { from: pos, to: pos, ins: [] };
      cur.ins.push(b2[j++]);
    } else {
      cur ??= { from: pos, to: pos, ins: [] };
      pos += a2[i].length + 1;
      cur.to = pos;
      i++;
    }
  }
  flush();
  return out;
}

const typstLanguageData = EditorState.languageData.of(() => [
  {
    closeBrackets: { brackets: ["(", "[", "{", '"', "$"] },
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
  },
]);

export const Editor = forwardRef<EditorHandle, Props>(function Editor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const rel = useRef<string | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const propsRef = useRef(props);
  propsRef.current = props;
  const suppressCursor = useRef(false);
  const compileDiags = useRef<Diagnostic[]>([]);
  const spellDiags = useRef<Diagnostic[]>([]);
  const pushDiagnostics = () => {
    const v = view.current;
    if (v) v.dispatch(setDiagnostics(v.state, [...compileDiags.current, ...spellDiags.current]));
  };
  const settings = useSettings();

  const extensions = (): Extension[] => [
    vimCompartment.of(vimExt()),
    gutterCompartment.of(gutterExt()),
    wrapCompartment.of(wrapExt()),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    EditorState.tabSize.of(2),
    indentUnit.of("  "),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    typstLanguageData,
    mathSpace,
    EditorView.domEventHandlers({
      paste(e) {
        const images = clipboardImages(e.clipboardData);
        if (!images.length) return false;
        e.preventDefault();
        propsRef.current.onPasteImage(images);
        return true;
      },
    }),
    typstHighlight,
    autocompletion({
      override: [typstSource(() => rel.current), snippetSource],
      icons: true,
      closeOnBlur: true,
      maxRenderedOptions: 80,
    }),
    Prec.high(
      keymap.of([
        { key: "Tab", run: (v) => acceptCompletion(v) || expandAbbreviation(v) || indentMore(v), shift: indentLess },
        { key: "Mod-s", run: () => (propsRef.current.onSave(), true) },
        { key: "Mod-b", run: (v) => wrapSelection(v, "*") },
        { key: "Mod-i", run: (v) => wrapSelection(v, "_") },
        { key: "Mod-m", run: (v) => wrapSelection(v, "$") },
        { key: "Mod-Shift-m", run: (v) => wrapSelection(v, "$ ", " $") },
        { key: "Mod-Shift-t", run: convertPipeTable },
        { key: "Mod-j", run: () => (propsRef.current.onRevealInPreview(), true) },
        { key: "Mod-t", run: () => (propsRef.current.onTableEditor(), true) },
        { key: "Mod-Shift-s", run: () => (propsRef.current.onSymbols(), true) },
        { key: "Mod-Shift-g", run: () => (propsRef.current.onGraphics(), true) },
        { key: "Mod-Shift-b", run: () => (propsRef.current.onLiterature(), true) },
        { key: "Ctrl-Space", run: startCompletion },
        { key: "Shift-Alt-f", run: () => (propsRef.current.onFormat(), true) },
        { key: "Shift-Enter", run: lineDownOrAppend },
        { key: "Backspace", run: mathSpaceBackspace },
      ]),
    ),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, ...lintKeymap]),
    EditorView.updateListener.of((u) => {
      const file = rel.current;
      if (!file) return;
      if (u.docChanged) {
        propsRef.current.onChange(file, u.state.doc.toString());
        maybeAutoQuote(u.view, u.transactions);
      } else if (u.selectionSet) {
        maybeAutoQuote(u.view, u.transactions);
      }
      if (u.selectionSet || u.docChanged) {
        const head = u.state.selection.main.head;
        const line = u.state.doc.lineAt(head);
        if (suppressCursor.current) suppressCursor.current = false;
        else propsRef.current.onCursor(file, head, line.number, head - line.from + 1);
      }
      attachVimListener(u.view);
    }),
  ];

  /** After a word-ending character in a formula: quote the word before it if Typst doesn't know it. */
  const maybeAutoQuote = (v: EditorView, trs: readonly Transaction[]) => {
    if (!getSettings().mathQuote || trs.length !== 1) return;
    const tr = trs[0];
    if (!tr.isUserEvent("input") || tr.isUserEvent("input.autoquote") || tr.isUserEvent("input.paste")) return;
    if (v.state.selection.ranges.length > 1) return;
    const doc = v.state.doc;
    let at = -1;
    let typed = "";
    let count = 0;
    if (tr.docChanged) {
      tr.changes.iterChanges((_fa, _ta, fromB, _tb, ins) => {
        count++;
        at = fromB;
        typed = ins.toString();
      });
    } else {
      // closeBrackets stepping over an auto-inserted `$` or `)`.
      const head = v.state.selection.main.head;
      if (!v.state.selection.main.empty || tr.startState.selection.main.head !== head - 1) return;
      count = 1;
      at = head - 1;
      typed = doc.sliceString(at, head);
    }
    if (count !== 1 || !typed || !WORD_END.test(typed)) return;
    const line = doc.lineAt(at);
    const before = doc.sliceString(line.from, at);
    const m = /(\p{L}{2,})$/u.exec(before);
    if (!m) return;
    const start = at - m[1].length;
    const prev = before.charAt(before.length - m[1].length - 1);
    if (prev && /[\p{L}\p{N}#.\\@"]/u.test(prev)) return;
    if (quoteCount(before.slice(0, before.length - m[1].length)) % 2 === 1) return;
    const file = rel.current;
    if (!file) return;
    const word = m[1];
    api
      .mathWord(file, doc.toString(), at)
      .then((res) => {
        if (!res || res.from !== start || res.to !== at) return;
        const cur = view.current;
        if (!cur || cur !== v || rel.current !== file) return;
        if (cur.state.doc.sliceString(start, at) !== word) return;
        if (!WORD_END.test(cur.state.doc.sliceString(at, at + 1))) return;
        if (!res.known) quoteWord(cur, start, at);
        else if (TEXT_WORDS.has(word)) quoteWord(cur, start, at, true);
      })
      .catch(() => {});
  };

  const vimAttached = useRef<unknown>(null);
  const attachVimListener = (v: EditorView) => {
    const cm = getSettings().vim ? getCM(v) : null;
    if (!cm) {
      if (vimAttached.current) {
        vimAttached.current = null;
        propsRef.current.onVimMode(null);
      }
      return;
    }
    if (vimAttached.current === cm) return;
    vimAttached.current = cm;
    propsRef.current.onVimMode("normal");
    cm.on("vim-mode-change", (e: { mode: string; subMode?: string }) => {
      propsRef.current.onVimMode(e.subMode ? `${e.mode} ${e.subMode}` : e.mode);
    });
  };

  useEffect(() => {
    const v = new EditorView({ parent: host.current!, state: EditorState.create({ doc: "", extensions: extensions() }) });
    view.current = v;
    Vim.defineEx("write", "w", () => propsRef.current.onSave());
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live settings changes.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({
      effects: [
        vimCompartment.reconfigure(vimExt()),
        gutterCompartment.reconfigure(gutterExt()),
        wrapCompartment.reconfigure(wrapExt()),
      ],
    });
    attachVimListener(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.vim, settings.lineNumbers, settings.wrap]);

  useImperativeHandle(ref, () => ({
    openFile(file, text) {
      const v = view.current!;
      if (rel.current) states.current.set(rel.current, v.state);
      let state = states.current.get(file);
      if (!state || state.doc.toString() !== text) {
        state = EditorState.create({ doc: text, extensions: extensions() });
      }
      rel.current = file;
      compileDiags.current = [];
      spellDiags.current = [];
      v.setState(state);
      v.dispatch({
        effects: [
          vimCompartment.reconfigure(vimExt()),
          gutterCompartment.reconfigure(gutterExt()),
          wrapCompartment.reconfigure(wrapExt()),
        ],
      });
      vimAttached.current = null;
      attachVimListener(v);
      v.focus();
    },
    forgetFile(file) {
      states.current.delete(file);
    },
    currentFile: () => rel.current,
    getText: () => view.current?.state.doc.toString() ?? "",
    reveal(offset, focus = true) {
      const v = view.current!;
      const pos = Math.min(offset, v.state.doc.length);
      suppressCursor.current = true;
      v.dispatch({
        selection: EditorSelection.cursor(pos),
        effects: EditorView.scrollIntoView(pos, { y: "center" }),
      });
      if (focus) v.focus();
    },
    revealLine(line) {
      const v = view.current!;
      const l = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines)));
      v.dispatch({ selection: EditorSelection.cursor(l.from), effects: EditorView.scrollIntoView(l.from, { y: "start", yMargin: 40 }) });
      v.focus();
    },
    setDiagnostics(diags) {
      const v = view.current!;
      const len = v.state.doc.length;
      const list: Diagnostic[] = diags
        .filter((d) => d.file === rel.current && d.from != null)
        .map((d) => {
          const from = Math.min(d.from!, len);
          let to = Math.min(d.to ?? from, len);
          if (to <= from) to = Math.min(from + 1, len);
          const word = v.state.doc.sliceString(from, to);
          const textFix = /unknown variable/.test(d.message) && /^\p{L}{2,}$/u.test(word);
          return {
            from,
            to,
            severity: d.severity,
            message: d.message + (d.hints.length ? "\n\nTipp: " + d.hints.join("\nTipp: ") : ""),
            actions: textFix
              ? [{ name: `Als Text „${word}“`, apply: (view: EditorView, f: number, t: number) => void quoteWord(view, f, t) }]
              : undefined,
          };
        });
      compileDiags.current = list;
      pushDiagnostics();
    },
    setSpelling(issues) {
      const v = view.current!;
      const len = v.state.doc.length;
      const langName = (l: string) => (l === "de" ? "Deutsch" : l === "en" ? "Englisch" : l);
      spellDiags.current = issues
        .filter((i) => i.to <= len)
        .map((i) => ({
          from: i.from,
          to: i.to,
          severity: "info" as const,
          markClass: "cm-spell",
          source: "Rechtschreibung · " + langName(i.lang),
          message: i.suggestions.length ? `„${i.word}“ – meintest du:` : `„${i.word}“ ist unbekannt`,
          actions: [
            ...i.suggestions.slice(0, 4).map((s) => ({
              name: s,
              apply: (view: EditorView, from: number, to: number) => {
                view.dispatch({ changes: { from, to, insert: s }, userEvent: "input" });
              },
            })),
            { name: "Zum Wörterbuch", apply: () => propsRef.current.onSpellAction("learn", i.word) },
            { name: "Nur im Projekt", apply: () => propsRef.current.onSpellAction("project", i.word) },
            { name: "Ignorieren", apply: () => propsRef.current.onSpellAction("ignore", i.word) },
          ],
        }));
      pushDiagnostics();
    },
    insertSnippet(body) {
      const v = view.current!;
      const { from, to } = v.state.selection.main;
      snippet(body)(v, null as never, from, to);
      v.focus();
    },
    insertText(text) {
      const v = view.current!;
      const { from, to } = v.state.selection.main;
      v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: "input" });
      v.focus();
    },
    command(name) {
      const v = view.current!;
      v.focus();
      switch (name) {
        case "bold":
          return void wrapSelection(v, "*");
        case "italic":
          return void wrapSelection(v, "_");
        case "math":
          return void wrapSelection(v, "$");
        case "displayMath":
          return void wrapSelection(v, "$ ", " $");
        case "convertTable":
          return void convertPipeTable(v);
        case "comment":
          return void toggleComment(v);
        case "complete":
          return void startCompletion(v);
      }
    },
    focus: () => view.current?.focus(),
    cursor: () => view.current?.state.selection.main.head ?? 0,
    replaceRange(from, to, text) {
      const v = view.current!;
      v.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
        scrollIntoView: true,
        userEvent: "input",
      });
      v.focus();
    },
    indentAt(pos) {
      const v = view.current!;
      return v.state.doc.lineAt(Math.min(pos, v.state.doc.length)).text.match(/^\s*/)![0];
    },
    replaceRangeKeepCursor(from, to, text) {
      view.current?.dispatch({ changes: { from, to, insert: text }, userEvent: "input" });
    },
    insertAtKeepCursor(pos, text) {
      view.current?.dispatch({ changes: { from: pos, insert: text }, userEvent: "input" });
    },
    charBefore(pos) {
      return view.current?.state.sliceDoc(Math.max(0, pos - 1), pos) ?? "";
    },
    selection() {
      const m = view.current?.state.selection.main;
      return { from: m?.from ?? 0, to: m?.to ?? 0 };
    },
    select(from, to, focus = true) {
      const v = view.current!;
      const len = v.state.doc.length;
      const a = Math.min(from, len);
      const b = Math.min(to, len);
      suppressCursor.current = true;
      v.dispatch({ selection: EditorSelection.range(a, b), effects: EditorView.scrollIntoView(a, { y: "center" }) });
      if (focus) v.focus();
    },
    applyEdit(from, to, text) {
      const v = view.current!;
      const changes = lineChanges(v.state.sliceDoc(from, to), text, from);
      if (changes.length) v.dispatch({ changes, userEvent: "input.format", scrollIntoView: false });
    },
  }));

  return <div className="editor-host" ref={host} style={{ ["--editor-size" as string]: `${settings.fontSize}px` }} />;
});
