import { type CompletionContext, type CompletionResult, snippet, type Completion as CMCompletion } from "@codemirror/autocomplete";
import { api, type CompletionKind } from "../api";
import { SNIPPETS } from "./snippets";

function kindToType(kind: CompletionKind): string {
  if (typeof kind === "object") return "symbol-glyph";
  switch (kind) {
    case "func":
      return "function";
    case "type":
      return "type";
    case "param":
      return "property";
    case "constant":
      return "constant";
    case "package":
      return "namespace";
    case "label":
      return "variable";
    case "syntax":
      return "keyword";
    default:
      return "text";
  }
}

/** Completions from Typst's IDE crate (functions, parameters, symbols, labels, paths …). */
export function typstSource(getRel: () => string | null) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const rel = getRel();
    if (!rel) return null;
    const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 1), ctx.pos);
    if (!ctx.explicit && (before === "" || /\s/.test(before))) return null;
    const res = await api.complete(rel, ctx.state.doc.toString(), ctx.pos, ctx.explicit).catch(() => null);
    if (!res || ctx.aborted || res.items.length === 0) return null;
    const options: CMCompletion[] = res.items.map((c, i) => {
      const glyph = typeof c.kind === "object" ? c.kind.symbol : null;
      const apply = c.apply ?? c.label;
      return {
        label: c.label,
        detail: glyph ? `${glyph}` : undefined,
        info: c.detail ?? undefined,
        type: kindToType(c.kind),
        apply: apply.includes("${") ? snippet(apply) : apply,
        boost: -i / 1000,
      };
    });
    return { from: res.from, options, validFor: /^[\p{L}\p{N}_.-]*$/u };
  };
}

/** Our own building blocks ("Bausteine"), e.g. `tbl`, `aufgabe`, `fig`. */
export function snippetSource(ctx: CompletionContext): CompletionResult | null {
  const word = ctx.matchBefore(/[a-zäöü]+$/i);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  if (!ctx.explicit && word.text.length < 2) return null;
  return {
    from: word.from,
    options: SNIPPETS.map((s) => ({
      label: s.label,
      detail: s.detail,
      type: "snippet",
      section: { name: "Bausteine", rank: 1 },
      apply: (view, completion, from, to) => {
        // `#aufgabe` typed with a leading hash: don't double it.
        const hashBefore = view.state.sliceDoc(from - 1, from) === "#";
        const start = hashBefore && s.body.startsWith("#") ? from - 1 : from;
        snippet(s.body)(view, completion, start, to);
      },
      boost: -5,
    })),
    validFor: /^[a-zäöü]*$/i,
  };
}
