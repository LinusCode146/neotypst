import { Icon } from "../icons";

/** Leiste über der Vorschau: Seiten, Zoom und Export. */
export function PreviewBar(p: {
  pageCount: number;
  zoom: number;
  title(id: string, label: string): string;
  onZoom(z: number): void;
  onExport(): void;
  onExportMenu(anchor: DOMRect): void;
}) {
  return (
    <div className="previewbar">
      <span className="pv-info">
        {p.pageCount} Seite{p.pageCount === 1 ? "" : "n"}
      </span>
      <span className="grow" />
      <div className="pv-zoom">
        <button className="icon-btn" title={p.title("zoom-out", "Verkleinern")} aria-label="Verkleinern" onClick={() => p.onZoom(p.zoom / 1.15)}>
          <Icon.zoomOut />
        </button>
        <button className="pv-zoom-label" title={p.title("zoom-fit", "An Breite anpassen")} onClick={() => p.onZoom(1)}>
          {Math.round(p.zoom * 100)} %
        </button>
        <button className="icon-btn" title={p.title("zoom-in", "Vergrößern")} aria-label="Vergrößern" onClick={() => p.onZoom(p.zoom * 1.15)}>
          <Icon.zoomIn />
        </button>
      </div>
      <div className="split-btn">
        <button className="btn primary" title={p.title("export", "PDF exportieren")} onClick={p.onExport}>
          PDF
        </button>
        <button
          className="btn primary"
          aria-label="Weitere Exportoptionen"
          title="Weitere Exportoptionen"
          onClick={(e) => {
            e.stopPropagation();
            p.onExportMenu((e.currentTarget as HTMLElement).getBoundingClientRect());
          }}
        >
          <Icon.chevronDown />
        </button>
      </div>
    </div>
  );
}
