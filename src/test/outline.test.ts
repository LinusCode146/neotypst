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

describe("outlineOf mit Aufgaben", () => {
  it("zählt Aufgaben wie stil.typ und liest Punkte und Titel", () => {
    const text = [
      "#aufgabe(punkte: 2)[",
      "  Text",
      "]",
      '#aufgabe(punkte: 4, titel: "Bremsweg")[',
      '#aufgabe(nr: "3.12")[x]',
      "#aufgabe(nr: none)[x]",
      "// #aufgabe(punkte: 9)[]",
      "#aufgabe[ohne Argumente]",
    ].join("\n");
    expect(outlineOf(text)).toEqual([
      { level: 2, title: "Aufgabe 1", line: 1, aufgabe: true, punkte: 2 },
      { level: 2, title: "Aufgabe 2 Bremsweg", line: 4, aufgabe: true, punkte: 4 },
      { level: 2, title: "Aufgabe 3.12", line: 5, aufgabe: true },
      { level: 2, title: "Aufgabe", line: 6, aufgabe: true },
      { level: 2, title: "Aufgabe 3", line: 8, aufgabe: true },
    ]);
  });
});
