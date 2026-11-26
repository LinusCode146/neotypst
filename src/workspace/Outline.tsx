import type { Heading } from "../outline";

const fmt = (n: number) => String(n).replace(".", ",");

/** Gliederung der offenen Datei: Überschriften und Aufgaben mit Punkten. */
export function Outline({ items, onReveal }: { items: Heading[]; onReveal(line: number): void }) {
  if (items.length === 0) return null;
  const mitPunkten = items.filter((h) => h.punkte != null);
  const summe = mitPunkten.reduce((s, h) => s + (h.punkte ?? 0), 0);
  const nurAufgaben = items.every((h) => h.aufgabe);
  return (
    <div className="outline">
      <div className="sidebar-head">
        <span>{nurAufgaben ? "Aufgaben" : "Gliederung"}</span>
      </div>
      {items.map((h, i) => (
        <button
          key={i}
          className={"outline-row" + (h.aufgabe ? " task" : "")}
          style={{ paddingLeft: 8 + (h.aufgabe && !nurAufgaben ? 12 : (h.level - 1) * 12), fontWeight: !h.aufgabe && h.level === 1 ? 500 : 400 }}
          onClick={() => onReveal(h.line)}
        >
          <span className="otitle">{h.title}</span>
          {h.punkte != null && <span className="pts">{fmt(h.punkte)} P.</span>}
        </button>
      ))}
      {mitPunkten.length > 1 && (
        <div className="outline-sum">
          Gesamt<span className="pts">{fmt(summe)} P.</span>
        </div>
      )}
    </div>
  );
}
