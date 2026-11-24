import type { Diag, StilDatei } from "../api";
import { Icon } from "../icons";

/** Hinweise über dem Editor: älterer oder kaputter Stil, Konflikt mit Änderungen von außen. */
export function EditorNotices(p: {
  stil: StilDatei[];
  diags: Diag[];
  stilLater: boolean;
  onStilLater(): void;
  onStilOpen(): void;
  /** Datei mit Konflikt, nur wenn es die offene ist. */
  conflict: string | null;
  onResolve(keep: "mine" | "disk"): void;
}) {
  const veraltet = p.stil.filter((d) => d.status === "veraltet");
  const kaputt = p.stil.filter((d) => d.status !== "aktuell" && p.diags.some((g) => g.severity === "error" && g.file === d.path));
  const stilBar = !p.stilLater && (veraltet.length > 0 || kaputt.length > 0);
  return (
    <>
      {stilBar && (
        <div className="conflict-bar stil-bar" role="status">
          <Icon.bolt />
          <span className="conflict-text">
            {kaputt.length ? (
              <>
                <b>{kaputt[0].path}</b> hat Fehler und weicht von der Fassung in NeoTypst ab.
              </>
            ) : (
              <>Der Stil in diesem Projekt ist älter als in NeoTypst ({veraltet.map((d) => d.path.replace("templates/", "")).join(", ")}).</>
            )}
          </span>
          <button className="btn" onClick={p.onStilLater}>
            Später
          </button>
          <button className="btn primary" onClick={p.onStilOpen}>
            Ansehen …
          </button>
        </div>
      )}
      {p.conflict && (
        <div className="conflict-bar" role="alert">
          <Icon.alert />
          <span className="conflict-text">
            <b>{p.conflict}</b> wurde außerhalb von NeoTypst geändert. Deine Änderungen hier sind noch nicht gespeichert.
          </span>
          <button className="btn" onClick={() => p.onResolve("disk")}>
            Neu laden
          </button>
          <button className="btn primary" onClick={() => p.onResolve("mine")}>
            Meine Version behalten
          </button>
        </div>
      )}
    </>
  );
}
