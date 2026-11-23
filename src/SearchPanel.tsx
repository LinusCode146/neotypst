import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type FileEntry } from "./api";
import { Icon } from "./icons";
import { kbd, modKey } from "./platform";

type Match = { from: number; to: number; line: number; pre: string; text: string; post: string };
type FileHits = { path: string; matches: Match[] };
type Options = { caseSensitive: boolean; word: boolean; regex: boolean };

const MAX_MATCHES = 2000;
const SEARCHABLE = /\.(typ|bib|csv|txt|md|json|ya?ml|toml)$/i;

function buildRegex(query: string, o: Options): RegExp | string {
  if (!query) return "";
  let src = o.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (o.word) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`;
  try {
    const re = new RegExp(src, "gu" + (o.caseSensitive ? "" : "i"));
    if (re.test("")) return "Der Ausdruck passt auf leeren Text";
    return re;
  } catch (e) {
    return "Ungültiger regulärer Ausdruck: " + (e as Error).message.replace(/^Invalid regular expression: /, "");
  }
}

function findAll(text: string, re: RegExp, limit: number): Match[] {
  const out: Match[] = [];
  re.lastIndex = 0;
  let line = 1;
  let scanned = 0;
  let lineStart = 0;
  for (let m = re.exec(text); m && out.length < limit; m = re.exec(text)) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    // Count lines incrementally up to the match.
    for (let k = scanned; k < m.index; k++)
      if (text.charCodeAt(k) === 10) {
        line++;
        lineStart = k + 1;
      }
    scanned = m.index;
    const lineEnd = text.indexOf("\n", m.index);
    const end = m.index + m[0].length;
    const pre = text.slice(lineStart, m.index);
    out.push({
      from: m.index,
      to: end,
      line,
      pre: shortPre(pre),
      text: m[0].includes("\n") ? m[0].split("\n")[0] + " ⏎" : m[0],
      post: text.slice(end, lineEnd < 0 ? undefined : Math.max(end, lineEnd)).slice(0, 80),
    });
  }
  return out;
}

/** Little context before the match, so the match stays visible in the narrow sidebar. */
function shortPre(pre: string) {
  const t = pre.trimStart();
  if (t.length <= 14) return t;
  const cut = t.slice(-14);
  const sp = cut.indexOf(" ");
  return "…" + (sp >= 0 && sp < 8 ? cut.slice(sp + 1) : cut);
}

export type SearchPanelProps = {
  files: FileEntry[];
  current: string | null;
  /** Bumps when the open file's text changes, to refresh results. */
  textVersion: string;
  initialQuery: string;
  focusKey: number;
  /** Live text of the open file (unsaved changes included). */
  liveText(rel: string): string | null;
  open(rel: string, from: number, to: number, focusEditor: boolean): Promise<void>;
  /** Rewrites a file (through the editor if it is open). */
  edit(rel: string, fn: (text: string) => string): Promise<void>;
  /** Shows a message, optionally with an undo action. */
  notify(text: string, undo?: () => void): void;
  close(): void;
};

export function SearchPanel(p: SearchPanelProps) {
  const [query, setQuery] = useState(p.initialQuery);
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [opts, setOpts] = useState<Options>({ caseSensitive: false, word: false, regex: false });
  const [results, setResults] = useState<FileHits[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ path: string; i: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const run = useRef(0);
  const propsRef = useRef(p);
  propsRef.current = p;

  const re = useMemo(() => buildRegex(query, opts), [query, opts]);
  const error = typeof re === "string" && re ? re : null;

  useEffect(() => {
    if (p.initialQuery) setQuery(p.initialQuery);
    input.current?.focus();
    input.current?.select();
  }, [p.focusKey, p.initialQuery]);

  const paths = useMemo(
    () =>
      p.files
        .filter((f) => f.kind !== "dir" && SEARCHABLE.test(f.path) && !f.path.startsWith("out/"))
        .map((f) => f.path)
        .sort((a, b) => (a === p.current ? -1 : b === p.current ? 1 : a.localeCompare(b, "de", { numeric: true }))),
    [p.files, p.current],
  );

  const search = useCallback(async () => {
    const id = ++run.current;
    if (typeof re === "string") {
      setResults([]);
      return;
    }
    setBusy(true);
    const out: FileHits[] = [];
    let total = 0;
    for (const path of paths) {
      if (total >= MAX_MATCHES) break;
      let text = propsRef.current.liveText(path);
      if (text == null) text = await api.readFile(path).catch(() => null);
      if (id !== run.current) return;
      if (text == null) continue;
      const matches = findAll(text, re, MAX_MATCHES - total);
      if (matches.length) {
        out.push({ path, matches });
        total += matches.length;
      }
    }
    if (id !== run.current) return;
    setResults(out);
    setBusy(false);
  }, [re, paths]);

  // Debounced search on every change (query, options, files, edits).
  useEffect(() => {
    const t = window.setTimeout(search, 120);
    return () => window.clearTimeout(t);
  }, [search, p.textVersion]);

  const total = results.reduce((n, f) => n + f.matches.length, 0);
  const flat = useMemo(() => results.flatMap((f) => f.matches.map((m, i) => ({ path: f.path, i, m }))), [results]);

  const replaceIn = (text: string, m?: Match): string => {
    if (typeof re === "string") return text;
    // Literal replacement unless regex mode ($1, $& work there).
    const rep = opts.regex ? replacement : () => replacement;
    if (!m) return text.replace(re, rep as string);
    const one = new RegExp(re.source, re.flags.replace("g", ""));
    const piece = text.slice(m.from, m.to);
    return text.slice(0, m.from) + piece.replace(one, rep as string) + text.slice(m.to);
  };

  const goto = (k: number, focusEditor: boolean) => {
    if (!flat.length) return;
    const idx = ((k % flat.length) + flat.length) % flat.length;
    const hit = flat[idx];
    setActive({ path: hit.path, i: hit.i });
    void p.open(hit.path, hit.m.from, hit.m.to, focusEditor).then(() => {
      if (!focusEditor) input.current?.focus();
    });
  };
  const activeIndex = active ? flat.findIndex((h) => h.path === active.path && h.i === active.i) : -1;

  const replaceOne = async (path: string, m: Match) => {
    await p.edit(path, (t) => replaceIn(t, m));
    await search();
  };

  const replaceFile = async (path: string) => {
    let before = "";
    await p.edit(path, (t) => ((before = t), replaceIn(t)));
    const n = results.find((f) => f.path === path)?.matches.length ?? 0;
    p.notify(`${n} ersetzt in ${path}`, () => void p.edit(path, () => before));
    await search();
  };

  const replaceAll = async () => {
    const backups = new Map<string, string>();
    for (const f of results) await p.edit(f.path, (t) => (backups.set(f.path, t), replaceIn(t)));
    p.notify(`${total} Treffer in ${results.length} Datei${results.length === 1 ? "" : "en"} ersetzt`, () => {
      for (const [path, t] of backups) void p.edit(path, () => t);
    });
    await search();
  };

  const toggle = (k: keyof Options, label: string, text: string) => (
    <button className={"opt" + (opts[k] ? " on" : "")} title={label} onClick={() => setOpts({ ...opts, [k]: !opts[k] })}>
      {text}
    </button>
  );

  return (
    <div className="search-panel">
      <div className="sidebar-head">
        <span>Suchen</span>
        <div className="head-actions">
          <button className="icon-btn" title="Schließen (Esc)" onClick={p.close}>
            ×
          </button>
        </div>
      </div>
      <div className="search-fields">
        <button className={"twisty-btn" + (showReplace ? " open" : "")} title="Ersetzen ein-/ausblenden" onClick={() => setShowReplace(!showReplace)}>
          <Icon.chevron />
        </button>
        <div className="search-inputs">
          <div className={"tree-search" + (error ? " invalid" : "")}>
            <input
              ref={input}
              value={query}
              placeholder="Im Projekt suchen"
              spellCheck={false}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") p.close();
                else if (e.key === "Enter") {
                  e.preventDefault();
                  goto(activeIndex + (e.shiftKey ? -1 : 1), false);
                }
              }}
            />
            {toggle("caseSensitive", "Groß-/Kleinschreibung beachten", "Aa")}
            {toggle("word", "Nur ganze Wörter", "W")}
            {toggle("regex", "Regulärer Ausdruck", ".*")}
          </div>
          {showReplace && (
            <div className="tree-search">
              <input
                value={replacement}
                placeholder={opts.regex ? "Ersetzen ($1 für Gruppen)" : "Ersetzen"}
                spellCheck={false}
                onChange={(e) => setReplacement(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") p.close();
                  else if (e.key === "Enter" && modKey(e) && total) void replaceAll();
                }}
              />
              <button className="opt" title={kbd("Alle ersetzen (⌘↩)")} disabled={!total} onClick={() => void replaceAll()}>
                Alle
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="search-summary">
        {error ? (
          <span className="err">{error}</span>
        ) : !query ? (
          <span>↩ nächster Treffer, ⇧↩ vorheriger</span>
        ) : busy && !results.length ? (
          <span>Suche …</span>
        ) : total ? (
          <span>
            {total >= MAX_MATCHES ? `über ${MAX_MATCHES}` : total} Treffer in {results.length} Datei{results.length === 1 ? "" : "en"}
          </span>
        ) : (
          <span>Keine Treffer</span>
        )}
      </div>
      <div className="search-results">
        {results.map((f) => {
          const isCollapsed = collapsed.has(f.path);
          return (
            <div key={f.path} className="search-file">
              <div
                className="search-file-head"
                onClick={() => {
                  const next = new Set(collapsed);
                  if (isCollapsed) next.delete(f.path);
                  else next.add(f.path);
                  setCollapsed(next);
                }}
              >
                <span className={"twisty" + (isCollapsed ? "" : " open")}>
                  <Icon.chevron />
                </span>
                <span className="name">{f.path.split("/").pop()}</span>
                <span className="dir">{f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : ""}</span>
                <span className="count">{f.matches.length}</span>
                {showReplace && (
                  <button
                    className="row-action"
                    title="Alle in dieser Datei ersetzen"
                    onClick={(e) => {
                      e.stopPropagation();
                      void replaceFile(f.path);
                    }}
                  >
                    ⇄
                  </button>
                )}
              </div>
              {!isCollapsed &&
                f.matches.map((m, i) => (
                  <div
                    key={i}
                    className={"search-hit" + (active?.path === f.path && active.i === i ? " active" : "")}
                    title={`Zeile ${m.line}`}
                    onClick={() => {
                      setActive({ path: f.path, i });
                      void p.open(f.path, m.from, m.to, true);
                    }}
                  >
                    <span className="ln">{m.line}</span>
                    <span className="snip">
                      {m.pre}
                      <mark className={showReplace ? "strike" : undefined}>{m.text}</mark>
                      {showReplace && <ins>{previewReplace(re, m.text, replacement, opts.regex)}</ins>}
                      {m.post}
                    </span>
                    {showReplace && (
                      <button
                        className="row-action"
                        title="Ersetzen"
                        onClick={(e) => {
                          e.stopPropagation();
                          void replaceOne(f.path, m);
                        }}
                      >
                        ⇄
                      </button>
                    )}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function previewReplace(re: RegExp | string, text: string, replacement: string, regex: boolean) {
  if (typeof re === "string" || !regex) return replacement;
  return text.replace(new RegExp(re.source, re.flags.replace("g", "")), replacement);
}
