// Alle Befehle des Arbeitsbereichs an einer Stelle: Name, Tastenkürzel und
// Aktion. Befehlspalette, Tastenkürzel und Tooltips werden daraus erzeugt,
// damit ein Kürzel nur einmal gepflegt wird.

import type { ReactNode } from "react";
import type { PaletteItem } from "../Palette";
import { isMac, kbd, modKey } from "../platform";

export type Command = {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  keywords?: string;
  /** Tastenkürzel wie "mod+shift+e"; die Beschriftung entsteht daraus. */
  keys?: string;
  /** Beschriftung rechts, wenn nicht das Kürzel (oder zusätzlich zu ihm). */
  detail?: string;
  /** Nur als Kürzel, nicht in der Befehlspalette. */
  hidden?: boolean;
  run(): void;
};

const SYMBOL: Record<string, string> = { mod: "⌘", shift: "⇧", alt: "⌥" };

/** "mod+shift+e" → „⌘⇧E“ (Mac) bzw. „Strg+Umschalt+E“ (Windows). */
export function keyLabel(keys: string): string {
  const parts = keys.split("+");
  // "mod++" endet mit einem leeren Teil: die Taste ist das Plus.
  const key = keys.endsWith("++") ? "+" : parts[parts.length - 1];
  const mods = ["alt", "shift", "mod"].filter((m) => parts.includes(m));
  // Reihenfolge wie auf dem Mac üblich: ⌥⇧⌘.
  const mac = mods.map((m) => SYMBOL[m]).join("") + (key === "-" ? "−" : key.toUpperCase());
  return kbd(mac);
}

/** Passt ein Tastendruck zu "mod+shift+e"? Bei Zeichen ohne Buchstaben zählt Umschalt nicht. */
export function matches(e: KeyboardEvent, keys: string, mac = isMac): boolean {
  if (!modKey(e, mac)) return false;
  const parts = keys.split("+");
  const key = keys.endsWith("++") ? "+" : parts[parts.length - 1];
  if (e.altKey !== parts.includes("alt")) return false;
  const letter = /^[a-z]$/.test(key);
  if (letter && e.shiftKey !== parts.includes("shift")) return false;
  return e.key.toLowerCase() === key;
}

/** Beschriftung eines Befehls für Tooltips: „Symbole (⌘⇧S)“. */
export function withKeys(commands: Command[], id: string, label: string): string {
  const c = commands.find((c) => c.id === id);
  return c?.keys ? `${label} (${keyLabel(c.keys)})` : label;
}

/** Befehle für die Palette: ohne versteckte, mit Kürzel als Beschriftung. */
export function paletteItems(commands: Command[]): PaletteItem[] {
  return commands
    .filter((c) => !c.hidden)
    .map((c) => ({
      id: c.id,
      label: c.label,
      group: c.group,
      icon: c.icon,
      keywords: c.keywords,
      detail: c.detail != null ? kbd(c.detail) : c.keys ? keyLabel(c.keys) : undefined,
      run: c.run,
    }));
}

/** Globaler Tastendruck: den ersten passenden Befehl ausführen. */
export function handleKey(commands: Command[], e: KeyboardEvent): boolean {
  if (!modKey(e)) return false;
  // Unter Windows ist die Befehlstaste Strg: Strg-J/K/N/P gehören dann der Vorschlagsliste.
  if (!isMac && document.querySelector(".cm-tooltip-autocomplete")) return false;
  const c = commands.find((c) => c.keys && matches(e, c.keys));
  if (!c) return false;
  e.preventDefault();
  c.run();
  return true;
}
