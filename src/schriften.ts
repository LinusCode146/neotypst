// Dokumentschrift: die Standard-Textschrift in Vorschau und PDF. stil.typ
// liest sie aus sys.inputs, solange ein Dokument keine eigene `schrift` setzt.

export type Schrift = {
  id: string;
  label: string;
  detail: string;
  /** Familien in Reihenfolge, die erste vorhandene gilt (macOS, Windows). */
  familien: string[];
  formeln: string;
};

const CM_MATH = "New Computer Modern Math";

export const SCHRIFTEN: Schrift[] = [
  { id: "latex", label: "Computer Modern", detail: "LaTeX, Standard", familien: ["New Computer Modern"], formeln: CM_MATH },
  { id: "typst", label: "Libertinus Serif", detail: "Typst-Standard", familien: ["Libertinus Serif"], formeln: "Libertinus Math" },
  { id: "libron", label: "Libron", detail: "", familien: ["Libron"], formeln: CM_MATH },
  { id: "palatino", label: "Palatino", detail: "", familien: ["Palatino", "Palatino Linotype"], formeln: CM_MATH },
  { id: "charter", label: "Charter", detail: "gut lesbar auch klein", familien: ["Charter", "XCharter"], formeln: CM_MATH },
  { id: "georgia", label: "Georgia", detail: "für Bildschirm gebaut", familien: ["Georgia"], formeln: CM_MATH },
  { id: "times", label: "Times New Roman", detail: "häufig in Uni-Vorgaben", familien: ["Times New Roman", "Times"], formeln: CM_MATH },
  { id: "helvetica", label: "Helvetica", detail: "serifenlos", familien: ["Helvetica Neue", "Helvetica", "Arial"], formeln: CM_MATH },
];

export const STANDARD_SCHRIFT = "latex";

export function schriftById(id: string): Schrift {
  return SCHRIFTEN.find((s) => s.id === id) ?? SCHRIFTEN[0];
}

/** Teilt der Engine die Dokumentschrift mit; Standard heißt: stil.typ entscheidet. */
export async function schriftAnwenden(id: string) {
  const { api } = await import("./api");
  const s = schriftById(id);
  await api.setSchrift(s.id === STANDARD_SCHRIFT ? "" : s.familien.join(", "), s.formeln);
}
