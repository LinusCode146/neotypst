import { describe, expect, it } from "vitest";
import { outlineOf } from "../outline";

describe("outlineOf", () => {
  it("findet Überschriften mit Ebene und Zeile", () => {
    const text = "#import \"x\"\n= Mathe Lab\n\n== Erklärung\nText\n=== Berechnung von p";
    expect(outlineOf(text)).toEqual([
      { level: 1, title: "Mathe Lab", line: 2 },
      { level: 2, title: "Erklärung", line: 4 },
      { level: 3, title: "Berechnung von p", line: 6 },
    ]);
  });
  it("lässt Labels weg", () => {
    expect(outlineOf("= Einleitung <einl>")).toEqual([{ level: 1, title: "Einleitung", line: 1 }]);
  });
  it("ignoriert Codeblöcke und Gleichheitszeichen mitten in der Zeile", () => {
    const text = "```\n= kein Titel\n```\n$a = b$\n= Titel";
    expect(outlineOf(text)).toEqual([{ level: 1, title: "Titel", line: 5 }]);
  });
});
