import { describe, expect, it } from "vitest";
import { kbd, modKey } from "../platform";

describe("kbd", () => {
  it("lässt Mac-Kürzel auf dem Mac stehen", () => {
    expect(kbd("Symbole (⌘⇧S)", true)).toBe("Symbole (⌘⇧S)");
  });
  it("schreibt Kürzel für Windows um", () => {
    expect(kbd("⌘E", false)).toBe("Strg+E");
    expect(kbd("⌘⇧E", false)).toBe("Strg+Umschalt+E");
    expect(kbd("⌥⌘L wechselt", false)).toBe("Strg+Alt+L wechselt");
    expect(kbd("⌥⇧F", false)).toBe("Alt+Umschalt+F");
  });
  it("benennt Sondertasten", () => {
    expect(kbd("⌘↩", false)).toBe("Strg+Eingabe");
    expect(kbd("⌘⇧⌫", false)).toBe("Strg+Umschalt+Rücktaste");
    expect(kbd("Verkleinern (⌘−)", false)).toBe("Verkleinern (Strg+-)");
    expect(kbd("⌘\\", false)).toBe("Strg+\\");
  });
  it("ändert mehrere Kürzel in einem Text", () => {
    expect(kbd("⌘T – in Formeln ⌘⇧T", false)).toBe("Strg+T – in Formeln Strg+Umschalt+T");
  });
});

describe("modKey", () => {
  const ev = (o: { metaKey?: boolean; ctrlKey?: boolean; altGr?: boolean }) =>
    ({ metaKey: !!o.metaKey, ctrlKey: !!o.ctrlKey, getModifierState: (k: string) => k === "AltGraph" && !!o.altGr }) as unknown as KeyboardEvent;

  it("nimmt auf dem Mac die Befehlstaste", () => {
    expect(modKey(ev({ metaKey: true }), true)).toBe(true);
    expect(modKey(ev({ ctrlKey: true }), true)).toBe(false);
  });
  it("nimmt unter Windows Strg, aber nicht AltGr", () => {
    expect(modKey(ev({ ctrlKey: true }), false)).toBe(true);
    expect(modKey(ev({ metaKey: true }), false)).toBe(false);
    expect(modKey(ev({ ctrlKey: true, altGr: true }), false)).toBe(false);
  });
});
