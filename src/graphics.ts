/**
 * Graphic building blocks. Each lives in `src/graphics/*.typ` (so the Rust
 * tests can compile every one of them) with a small header:
 *
 *   // label: Koordinatensystem mit Graph
 *   // category: Mathe
 *   // description: …
 *   #import "@preview/cetz:0.5.3"
 *
 *   …body (may contain `${1:…}` tab stops)…
 */
export type GraphicBlock = {
  id: string;
  label: string;
  category: string;
  description: string;
  imports: string[];
  body: string;
  /** Full source (imports + body), used for rendering the thumbnail. */
  code: string;
};

const files = import.meta.glob("./graphics/*.typ", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function parse(path: string, src: string): GraphicBlock {
  const meta: Record<string, string> = {};
  const imports: string[] = [];
  const body: string[] = [];
  for (const line of src.split("\n")) {
    const m = line.match(/^\/\/\s*(label|category|description):\s*(.*)$/);
    if (m && body.length === 0) meta[m[1]] = m[2].trim();
    else if (/^#import\s/.test(line) && body.length === 0) imports.push(line.trim());
    else if (body.length > 0 || line.trim() !== "") body.push(line);
  }
  const id = path.replace(/^.*\//, "").replace(/\.typ$/, "");
  return {
    id,
    label: meta.label ?? id,
    category: meta.category ?? "Sonstige",
    description: meta.description ?? "",
    imports,
    body: body.join("\n").trim(),
    code: src,
  };
}

export const GRAPHICS: GraphicBlock[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([p, src]) => parse(p, src));
