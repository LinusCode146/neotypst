import { useSyncExternalStore } from "react";

export type Settings = {
  vim: boolean;
  theme: "system" | "light" | "dark";
  fontSize: number;
  lineNumbers: boolean;
  wrap: boolean;
  sidebar: boolean;
  zoom: number; // preview zoom, 1 = fit width
  spell: "auto" | "de" | "en" | "off";
  mathQuote: boolean; // auto-quote unknown words in formulas
  schrift: string; // Dokumentschrift für Projekte ohne eigene Wahl (id aus schriften.ts)
  projektSchrift: Record<string, string>; // Dokumentschrift je Projektordner
};

const DEFAULTS: Settings = {
  vim: false,
  theme: "system",
  fontSize: 14,
  lineNumbers: true,
  wrap: true,
  sidebar: true,
  zoom: 1,
  spell: "auto",
  mathQuote: true,
  schrift: "latex",
  projektSchrift: {},
};

const KEY = "neotypst.settings";
let current: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

export function getSettings() {
  return current;
}

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  applyTheme();
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function applyTheme() {
  const root = document.documentElement;
  if (current.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", current.theme);
}

/** Pfad als Schlüssel: gleich, ob mit Präfix `\\?\` (Windows), Backslashes oder Schrägstrich am Ende. */
export function projektKey(root: string): string {
  return root.replace(/^\\\\\?\\/, "").replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Dokumentschrift eines Projekts; ohne eigene Wahl die bisherige Standardschrift. */
export function schriftVon(s: Settings, root: string): string {
  return s.projektSchrift[projektKey(root)] ?? s.schrift;
}

export function setProjektSchrift(root: string, id: string) {
  setSettings({ projektSchrift: { ...current.projektSchrift, [projektKey(root)]: id } });
}
