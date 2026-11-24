import { useEffect, useMemo, useState } from "react";
import { api, type HistoryEntry } from "./api";
import { collapse, lineDiff } from "./diff";

const GRUND: Record<string, string> = {
  auto: "",
  loeschung: "vor dem Löschen",
  "vor-neuladen": "vor dem Neuladen",
  "vor-ueberschreiben": "fremde Fassung, vor dem Überschreiben",
  "vor-wiederherstellen": "vor dem Wiederherstellen",
};

/** „heute 10:15“, „gestern 18:02“, „Mo 23.11. 09:00“. */
export function zeitText(ms: number, jetzt = new Date()): string {
  const d = new Date(ms);
  const uhr = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const tag = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const tage = Math.round((tag(jetzt) - tag(d)) / 86_400_000);
  if (tage === 0) return `heute ${uhr}`;
  if (tage === 1) return `gestern ${uhr}`;
  const datum = d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  return `${datum} ${uhr}`;
}

/** Frühere Stände der offenen Datei, mit Vergleich zum jetzigen Text. */
export function HistoryDialog({
  rel,
  current,
  onRestore,
  onClose,
}: {
  rel: string;
  current: string;
  onRestore(text: string, entry: HistoryEntry): void;
  onClose(): void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.historyList(rel).then(setEntries, (e) => setError(String(e)));
  }, [rel]);

  const entry = entries?.[selected];
  useEffect(() => {
    setText(null);
    if (entry) api.historyRead(rel, entry.id).then(setText, (e) => setError(String(e)));
  }, [rel, entry]);

  // Vergleich: was der Stand gegenüber jetzt anders hat („+“ = nur im Stand).
  const diff = useMemo(() => (text == null ? null : lineDiff(current, text)), [current, text]);
  const changed = diff?.filter((l) => l.kind !== "same").length ?? 0;
  const blocks = useMemo(() => (diff && changed ? collapse(diff) : null), [diff, changed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown" && entries) setSelected((s) => Math.min(entries.length - 1, s + 1));
      else if (e.key === "ArrowUp") setSelected((s) => Math.max(0, s - 1));
      else if (e.key === "Enter" && entry && text != null && changed) onRestore(text, entry);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog history-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>Verlauf von {rel}</h2>
          <p>Frühere Stände, gesichert beim Speichern. Wiederherstellen lässt sich mit ⌘Z rückgängig machen.</p>
        </div>
        <div className="history-body">
          <div className="history-list">
            {entries?.length === 0 && <div className="dim history-empty">Noch keine früheren Stände.</div>}
            {entries?.map((e, i) => (
              <button key={e.id} className={"history-item" + (i === selected ? " selected" : "")} onClick={() => setSelected(i)}>
                <span>{zeitText(e.zeit)}</span>
                {GRUND[e.grund] !== "" && <span className="history-reason">{GRUND[e.grund] ?? e.grund}</span>}
              </button>
            ))}
          </div>
          <pre className="history-preview">
            {error && <span className="form-error">{error}</span>}
            {diff && changed === 0 && <div className="dim history-same">Gleich wie der jetzige Text.</div>}
            {blocks?.map((b, i) =>
              b.kind === "skip" ? (
                <div key={i} className="diff-skip">
                  {b.count === 1 ? "1 unveränderte Zeile" : `${b.count} unveränderte Zeilen`}
                </div>
              ) : (
                <div key={i} className={"diff-" + b.kind}>
                  {b.text || " "}
                </div>
              ),
            )}
          </pre>
        </div>
        <div className="dialog-foot">
          <span className="dim history-legend">
            <span className="diff-add">nur im Stand</span> <span className="diff-del">nur jetzt</span>
          </span>
          <div className="grow" />
          <button className="btn" onClick={onClose}>
            Schließen
          </button>
          <button className="btn primary" disabled={!entry || text == null || changed === 0} onClick={() => entry && text != null && onRestore(text, entry)}>
            Wiederherstellen
          </button>
        </div>
      </div>
    </div>
  );
}
