// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getSettings, projektKey, schriftVon, setProjektSchrift } from "../settings";

describe("Dokumentschrift je Projekt", () => {
  it("vereinheitlicht Pfade aus Windows und macOS", () => {
    expect(projektKey("\\\\?\\C:\\Users\\a\\Documents\\Typst\\Blatt")).toBe("C:/Users/a/Documents/Typst/Blatt");
    expect(projektKey("C:\\Users\\a\\Documents\\Typst\\Blatt\\")).toBe("C:/Users/a/Documents/Typst/Blatt");
    expect(projektKey("/Users/a/Documents/Typst/Blatt/")).toBe("/Users/a/Documents/Typst/Blatt");
  });
  it("gilt nur für das eigene Projekt, sonst die Standardschrift", () => {
    setProjektSchrift("C:\\Users\\a\\Typst\\Eins", "palatino");
    const s = getSettings();
    expect(schriftVon(s, "\\\\?\\C:\\Users\\a\\Typst\\Eins")).toBe("palatino");
    expect(schriftVon(s, "C:\\Users\\a\\Typst\\Zwei")).toBe(s.schrift);
  });
});
