// Zeigt PDFs und Bilder aus dem Projekt anstelle von Editor und Vorschau.
// PDF-Seiten rendert pdf.js zu Bildern; angezeigt wird alles mit der
// Vorschau-Komponente, damit Zoom und Seitenansicht gleich funktionieren.

import { useEffect, useState } from "react";
import { Preview, type PageView } from "./Preview";
import { api } from "./api";

export type ViewKind = "pdf" | "image";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/** Auflösung, mit der PDF-Seiten gerendert werden (Pixel je Punkt). */
const RENDER_SCALE = 3;

const img = (src: string) => `<img src="${src}" alt="" draggable="false">`;

function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve({ width: el.naturalWidth || 600, height: el.naturalHeight || 400 });
    el.onerror = () => reject(new Error("Bild kann nicht gelesen werden"));
    el.src = src;
  });
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

type Props = { rel: string; kind: ViewKind; zoom: number; onZoom(zoom: number): void; onClose(): void; onOpenExternal(): void };

export function FileViewer({ rel, kind, zoom, onZoom, onClose, onOpenExternal }: Props) {
  const [pages, setPages] = useState<PageView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    const url = (blob: Blob) => {
      const u = URL.createObjectURL(blob);
      urls.push(u);
      return u;
    };
    setPages([]);
    setError(null);
    setLoading(true);

    (async () => {
      const bytes = await api.readBytes(rel);
      if (cancelled) return;
      if (kind === "image") {
        const ext = rel.split(".").pop()!.toLowerCase();
        const src = url(new Blob([bytes], { type: MIME[ext] ?? "application/octet-stream" }));
        const { width, height } = await imageSize(src);
        if (!cancelled) setPages([{ hash: rel, svg: img(src), width, height }]);
        return;
      }
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
      try {
        // Erst alle Seitengrößen, dann die Seiten nacheinander rendern.
        const all: PageView[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
          all.push({ hash: `${rel}#${i}:leer`, svg: "", width: vp.width, height: vp.height });
        }
        if (cancelled) return;
        setPages([...all]);
        setLoading(false);
        for (let i = 1; i <= doc.numPages && !cancelled; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: RENDER_SCALE });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
          const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
          page.cleanup();
          if (cancelled || !blob) break;
          all[i - 1] = { ...all[i - 1], hash: `${rel}#${i}`, svg: img(url(blob)) };
          setPages([...all]);
        }
      } finally {
        void doc.destroy();
      }
    })()
      .catch((e) => !cancelled && setError(`Datei kann nicht angezeigt werden: ${e instanceof Error ? e.message : e}`))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [rel, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = rel.split("/").pop();
  return (
    <section className="file-viewer">
      <div className="file-viewer-bar">
        <span className="file-viewer-name" title={rel}>
          {name}
        </span>
        {kind === "pdf" && pages.length > 0 && <span className="file-viewer-info">{pages.length === 1 ? "1 Seite" : `${pages.length} Seiten`}</span>}
        <span className="file-viewer-spacer" />
        <button className="file-viewer-btn" onClick={onOpenExternal}>
          Mit Standard-App öffnen
        </button>
        <button className="file-viewer-btn" onClick={onClose} title="Zurück zum Editor (Esc)">
          Schließen
        </button>
      </div>
      <Preview pages={pages} zoom={zoom} onZoom={onZoom} marker={null} loading={loading} error={error} onClick={() => {}} />
    </section>
  );
}
