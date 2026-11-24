// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { convertPipeTable, matrixSnippet, tableSnippet, wrapSelection } from "../editor/snippets";

// jsdom misst kein Layout. CodeMirror fragt nach dem Scrollen Rechtecke ab,
// teils erst im nächsten Frame; ohne diese Attrappen wirft das je nach Timing.
const leer = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) } as DOMRect;
Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => leer;

const offen: EditorView[] = [];
afterEach(() => offen.splice(0).forEach((v) => v.destroy()));

function view(doc: string, from: number, to = from) {
  const v = new EditorView({ state: EditorState.create({ doc, selection: { anchor: from, head: to } }) });
  offen.push(v);
  return v;
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
