import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type PaletteItem = {
  id: string;
  label: string;
  group: string;
  detail?: string;
  keywords?: string;
  icon?: ReactNode;
  run(): void;
};

/** Subsequence match with a bonus for word starts and contiguous runs. */
function score(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return 1000 - idx * 2 - t.length * 0.1;
  let s = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    run = found === ti ? run + 1 : 0;
    const wordStart = found === 0 || /[\s/._-]/.test(t[found - 1]);
    s += 10 + run * 5 + (wordStart ? 15 : 0) - (found - ti);
    ti = found + 1;
  }
  return s;
}

export function Palette({
  items,
  dynamic,
  placeholder,
  onClose,
}: {
  items: PaletteItem[];
  /** Extra items computed from the query (e.g. "3x4" → insert table). */
  dynamic?: (query: string) => PaletteItem[];
  placeholder: string;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const scored = items
      .map((item) => ({ item, s: score(query, `${item.label} ${item.keywords ?? ""} ${item.group}`) }))
      .filter((r) => r.s > 0);
    if (query) scored.sort((a, b) => b.s - a.s);
    const extra = query && dynamic ? dynamic(query) : [];
    return [...extra, ...scored.slice(0, 120).map((r) => r.item)];
  }, [items, query, dynamic]);

  useEffect(() => setSel(0), [query]);
  useEffect(() => {
    list.current?.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    // Let the palette unmount (and focus return) before running.
    setTimeout(() => item.run(), 0);
  };

  let lastGroup = "";
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Wie in den Vorschlägen beim Schreiben: Strg+J/K (und Strg+N/P)
            // wandern durch die Liste. Unter Windows ist Strg+K sonst das
            // Kürzel für die Palette selbst, darum nicht weiterreichen.
            const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
            const key = e.key.toLowerCase();
            if (e.key === "ArrowDown" || (ctrl && (key === "n" || key === "j"))) {
              e.preventDefault();
              e.stopPropagation();
              setSel((s) => Math.min(s + 1, results.length - 1));
            } else if (e.key === "ArrowUp" || (ctrl && (key === "p" || key === "k"))) {
              e.preventDefault();
              e.stopPropagation();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(results[sel]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <div className="palette-list" ref={list}>
          {results.length === 0 && <div className="palette-group">Nichts gefunden</div>}
          {results.map((item, i) => {
            const header = !query && item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {header && <div className="palette-group">{header}</div>}
                <div
                  className={"palette-item" + (i === sel ? " selected" : "")}
                  onMouseMove={() => setSel(i)}
                  onClick={() => run(item)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.detail && <span className="detail">{item.detail}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
