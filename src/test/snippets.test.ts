// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { convertPipeTable, matrixSnippet, tableSnippet, wrapSelection } from "../editor/snippets";

function view(doc: string, from: number, to = from) {
  return new EditorView({ state: EditorState.create({ doc, selection: { anchor: from, head: to } }) });
}

describe("Snippet-Texte", () => {
  it("baut eine Tabelle mit Kopfzeile", () => {
    const t = tableSnippet(3, 2);
    expect(t).toContain("columns: 2");
    expect(t).toContain("table.header[${1:Spalte 1}][${2:Spalte 2}]");
    expect(t.split("\n").filter((l) => l.startsWith("  [")).length).toBe(2);
  });
  it("baut eine Matrix mit Platzhaltern", () => {
    expect(matrixSnippet(2, 2)).toBe("mat(\n  ${1:a_(11)}, ${2:a_(12)};\n  ${3:a_(21)}, ${4:a_(22)};\n)");
  });
});

describe("wrapSelection", () => {
  it("umschließt die Auswahl", () => {
    const v = view("Kraft F", 6, 7);
    wrapSelection(v, "$");
    expect(v.state.doc.toString()).toBe("Kraft $F$");
  });
  it("setzt ohne Auswahl ein leeres Paar mit Cursor in der Mitte", () => {
    const v = view("ab", 1);
    wrapSelection(v, "*");
    expect(v.state.doc.toString()).toBe("a**b");
    expect(v.state.selection.main.head).toBe(2);
  });
});

describe("convertPipeTable", () => {
  it("wandelt eine Markdown-Tabelle mit Ausrichtung um", () => {
    const doc = "| Größe | Formel |\n|-------|:------:|\n| Kraft | F = m a |";
    const v = view(doc, 3);
    expect(convertPipeTable(v)).toBe(true);
    const out = v.state.doc.toString();
    expect(out).toContain("columns: 2");
    expect(out).toContain("align: (left, center)");
    expect(out).toContain("table.header[Größe][Formel]");
    expect(out).toContain("[Kraft], [F = m a]");
  });
  it("tut außerhalb einer Tabelle nichts", () => {
    const v = view("kein | Tisch", 0);
    expect(convertPipeTable(v)).toBe(false);
  });
});
