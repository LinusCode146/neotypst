import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { CATEGORIES, type SymbolEntry } from "./symbolData";

const RECENT = "neotypst.recentSymbols";
let allSymbols: Promise<[string, string][]> | null = null;

function loadRecent(): SymbolEntry[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) || "[]");
  } catch {
    return [];
  }
}

function pushRecent(e: SymbolEntry) {
  const list = [e, ...loadRecent().filter((r) => r.name !== e.name)].slice(0, 24);
  try {
    localStorage.setItem(RECENT, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

function matches(e: SymbolEntry, q: string): number {
  const name = norm(e.label ?? e.name);
  const kw = norm(e.keywords ?? "");
  if (e.glyph === q) return 100;
  if (name === q) return 90;
  if (name.startsWith(q)) return 70;
  if (kw.split(" ").some((w) => w.startsWith(q))) return 60;
  if (name.includes(q)) return 40;
  if (kw.includes(q)) return 30;
  return 0;
}

export function SymbolPalette({ onInsert, onClose }: { onInsert(e: SymbolEntry, keepOpen: boolean): void; onClose(): void }) {
  const [known, setKnown] = useState<Map<string, string> | null>(null);
  const [cat, setCat] = useState<string>(() => (loadRecent().length ? "zuletzt" : "strukturen"));
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [recent, setRecent] = useState(loadRecent);
  const grid = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    allSymbols ??= api.symbols();
    allSymbols.then((list) => setKnown(new Map(list))).catch(() => setKnown(new Map()));
  }, []);

  // Curated categories, filtered to what this Typst version knows.
  const categories = useMemo(() => {
    if (!known) return CATEGORIES;
    return CATEGORIES.map((c) => ({
      ...c,
      entries: c.entries
        .filter((e) => e.snippet || known.has(e.name))
        .map((e) => (e.snippet ? e : { ...e, glyph: known.get(e.name) ?? e.glyph })),
    }));
  }, [known]);

  const allEntries = useMemo(() => {
    const curated = categories.flatMap((c) => c.entries);
    const seen = new Set(curated.map((e) => e.name));
    const rest: SymbolEntry[] = [...(known ?? new Map()).entries()]
      .filter(([n]) => !seen.has(n))
      .map(([name, glyph]) => ({ name, glyph }));
    return [...curated, ...rest];
  }, [categories, known]);

  const entries: SymbolEntry[] = useMemo(() => {
    const q = norm(query.trim());
    if (q) {
      return allEntries
        .map((e) => ({ e, m: matches(e, q) }))
        .filter((r) => r.m > 0)
        .sort((a, b) => b.m - a.m)
        .slice(0, 200)
        .map((r) => r.e);
    }
    if (cat === "zuletzt") return recent;
    if (cat === "alle") return allEntries;
    return categories.find((c) => c.id === cat)?.entries ?? [];
  }, [query, cat, categories, allEntries, recent]);

  useEffect(() => setSel(0), [query, cat]);
  useEffect(() => {
    grid.current?.querySelector(".sym.selected")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const columns = () => {
    const el = grid.current;
    if (!el) return 8;
    return Math.max(1, Math.floor((el.clientWidth - 16) / 76));
  };

  const insert = (e: SymbolEntry | undefined, keepOpen: boolean) => {
    if (!e) return;
    pushRecent(e);
    setRecent(loadRecent());
    onInsert(e, keepOpen);
    if (keepOpen) input.current?.focus();
  };

  const tabs = [
    ...(recent.length ? [{ id: "zuletzt", label: "Zuletzt" }] : []),
    ...categories.map((c) => ({ id: c.id, label: c.label })),
    { id: "alle", label: "Alle" },
  ];

  const current = entries[sel];

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog symbol-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="symbol-search"
          autoFocus
          placeholder="Symbol suchen … (z. B. „ungleich“, „pfeil“, „alpha“, „≈“)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            const cols = columns();
            const move = (d: number) => {
              e.preventDefault();
              setSel((s) => Math.max(0, Math.min(entries.length - 1, s + d)));
            };
            if (e.key === "ArrowRight") move(1);
            else if (e.key === "ArrowLeft" && (query === "" || (e.currentTarget.selectionStart ?? 0) === 0)) move(-1);
            else if (e.key === "ArrowDown") move(cols);
            else if (e.key === "ArrowUp") move(-cols);
            else if (e.key === "Enter") {
              e.preventDefault();
              insert(current, e.shiftKey);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "Tab") {
              e.preventDefault();
              const i = tabs.findIndex((t) => t.id === cat);
              const next = tabs[(i + (e.shiftKey ? tabs.length - 1 : 1)) % tabs.length];
              setQuery("");
              setCat(next.id);
            }
          }}
        />
        <div className="symbol-body">
          <nav className="symbol-tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={!query && t.id === cat ? "on" : ""}
                onClick={() => {
                  setQuery("");
                  setCat(t.id);
                  input.current?.focus();
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="symbol-grid" ref={grid}>
            {entries.length === 0 && <div className="symbol-empty">{query ? "Kein Symbol gefunden" : "Noch nichts benutzt"}</div>}
            {entries.map((e, i) => (
              <button
                key={e.name + i}
                className={"sym" + (i === sel ? " selected" : "") + (e.snippet ? " structure" : "")}
                title={e.label ?? e.name}
                onMouseMove={() => setSel(i)}
                onClick={(ev) => insert(e, ev.shiftKey)}
              >
                <span className="glyph">{e.glyph}</span>
                <span className="sym-name">{e.label ?? e.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="symbol-foot">
          {current ? (
            <>
              <span className="big-glyph">{current.glyph}</span>
              <span className="sym-info">
                {current.label && <b>{current.label}</b>}
                <code>{current.name}</code>
                {current.keywords && <span className="dim">{current.keywords}</span>}
              </span>
            </>
          ) : (
            <span />
          )}
          <span className="grow" />
          <span className="dim">
            <kbd>↩</kbd> einfügen · <kbd>⇧↩</kbd> einfügen, offen lassen · <kbd>⇥</kbd> Kategorie
          </span>
        </div>
      </div>
    </div>
  );
}
