import { describe, expect, it } from "vitest";
import { collapse, lineDiff } from "../diff";

const kurz = (d: ReturnType<typeof lineDiff>) => d.map((l) => ({ same: " ", add: "+", del: "-" })[l.kind] + l.text);

describe("lineDiff", () => {
  it("zeigt gleiche Texte unverändert", () => {
    expect(kurz(lineDiff("a\nb", "a\nb"))).toEqual([" a", " b"]);
  });
  it("findet gelöschte und neue Zeilen", () => {
    expect(kurz(lineDiff("a\nb\nc\nd", "a\nc\nx\nd"))).toEqual([" a", "-b", " c", "+x", " d"]);
  });
  it("kommt mit leeren Texten zurecht", () => {
    expect(kurz(lineDiff("", "neu"))).toEqual(["-", "+neu"]);
    expect(kurz(lineDiff("alt\n", "alt\n"))).toEqual([" alt", " "]);
  });
  it("zeigt eine gelöschte Aufgabe als einen Block", () => {
    const alt = "= Lab\n\n#aufgabe[\n  Drei Münzen\n]\n\n= Lösung";
    const neu = "= Lab\n\n= Lösung";
    expect(kurz(lineDiff(alt, neu))).toEqual([" = Lab", " ", "-#aufgabe[", "-  Drei Münzen", "-]", "-", " = Lösung"]);
  });
});

describe("collapse", () => {
  it("klappt lange gleiche Abschnitte zusammen und lässt Kontext stehen", () => {
    const alt = Array.from({ length: 20 }, (_, i) => `z${i}`).join("\n");
    const neu = alt.replace("z10", "neu");
    const c = collapse(lineDiff(alt, neu), 2);
    expect(c.map((b) => (b.kind === "skip" ? `…${b.count}` : b.kind[0] + b.text))).toEqual([
      "…8", "sz8", "sz9", "dz10", "aneu", "sz11", "sz12", "…7",
    ]);
  });
  it("lässt alles stehen, wenn nichts anders ist", () => {
    expect(collapse(lineDiff("a\nb", "a\nb"))).toEqual([{ kind: "skip", count: 2 }]);
  });
});
