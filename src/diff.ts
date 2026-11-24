// Zeilenweiser Vergleich für die Vorschau im Verlauf.

export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Unterschiede von `alt` nach `neu`, Zeile für Zeile (längste gemeinsame Teilfolge). */
export function lineDiff(alt: string, neu: string): DiffLine[] {
  const a = alt.split("\n");
  const b = neu.split("\n");
  // Gleiche Ränder abschneiden: meist ändert sich nur ein kleiner Teil.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const mA = a.slice(start, endA);
  const mB = b.slice(start, endB);
  const head = a.slice(0, start).map((text) => ({ kind: "same" as const, text }));
  const tail = a.slice(endA).map((text) => ({ kind: "same" as const, text }));

  // Zu groß für die Tabelle: alles Alte weg, alles Neue dazu.
  if (mA.length * mB.length > 4_000_000) {
    return [...head, ...mA.map((text) => ({ kind: "del" as const, text })), ...mB.map((text) => ({ kind: "add" as const, text })), ...tail];
  }
  const n = mA.length;
  const m = mB.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = mA[i] === mB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const mid: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (mA[i] === mB[j]) {
      mid.push({ kind: "same", text: mA[i++] });
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      mid.push({ kind: "del", text: mA[i++] });
    } else {
      mid.push({ kind: "add", text: mB[j++] });
    }
  }
  while (i < n) mid.push({ kind: "del", text: mA[i++] });
  while (j < m) mid.push({ kind: "add", text: mB[j++] });
  return [...head, ...mid, ...tail];
}

export type DiffBlock = DiffLine | { kind: "skip"; count: number };

/** Lange unveränderte Abschnitte zusammenklappen, `context` Zeilen bleiben stehen. */
export function collapse(diff: DiffLine[], context = 3): DiffBlock[] {
  const out: DiffBlock[] = [];
  let i = 0;
  while (i < diff.length) {
    if (diff[i].kind !== "same") {
      out.push(diff[i++]);
      continue;
    }
    let j = i;
    while (j < diff.length && diff[j].kind === "same") j++;
    const keepHead = i === 0 ? 0 : context;
    const keepTail = j === diff.length ? 0 : context;
    if (j - i > keepHead + keepTail + 1) {
      out.push(...diff.slice(i, i + keepHead), { kind: "skip", count: j - i - keepHead - keepTail }, ...diff.slice(j - keepTail, j));
    } else {
      out.push(...diff.slice(i, j));
    }
    i = j;
  }
  return out;
}
