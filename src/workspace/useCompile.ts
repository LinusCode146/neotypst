// Kompilieren: höchstens ein Lauf zur Zeit, Anfragen dazwischen werden zu
// einem weiteren Lauf zusammengefasst. Seiten kommen nur geändert als SVG.
// Jede Seite wird als Bild (Blob-URL) angezeigt: Der Webview rastert sie
// einmal, statt Tausende SVG-Knoten im DOM zu halten. Das hält Tippen und
// Scrollen im Editor flüssig, auch bei vielen Seiten.

import { useCallback, useRef, useState, type RefObject } from "react";
import { api, type CompileOut, type Diag } from "../api";
import type { EditorHandle } from "../editor/Editor";
import type { PageView } from "../Preview";
import type { Toast } from "./types";

/** Bild-URLs der Seiten nach Hash. */
export class PageCache {
  private urls = new Map<string, string>();
  has(hash: string) {
    return this.urls.has(hash);
  }
  get(hash: string) {
    return this.urls.get(hash);
  }
  set(hash: string, svg: string) {
    if (this.urls.has(hash)) return;
    this.urls.set(hash, URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })));
  }
  /** Behält nur die genannten Seiten. */
  retain(keep: Set<string>) {
    for (const [hash, url] of this.urls) {
      if (!keep.has(hash)) {
        this.urls.delete(hash);
        revokeLater(url);
      }
    }
  }
  clear() {
    this.urls.forEach(revokeLater);
    this.urls.clear();
  }
}

// Erst freigeben, wenn das Bild sicher durch das neue ersetzt ist.
const revokeLater = (url: string) => window.setTimeout(() => URL.revokeObjectURL(url), 5000);

export function useCompile({ editor, showToast }: { editor: RefObject<EditorHandle | null>; showToast(t: Toast, ms?: number): void }) {
  const [pages, setPages] = useState<PageView[]>([]);
  const [diags, setDiags] = useState<Diag[]>([]);
  const [millis, setMillis] = useState<number | null>(null);
  const [compiling, setCompiling] = useState(true);
  const svgCache = useRef(new PageCache());
  /** Die Datei und ihr Text, die beim nächsten Lauf mitgeschickt werden. */
  const latest = useRef<{ rel: string; text: string } | null>(null);
  const compileFlags = useRef({ inflight: false, pending: false });
  const diagsRef = useRef<Diag[]>([]);
  diagsRef.current = diags;


  const applyResult = useCallback((out: CompileOut) => {
    setMillis(out.millis);
    setDiags(out.diagnostics);
    editor.current?.setDiagnostics(out.diagnostics);
    if (!out.pages) return;
    const cache = svgCache.current;
    let missing = false;
    const next = out.pages.map((p) => {
      if (p.svg != null) cache.set(p.hash, p.svg);
      const src = cache.get(p.hash);
      if (src == null) missing = true;
      return { hash: p.hash, src: src ?? "", width: p.width, height: p.height };
    });
    // Bilder von Seiten freigeben, die es nicht mehr gibt.
    cache.retain(new Set(next.map((p) => p.hash)));
    setPages(next);
    if (missing) {
      api.forgetPreview().then(() => requestCompile());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestCompile = useCallback(() => {
    const flags = compileFlags.current;
    if (flags.inflight) {
      flags.pending = true;
      return;
    }
    flags.inflight = true;
    setCompiling(true);
    const job = latest.current;
    api
      .compile(job?.rel, job?.text)
      .then(applyResult)
      .catch((e) => showToast({ text: String(e), kind: "error" }))
      .finally(() => {
        flags.inflight = false;
        setCompiling(false);
        if (flags.pending) {
          flags.pending = false;
          requestCompile();
        }
      });
  }, [applyResult, showToast]);

  return { pages, diags, diagsRef, millis, compiling, requestCompile, latest, svgCache };
}
