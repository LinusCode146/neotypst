import { Icon } from "../icons";
import { keyLabel } from "./commands";

/** Obere Leiste: Übersicht, Seitenleiste, Projekt und Datei, Befehle. */
export function Titlebar(p: {
  projectName: string;
  current: string | null;
  dirty: boolean;
  sidebar: boolean;
  title(id: string, label: string): string;
  onHome(): void;
  onToggleSidebar(): void;
  onPalette(): void;
}) {
  return (
    <div className="titlebar" data-tauri-drag-region>
      <button className="icon-btn" title="Projektübersicht" aria-label="Projektübersicht" onClick={p.onHome}>
        <Icon.home />
      </button>
      <button
        className={"icon-btn" + (p.sidebar ? " on" : "")}
        title={p.title("sidebar", p.sidebar ? "Seitenleiste ausblenden" : "Seitenleiste einblenden")}
        aria-label={p.sidebar ? "Seitenleiste ausblenden" : "Seitenleiste einblenden"}
        aria-pressed={p.sidebar}
        onClick={p.onToggleSidebar}
      >
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
      <button className="cmd-btn" onClick={p.onPalette} title="Befehle, Bausteine, Dateien">
        <Icon.search />
        <span>Befehle</span>
        <kbd>{keyLabel("mod+k")}</kbd>
      </button>
    </div>
  );
}
