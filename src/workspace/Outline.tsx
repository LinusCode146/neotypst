import type { Heading } from "../outline";

/** Gliederung der offenen Datei in der Seitenleiste. */
export function Outline({ items, onReveal }: { items: Heading[]; onReveal(line: number): void }) {
  if (items.length === 0) return null;
  return (
    <div className="outline">
      <div className="sidebar-head" style={{ paddingLeft: 8 }}>
        <span>Gliederung</span>
      </div>
      {items.map((h, i) => (
        <div
          key={i}
          className="outline-row"
          style={{ paddingLeft: 8 + (h.level - 1) * 12, fontWeight: h.level === 1 ? 500 : 400 }}
          onClick={() => onReveal(h.line)}
        >
          {h.title}
        </div>
      ))}
    </div>
  );
}
