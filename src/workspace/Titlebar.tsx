import { Icon } from "../icons";
import { keyLabel } from "./commands";

/** Obere Leiste: Projekt und Datei, Werkzeuge, Lösungen, Zoom, Export. */
export function Titlebar(p: {
  projectName: string;
  current: string | null;
  dirty: boolean;
  sidebar: boolean;
  solutions: boolean;
  zoom: number;
  title(id: string, label: string): string;
  onHome(): void;
  onToggleSidebar(): void;
  onLiterature(): void;
  onGraphics(): void;
  onSymbols(): void;
  onGrid(): void;
  onPalette(): void;
  onToggleSolutions(): void;
  onZoom(z: number): void;
  onExportMenu(anchor: DOMRect): void;
}) {
  return (
    <div className="titlebar" data-tauri-drag-region>
      <button className="icon-btn" title="Projektübersicht" onClick={p.onHome}>
        <Icon.home />
      </button>
      <button className={"icon-btn" + (p.sidebar ? " on" : "")} title={p.title("sidebar", "Seitenleiste")} onClick={p.onToggleSidebar}>
        <Icon.sidebar />
      </button>
      <div className="crumbs" data-tauri-drag-region>
        <span>{p.projectName}</span>
        {p.current && (
          <>
            <span className="sep">/</span>
            <span className="file">{p.current}</span>
          </>
        )}
        {p.dirty && <span className="dirty" title="Ungespeicherte Änderungen" />}
      </div>
      <div className="spacer" data-tauri-drag-region />
      <button className="icon-btn" title={p.title("literature", "Literatur & Zitate")} onClick={p.onLiterature}>
        <Icon.book />
      </button>
      <button className="icon-btn" title={p.title("graphics", "Grafik einfügen")} onClick={p.onGraphics}>
        <Icon.chart />
      </button>
      <button className="icon-btn" title={p.title("symbols", "Symbole")} onClick={p.onSymbols}>
        <Icon.math />
      </button>
      <button className="icon-btn" title={p.title("grid-editor", "Tabellen-Editor, in Formeln Matrix-Editor")} onClick={p.onGrid}>
        <Icon.table />
      </button>
      <button className="btn ghost" onClick={p.onPalette} title="Befehle, Bausteine, Dateien">
        <Icon.search /> <span style={{ color: "var(--muted)" }}>Befehle</span> <kbd>{keyLabel("mod+k")}</kbd>
      </button>
      <div className="divider" />
      <button className={"toggle" + (p.solutions ? " on" : "")} onClick={p.onToggleSolutions} title={p.title("solutions", "Lösungen ein-/ausblenden")}>
        <span className="knob" /> Lösungen
      </button>
      <div className="divider" />
      <div className="group">
        <button className="icon-btn" title={p.title("zoom-out", "Verkleinern")} onClick={() => p.onZoom(p.zoom / 1.15)}>
          <Icon.zoomOut />
        </button>
        <button className="btn ghost zoom-label" style={{ padding: 0 }} title={p.title("zoom-fit", "An Breite anpassen")} onClick={() => p.onZoom(1)}>
          {Math.round(p.zoom * 100)}%
        </button>
        <button className="icon-btn" title={p.title("zoom-in", "Vergrößern")} onClick={() => p.onZoom(p.zoom * 1.15)}>
          <Icon.zoomIn />
        </button>
      </div>
      <div className="divider" />
      <button
        className="btn primary"
        onClick={(e) => {
          e.stopPropagation();
          p.onExportMenu((e.currentTarget as HTMLElement).getBoundingClientRect());
        }}
      >
        <Icon.export /> Export <Icon.chevronDown />
      </button>
    </div>
  );
}
