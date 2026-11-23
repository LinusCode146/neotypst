/** Headings (`= Titel`) of the current file, ignoring raw blocks. */
export function outlineOf(text: string) {
  const out: { level: number; title: string; line: number }[] = [];
  let inRaw = false;
  text.split("\n").forEach((l, i) => {
    if (/^\s*```/.test(l)) inRaw = !inRaw;
    if (inRaw) return;
    const m = l.match(/^(=+)\s+(.+?)\s*(<[\w-:.]+>)?\s*$/);
    if (m) out.push({ level: m[1].length, title: m[2], line: i + 1 });
  });
  return out;
}
