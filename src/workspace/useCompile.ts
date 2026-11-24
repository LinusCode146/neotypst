// Kompilieren: höchstens ein Lauf zur Zeit, Anfragen dazwischen werden zu
// einem weiteren Lauf zusammengefasst. Seiten kommen nur geändert als SVG.

import { useCallback, useRef, useState, type RefObject } from "react";
import { api, type CompileOut, type Diag } from "../api";
import type { EditorHandle } from "../editor/Editor";
import type { PageView } from "../Preview";
import type { Toast } from "./types";

export function useCompile({ editor, showToast }: { editor: RefObject<EditorHandle | null>; showToast(t: Toast, ms?: number): void }) {
  const [pages, setPages] = useState<PageView[]>([]);
  const [diags, setDiags] = useState<Diag[]>([]);
  const [millis, setMillis] = useState<number | null>(null);
  const [compiling, setCompiling] = useState(true);
  const svgCache = useRef(new Map<string, string>());
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
      const svg = p.svg ?? cache.get(p.hash);
      if (svg == null) missing = true;
      return { hash: p.hash, svg: svg ?? "", width: p.width, height: p.height };
    });
    // Drop SVGs for pages that no longer exist.
    const keep = new Set(next.map((p) => p.hash));
    for (const k of cache.keys()) if (!keep.has(k)) cache.delete(k);
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
