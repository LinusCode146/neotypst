import { useState } from "react";
import { api, type ProjektStil, type StilDatei } from "./api";
import { collapse, lineDiff, type DiffBlock } from "./diff";

const STATUS: Record<StilDatei["status"], string> = {
  aktuell: "aktuell",
  veraltet: "ältere Fassung",
  angepasst: "von Hand angepasst",
};

function Diff({ blocks }: { blocks: DiffBlock[] }) {
  return (
    <pre className="history-preview stil-diff">
      {blocks.map((b, i) =>
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
  );
}

/** Stil-Dateien des offenen Projekts mit der Fassung von NeoTypst vergleichen und ersetzen. */
export function StilDialog({
  files,
  broken,
  onDone,
  onClose,
}: {
  files: StilDatei[];
  /** Dateien, in denen der Compiler gerade Fehler meldet. */
  broken: string[];
  onDone(updated: string[]): void;
  onClose(): void;
}) {
  const offen = files.filter((f) => f.status !== "aktuell");
  const [chosen, setChosen] = useState(() => new Set(offen.filter((f) => f.status === "veraltet" || broken.includes(f.path)).map((f) => f.path)));
  const [diffs, setDiffs] = useState<Record<string, DiffBlock[] | "lädt">>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDiff = async (path: string) => {
    if (diffs[path]) {
      const { [path]: _, ...rest } = diffs;
      setDiffs(rest);
      return;
    }
    setDiffs((d) => ({ ...d, [path]: "lädt" }));
    try {
      const [mine, theirs] = await Promise.all([api.readFile(path), api.stilBundled(path)]);
      setDiffs((d) => ({ ...d, [path]: collapse(lineDiff(mine, theirs)) }));
    } catch (e) {
      setError(String(e));
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      onDone(await api.stilUpdate([...chosen]));
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog stil-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>Stil aktualisieren</h2>
          <p>
            Ersetzt die Kopien in diesem Projekt durch die Fassung von NeoTypst. Die alten Dateien kommen vorher in den Verlauf.
          </p>
        </div>
        <div className="dialog-body stil-list">
          {offen.length === 0 && <div className="dim">Alle Stil-Dateien sind aktuell.</div>}
          {offen.map((f) => (
            <div key={f.path} className="stil-row">
              <label className="stil-file">
                <input
                  type="checkbox"
                  checked={chosen.has(f.path)}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(f.path);
                    else next.delete(f.path);
                    setChosen(next);
                  }}
                />
                <code>{f.path}</code>
                <span className={"stil-status stil-" + f.status}>
                  {STATUS[f.status]}
                  {f.version && ` (${f.version})`}
                  {broken.includes(f.path) && ", hat Fehler"}
                </span>
                <span className="grow" />
                <button className="btn ghost small" onClick={() => void toggleDiff(f.path)}>
                  {diffs[f.path] ? "Unterschiede ausblenden" : "Unterschiede"}
                </button>
              </label>
              {f.status === "angepasst" && !broken.includes(f.path) && (
                <div className="stil-note">Enthält eigene Änderungen. Beim Ersetzen gehen sie verloren, im Verlauf bleiben sie erhalten.</div>
              )}
              {diffs[f.path] === "lädt" && <div className="dim stil-note">Lädt …</div>}
              {Array.isArray(diffs[f.path]) && <Diff blocks={diffs[f.path] as DiffBlock[]} />}
            </div>
          ))}
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="dialog-foot">
          <span className="dim history-legend">
            <span className="diff-add">neu in NeoTypst</span> <span className="diff-del">nur im Projekt</span>
          </span>
          <div className="grow" />
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" disabled={busy || chosen.size === 0} onClick={() => void run()}>
            {chosen.size === 1 ? "1 Datei ersetzen" : `${chosen.size} Dateien ersetzen`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Im Hub: unveränderte ältere Stil-Kopien in allen Projekten auf einmal ersetzen. */
export function StilAlleDialog({ projects, onClose }: { projects: ProjektStil[]; onClose(): void }) {
  const ziel = projects.filter((p) => p.veraltet.length > 0);
  const [state, setState] = useState<"bereit" | "läuft" | { fertig: number; fehler: string[] }>("bereit");

  const run = async () => {
    setState("läuft");
    let fertig = 0;
    const fehler: string[] = [];
    for (const p of ziel) {
      try {
        await api.stilUpdateProject(p.path, p.veraltet);
        fertig++;
      } catch (e) {
        fehler.push(`${p.name}: ${e}`);
      }
    }
    setState({ fertig, fehler });
  };

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog stil-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>Stil in allen Projekten aktualisieren</h2>
          <p>Ersetzt nur unveränderte ältere Fassungen. Von Hand angepasste Dateien bleiben, wie sie sind. Alte Dateien kommen in den Verlauf des Projekts.</p>
        </div>
        <div className="dialog-body stil-list">
          {projects.map((p) => (
            <div key={p.path} className="stil-row">
              <div className="stil-file">
                <b>{p.name}</b>
              </div>
              {p.veraltet.length > 0 && <div className="stil-note">wird ersetzt: {p.veraltet.join(", ")}</div>}
              {p.angepasst.length > 0 && <div className="stil-note stil-angepasst">bleibt (angepasst): {p.angepasst.join(", ")}</div>}
            </div>
          ))}
          {typeof state === "object" && (
            <div className="stil-result">
              {state.fertig === 1 ? "1 Projekt aktualisiert." : `${state.fertig} Projekte aktualisiert.`}
              {state.fehler.map((f) => (
                <div key={f} className="form-error">
                  {f}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="dialog-foot">
          <div className="grow" />
          <button className="btn" onClick={onClose}>
            {typeof state === "object" ? "Schließen" : "Abbrechen"}
          </button>
          {typeof state !== "object" && (
            <button className="btn primary" disabled={state === "läuft" || ziel.length === 0} onClick={() => void run()}>
              {ziel.length === 1 ? "1 Projekt aktualisieren" : `${ziel.length} Projekte aktualisieren`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
