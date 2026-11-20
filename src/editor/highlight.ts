import { RangeSetBuilder, type Text } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { api } from "../api";

/**
 * Syntax highlighting using Typst's own parser (via the Rust backend).
 * Typst switches between markup, code and math modes in ways a hand-written
 * grammar rarely gets fully right, so we let the real parser decide.
 * While a request is in flight the old decorations are mapped through edits.
 */
const marks = new Map<string, Decoration>();
const mark = (cls: string) => {
  let m = marks.get(cls);
  if (!m) marks.set(cls, (m = Decoration.mark({ class: cls })));
  return m;
};

export const typstHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = Decoration.none;
    inflight = false;
    dirty = false;
    destroyed = false;

    constructor(readonly view: EditorView) {
      this.request();
    }

    update(u: ViewUpdate) {
      if (u.docChanged) {
        this.decorations = this.decorations.map(u.changes);
        this.request();
      }
    }

    destroy() {
      this.destroyed = true;
    }

    request() {
      if (this.inflight) {
        this.dirty = true;
        return;
      }
      this.inflight = true;
      const doc: Text = this.view.state.doc;
      api
        .highlight(doc.toString())
        .then((tokens) => {
          if (this.destroyed) return;
          if (this.view.state.doc !== doc) {
            this.dirty = true;
            return;
          }
          const b = new RangeSetBuilder<Decoration>();
          const len = doc.length;
          for (const [from, to, cls] of tokens) {
            if (to > len) break;
            if (to > from) b.add(from, to, mark(cls));
          }
          this.decorations = b.finish();
          // Trigger a redraw without changing state.
          this.view.dispatch({});
        })
        .catch(() => {})
        .finally(() => {
          this.inflight = false;
          if (this.dirty && !this.destroyed) {
            this.dirty = false;
            this.request();
          }
        });
    }
  },
  { decorations: (v) => v.decorations },
);
