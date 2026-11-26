export type Heading = {
  level: number;
  title: string;
  line: number;
  /** Nur bei `#aufgabe(...)`: Punkte, falls angegeben. */
  punkte?: number;
  aufgabe?: true;
};

/** Argumente des Aufrufs bis zur passenden Klammer, sonst der Rest der Zeile. */
function argsOf(rest: string): string {
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "(") depth++;
    else if (rest[i] === ")" && --depth === 0) return rest.slice(1, i);
  }
  return rest.slice(1);
}

/**
 * Überschriften (`= Titel`) und Aufgaben (`#aufgabe(...)`) der Datei, ohne
 * Codeblöcke und Kommentare. Aufgaben werden wie in stil.typ gezählt: nur
 * ohne eigene `nr`.
 */
export function outlineOf(text: string): Heading[] {
  const out: Heading[] = [];
  let inRaw = false;
  let count = 0;
  text.split("\n").forEach((l, i) => {
    if (/^\s*```/.test(l)) inRaw = !inRaw;
    if (inRaw || /^\s*\/\//.test(l)) return;
    const m = l.match(/^(=+)\s+(.+?)\s*(<[\w-:.]+>)?\s*$/);
    if (m) {
      out.push({ level: m[1].length, title: m[2], line: i + 1 });
      return;
    }
    const a = l.match(/^\s*#aufgabe(\(|\[)/);
    if (!a) return;
    const args = a[1] === "(" ? argsOf(l.slice(l.indexOf("#aufgabe") + 8)) : "";
    const nr = args.match(/\bnr:\s*(none|"([^"]*)"|([\w.]+))/);
    const titel = args.match(/\btitel:\s*"([^"]*)"/)?.[1];
    const punkte = args.match(/\bpunkte:\s*(\d+(?:\.\d+)?)/)?.[1];
    let nummer = "";
    if (!nr) nummer = String(++count);
    else if (nr[1] !== "none") nummer = nr[2] ?? nr[3];
    const title = ["Aufgabe", nummer, titel].filter(Boolean).join(" ");
    out.push({ level: 2, title, line: i + 1, aufgabe: true, ...(punkte ? { punkte: Number(punkte) } : {}) });
  });
  return out;
}
