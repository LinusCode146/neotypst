import { describe, expect, it } from "vitest";
import { keyLabel, matches, paletteItems, withKeys, type Command } from "../workspace/commands";

const ev = (key: string, o: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) =>
  ({ key, metaKey: !!o.meta, ctrlKey: !!o.ctrl, shiftKey: !!o.shift, altKey: !!o.alt, getModifierState: () => false }) as unknown as KeyboardEvent;

describe("matches", () => {
  it("unterscheidet Umschalt bei Buchstaben", () => {
    expect(matches(ev("e", { meta: true }), "mod+e", true)).toBe(true);
    expect(matches(ev("E", { meta: true, shift: true }), "mod+e", true)).toBe(false);
    expect(matches(ev("E", { meta: true, shift: true }), "mod+shift+e", true)).toBe(true);
  });
  it("verlangt Alt genau dann, wenn es im Kürzel steht", () => {
    expect(matches(ev("l", { meta: true, alt: true }), "mod+alt+l", true)).toBe(true);
    expect(matches(ev("f", { meta: true, shift: true, alt: true }), "mod+shift+f", true)).toBe(false);
  });
  it("ignoriert Umschalt bei Zeichen und kennt das Plus", () => {
    expect(matches(ev("+", { meta: true, shift: true }), "mod++", true)).toBe(true);
    expect(matches(ev("\\", { meta: true }), "mod+\\", true)).toBe(true);
    expect(matches(ev("-", { meta: true }), "mod+-", true)).toBe(true);
  });
  it("nimmt unter Windows Strg statt ⌘", () => {
    expect(matches(ev("k", { ctrl: true }), "mod+k", false)).toBe(true);
    expect(matches(ev("k", { meta: true }), "mod+k", false)).toBe(false);
  });
});

describe("Beschriftungen", () => {
  it("baut Mac-Kürzel aus den Tasten", () => {
    // Die Tests laufen unter jsdom/node ohne Mac-Kennung: Windows-Schreibweise.
    expect(keyLabel("mod+shift+e")).toMatch(/^(⌘⇧E|Strg\+Umschalt\+E)$/);
    expect(keyLabel("mod++")).toMatch(/^(⌘\+|Strg\+\+)$/);
    expect(keyLabel("mod+-")).toMatch(/^(⌘−|Strg\+-)$/);
  });
  it("erzeugt Palette und Tooltips aus derselben Liste", () => {
    const cmds: Command[] = [
      { id: "a", label: "Export", group: "Aktionen", keys: "mod+e", run: () => {} },
      { id: "b", label: "Palette", group: "Aktionen", keys: "mod+k", hidden: true, run: () => {} },
      { id: "c", label: "Matrix", group: "Aktionen", detail: "in Formeln", run: () => {} },
    ];
    const items = paletteItems(cmds);
    expect(items.map((i) => i.id)).toEqual(["a", "c"]);
    expect(items[0].detail).toBe(keyLabel("mod+e"));
    expect(items[1].detail).toBe("in Formeln");
    expect(withKeys(cmds, "a", "Exportieren")).toBe(`Exportieren (${keyLabel("mod+e")})`);
    expect(withKeys(cmds, "c", "Matrix")).toBe("Matrix");
  });
});
