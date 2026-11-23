// macOS oder Windows: Tastenkürzel und ihre Beschriftung.

export const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Die Befehlstaste: ⌘ auf dem Mac, Strg unter Windows (aber nicht AltGr, das als Strg+Alt ankommt). */
export const modKey = (e: KeyboardEvent | React.KeyboardEvent): boolean =>
  isMac ? e.metaKey : e.ctrlKey && !e.getModifierState("AltGraph");

const tasten: Record<string, string> = { "↩": "Eingabe", "⌫": "Rücktaste", "−": "-" };

/** Schreibt Mac-Kürzel in einem Text für Windows um: „⌘⇧E“ → „Strg+Umschalt+E“. */
export function kbd(text: string): string {
  if (isMac) return text;
  return text.replace(/([⌃⌥⇧⌘]+)(.)/gu, (_, mods: string, key: string) => {
    const teile: string[] = [];
    if (mods.includes("⌘") || mods.includes("⌃")) teile.push("Strg");
    if (mods.includes("⌥")) teile.push("Alt");
    if (mods.includes("⇧")) teile.push("Umschalt");
    teile.push(tasten[key] ?? key.toUpperCase());
    return teile.join("+");
  });
}
