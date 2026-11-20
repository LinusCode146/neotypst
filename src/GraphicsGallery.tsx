import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { GRAPHICS, type GraphicBlock } from "./graphics";

const thumbs = new Map<string, Promise<string>>();

function Thumb({ g }: { g: GraphicBlock }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let p = thumbs.get(g.id);
    if (!p) {
      p = api.renderSnippet(g.code, g.id);
      thumbs.set(g.id, p);
      p.catch(() => thumbs.delete(g.id));
    }
    p.then((s) => alive && setSvg(s)).catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [g]);
  if (failed) return <div className="gfx-wait">Vorschau nicht verfügbar</div>;
  if (!svg) return <div className="gfx-wait">Lade Pakete …</div>;
  return <div className="gfx-svg" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function GraphicsGallery({ onInsert, onClose }: { onInsert(g: GraphicBlock): void; onClose(): void }) {
  const categories = useMemo(() => ["Alle", ...new Set(GRAPHICS.map((g) => g.category))], []);
  const [cat, setCat] = useState("Alle");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const grid = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GRAPHICS.filter((g) => (cat === "Alle" || g.category === cat) && (!q || `${g.label} ${g.description} ${g.category}`.toLowerCase().includes(q)));
  }, [cat, query]);

  useEffect(() => setSel(0), [cat, query]);
  useEffect(() => {
    grid.current?.querySelector(".gfx-card.selected")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const cols = () => {
    const el = grid.current;
    return el ? Math.max(1, Math.round(el.clientWidth / 250)) : 3;
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog gfx-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="gfx-head">
          <input
            autoFocus
            className="symbol-search"
            placeholder="Grafik suchen … (z. B. „Koordinatensystem“, „Stromkreis“, „Automat“)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              const move = (d: number) => {
                e.preventDefault();
                setSel((s) => Math.max(0, Math.min(items.length - 1, s + d)));
              };
              if (e.key === "ArrowRight") move(1);
              else if (e.key === "ArrowLeft" && !query) move(-1);
              else if (e.key === "ArrowDown") move(cols());
              else if (e.key === "ArrowUp") move(-cols());
              else if (e.key === "Enter" && items[sel]) {
                e.preventDefault();
                onInsert(items[sel]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "Tab") {
                e.preventDefault();
                const i = categories.indexOf(cat);
                setCat(categories[(i + (e.shiftKey ? categories.length - 1 : 1)) % categories.length]);
              }
            }}
          />
          <div className="segmented gfx-tabs">
            {categories.map((c) => (
              <button key={c} className={c === cat ? "on" : ""} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="gfx-grid" ref={grid}>
          {items.length === 0 && <div className="symbol-empty">Keine Grafik gefunden</div>}
          {items.map((g, i) => (
            <button
              key={g.id}
              className={"gfx-card" + (i === sel ? " selected" : "")}
              onMouseMove={() => setSel(i)}
              onClick={() => onInsert(g)}
            >
              <div className="gfx-thumb">
                <Thumb g={g} />
              </div>
              <div className="gfx-meta">
                <span className="cat">{g.category}</span>
                <b>{g.label}</b>
                <span>{g.description}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="symbol-foot">
          <span className="dim">
            Benötigte Pakete ({[...new Set(items.flatMap((g) => g.imports.map((i) => i.match(/@preview\/([\w-]+)/)?.[1])).filter(Boolean))].join(", ")}) werden
            beim ersten Mal geladen und oben in der Datei importiert.
          </span>
          <span className="grow" />
          <span className="dim">
            <kbd>↩</kbd> einfügen · <kbd>⇥</kbd> Kategorie
          </span>
        </div>
      </div>
    </div>
  );
}
