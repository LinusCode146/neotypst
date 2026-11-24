import type { Diag } from "../api";
import { keyLabel } from "./commands";
import { useStore, type Store } from "./store";

/** Untere Leiste: Fehler, Kompilierzeit, Seiten, Rechtschreibung, vim, Cursor, Speicherstand. */
export function StatusBar(p: {
  diags: Diag[];
  compiling: boolean;
  millis: number | null;
  pageCount: number;
  spell: string;
  spellInfo: { count: number; dominant: string | null };
  vimMode: string | null;
  cursor: Store<{ line: number; col: number }>;
  dirty: boolean;
  onToggleProblems(): void;
  onSpellMenu(anchor: DOMRect): void;
}) {
  const errors = p.diags.filter((d) => d.severity === "error");
  const warnings = p.diags.filter((d) => d.severity === "warning");
  return (
    <footer className="statusbar">
      <button className="item" onClick={p.onToggleProblems} title="Probleme anzeigen">
        {errors.length === 0 && warnings.length === 0 ? (
          <span className="okc">✓ Keine Fehler</span>
        ) : (
          <>
            {errors.length > 0 && <span className="err">● {errors.length} Fehler</span>}
            {warnings.length > 0 && <span className="warn">▲ {warnings.length} Warnung{warnings.length > 1 ? "en" : ""}</span>}
          </>
        )}
      </button>
      <span className="item">{p.compiling ? "kompiliert …" : p.millis != null ? `${p.millis} ms` : ""}</span>
      <span className="item">
        {p.pageCount} Seite{p.pageCount === 1 ? "" : "n"}
      </span>
      <span className="grow" />
      <button
        className="item spell-item"
        title={`Rechtschreibung: Sprache wählen (${keyLabel("mod+alt+l")} wechselt)`}
        onClick={(e) => {
          e.stopPropagation();
          p.onSpellMenu((e.currentTarget as HTMLElement).getBoundingClientRect());
        }}
      >
        <span className="abc">ABC</span>
        {p.spell === "off"
          ? "Aus"
          : p.spell === "auto"
            ? `Auto${p.spellInfo.dominant ? " · " + p.spellInfo.dominant.toUpperCase() : ""}`
            : p.spell.toUpperCase()}
        {p.spell !== "off" && p.spellInfo.count > 0 && <span className="spell-count">{p.spellInfo.count}</span>}
      </button>
      {p.vimMode && <span className="item vim">{p.vimMode.toUpperCase()}</span>}
      <CursorPos store={p.cursor} />
      <span className="item">{p.dirty ? "Ungespeichert" : "Gespeichert"}</span>
    </footer>
  );
}

function CursorPos({ store }: { store: Store<{ line: number; col: number }> }) {
  const c = useStore(store);
  return (
    <span className="item">
      Z {c.line}, S {c.col}
    </span>
  );
}
