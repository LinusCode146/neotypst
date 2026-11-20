//! Reads a `#table(...)` call at the cursor into a simple grid so that the
//! graphical table editor can edit it. Uses Typst's real parser.

use serde::Serialize;
use typst::syntax::ast::{self, AstNode};
use typst::syntax::{LinkedNode, Side, Source};

#[derive(Serialize, Debug)]
pub struct TableModel {
    /// UTF-16 range of the whole call (including a leading `#`).
    from: usize,
    to: usize,
    columns: usize,
    /// Original `columns:` expression if it was not a plain number,
    /// e.g. `(1fr, auto, auto)`. Kept if the column count is unchanged.
    columns_raw: Option<String>,
    /// Per-column alignment (`left`, `center`, `right`, …) if given as array.
    align: Option<Vec<String>>,
    /// Single alignment for all cells (e.g. `center`) if not an array.
    align_all: Option<String>,
    header: Option<Vec<String>>,
    cells: Vec<String>,
    /// Other named arguments (`stroke`, `inset`, `fill`, …), kept verbatim.
    extra: Vec<(String, String)>,
}

#[derive(Serialize, Debug)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum TableAt {
    /// No table at the cursor.
    None,
    Ok(TableModel),
    /// There is a table, but it uses features the grid can't represent.
    Unsupported { reason: String },
}

fn text_of<'a>(node: impl AstNode<'a>) -> String {
    node.to_untyped().full_text().to_string()
}

fn is_table_callee(expr: ast::Expr) -> bool {
    matches!(expr, ast::Expr::Ident(id) if id.as_str() == "table")
}

fn is_header_callee(expr: ast::Expr) -> bool {
    match expr {
        ast::Expr::FieldAccess(fa) => fa.field().as_str() == "header" && is_table_callee(fa.target()),
        _ => false,
    }
}

/// Converts a positional cell argument to markup that renders the same.
fn cell_markup(expr: ast::Expr) -> Result<String, String> {
    match expr {
        ast::Expr::ContentBlock(cb) => Ok(text_of(cb.body())),
        ast::Expr::Equation(_) => Ok(text_of(expr)),
        ast::Expr::FuncCall(fc) => {
            if let ast::Expr::FieldAccess(fa) = fc.callee() {
                if is_table_callee(fa.target()) {
                    return Err(format!(
                        "„table.{}“ (z. B. verbundene Zellen oder Linien) kann der Tabellen-Editor noch nicht darstellen",
                        fa.field().as_str()
                    ));
                }
            }
            Ok(format!("#{}", text_of(expr)))
        }
        _ => Ok(format!("#{}", text_of(expr))),
    }
}

pub fn table_at(text: &str, cursor_utf16: usize) -> TableAt {
    let source = Source::detached(text);
    let lines = source.lines();
    let Some(cursor) = lines.utf16_to_byte(cursor_utf16) else { return TableAt::None };
    let root = LinkedNode::new(source.root());
    let Some(leaf) = root.leaf_at(cursor, Side::After).or_else(|| root.leaf_at(cursor, Side::Before)) else {
        return TableAt::None;
    };

    // Walk up to the innermost `table(...)` call.
    let mut node = Some(leaf);
    let call = loop {
        let Some(n) = node else { return TableAt::None };
        if let Some(fc) = n.cast::<ast::FuncCall>() {
            if is_table_callee(fc.callee()) {
                break n;
            }
        }
        node = n.parent().cloned();
    };
    let fc = call.cast::<ast::FuncCall>().unwrap();

    let mut start = call.offset();
    let end = call.offset() + call.len();
    if text[..start].ends_with('#') {
        start -= 1;
    }

    let mut columns = None;
    let mut columns_raw = None;
    let mut align = None;
    let mut align_all = None;
    let mut header = None;
    let mut cells = Vec::new();
    let mut extra = Vec::new();

    for arg in fc.args().items() {
        match arg {
            ast::Arg::Named(named) => {
                let name = named.name().as_str().to_string();
                let expr = named.expr();
                match name.as_str() {
                    "columns" => match expr {
                        ast::Expr::Int(i) => columns = Some(i.get().max(1) as usize),
                        ast::Expr::Array(arr) => {
                            columns = Some(arr.items().count().max(1));
                            columns_raw = Some(text_of(expr));
                        }
                        _ => {
                            return TableAt::Unsupported {
                                reason: format!("Spaltenangabe „{}“ wird berechnet", text_of(expr)),
                            };
                        }
                    },
                    "align" => match expr {
                        ast::Expr::Array(arr) => {
                            align = Some(arr.items().map(|i| match i {
                                ast::ArrayItem::Pos(e) => text_of(e),
                                ast::ArrayItem::Spread(s) => text_of(s),
                            }).collect())
                        }
                        _ => align_all = Some(text_of(expr)),
                    },
                    _ => extra.push((name, text_of(expr))),
                }
            }
            ast::Arg::Spread(s) => {
                return TableAt::Unsupported {
                    reason: format!("Die Zellen kommen aus Code („{}“)", text_of(s)),
                };
            }
            ast::Arg::Pos(expr) => {
                if let ast::Expr::FuncCall(h) = expr {
                    if is_header_callee(h.callee()) {
                        let mut hs = Vec::new();
                        for a in h.args().items() {
                            match a {
                                ast::Arg::Pos(e) => match cell_markup(e) {
                                    Ok(m) => hs.push(m),
                                    Err(reason) => return TableAt::Unsupported { reason },
                                },
                                _ => {
                                    return TableAt::Unsupported {
                                        reason: "Die Kopfzeile hat Einstellungen".into(),
                                    };
                                }
                            }
                        }
                        header = Some(hs);
                        continue;
                    }
                }
                match cell_markup(expr) {
                    Ok(m) => cells.push(m),
                    Err(reason) => return TableAt::Unsupported { reason },
                }
            }
        }
    }

    let columns = columns.unwrap_or(1);
    TableAt::Ok(TableModel {
        from: lines.byte_to_utf16(start).unwrap_or(0),
        to: lines.byte_to_utf16(end).unwrap_or(0),
        columns,
        columns_raw,
        align,
        align_all,
        header,
        cells,
        extra,
    })
}

/// A `mat(...)` / `vec(...)` call inside an equation, for the matrix editor.
/// The arguments are returned as raw math text; the frontend splits them.
#[derive(Serialize, Debug)]
pub struct MatrixAt {
    /// UTF-16 range of the whole call.
    from: usize,
    to: usize,
    func: String,
    /// Text between the outer parentheses.
    args: String,
}

pub fn matrix_at(text: &str, cursor_utf16: usize) -> Option<MatrixAt> {
    use typst::syntax::SyntaxKind;
    let source = Source::detached(text);
    let lines = source.lines();
    let cursor = lines.utf16_to_byte(cursor_utf16)?;
    let root = LinkedNode::new(source.root());
    let leaf = root.leaf_at(cursor, Side::Before).or_else(|| root.leaf_at(cursor, Side::After))?;
    let mut node = Some(leaf);
    while let Some(n) = node {
        if n.kind() == SyntaxKind::Equation {
            return None; // reached the equation without finding a matrix
        }
        if matches!(n.kind(), SyntaxKind::FuncCall | SyntaxKind::MathCall) {
            let callee = n.children().next()?;
            let name = callee.get().full_text().to_string();
            if (name == "mat" || name == "vec") && callee.kind() == SyntaxKind::MathIdent {
                let args = n.children().last()?.get().full_text().to_string();
                let inner = args.strip_prefix('(').and_then(|a| a.strip_suffix(')'))?;
                let r = n.range();
                return Some(MatrixAt {
                    from: lines.byte_to_utf16(r.start)?,
                    to: lines.byte_to_utf16(r.end)?,
                    func: name,
                    args: inner.to_string(),
                });
            }
        }
        node = n.parent().cloned();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_tables() {
        let text = "Text\n\n#table(\n  columns: (1fr, auto),\n  align: (left, center),\n  stroke: 0.5pt,\n  table.header[*A*][$x$],\n  [1], [Kraft $F$],\n  $y$, [ä],\n)\n";
        let cursor = text.find("Kraft").unwrap();
        let TableAt::Ok(m) = table_at(text, text[..cursor].encode_utf16().count()) else { panic!() };
        assert_eq!(m.columns, 2);
        assert_eq!(m.columns_raw.as_deref(), Some("(1fr, auto)"));
        assert_eq!(m.align, Some(vec!["left".into(), "center".into()]));
        assert_eq!(m.header, Some(vec!["*A*".into(), "$x$".into()]));
        assert_eq!(m.cells, vec!["1", "Kraft $F$", "$y$", "ä"]);
        assert_eq!(m.extra, vec![("stroke".into(), "0.5pt".into())]);
        let u: Vec<u16> = text.encode_utf16().collect();
        let call = String::from_utf16(&u[m.from..m.to]).unwrap();
        assert!(call.starts_with("#table(") && call.ends_with(')'), "{call}");

        // Cursor outside → none.
        assert!(matches!(table_at(text, 1), TableAt::None));

        // Merged cells → unsupported, with a reason.
        let t2 = "#table(columns: 2, table.cell(colspan: 2)[x])";
        assert!(matches!(table_at(t2, 10), TableAt::Unsupported { .. }));
    }
}

#[cfg(test)]
mod compile_tests {
    use crate::engine::Engine;

    /// The code the table editor generates must compile and read back.
    #[test]
    fn generated_tables_compile() {
        let doc = "#table(\n  columns: 3,\n  align: (left, center, right),\n  stroke: (_, y) => (top: if y == 0 { 1pt } else if y == 1 { 0.5pt } else { 0pt }, bottom: if y == 2 { 1pt } else { 0pt }),\n  table.header[$t$ in s][*B*][C],\n  [1], [2], [3],\n  [4], [], [$x^2$],\n)\n\n#table(\n  columns: 2,\n  stroke: none,\n  [a], [b],\n)\n";
        let dir = std::env::temp_dir().join("neotypst-table-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("main.typ"), doc).unwrap();
        let mut e = Engine::new();
        e.open(dir, "main.typ".into()).unwrap();
        let out = e.compile(None, None).unwrap();
        assert!(out.errors().is_empty(), "{:?}", out.errors());
        match super::table_at(doc, 30) {
            super::TableAt::Ok(m) => {
                assert_eq!(m.cells.len(), 6);
                assert!(m.extra.iter().any(|(k, v)| k == "stroke" && v.starts_with("(_, y) =>")));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn reads_matrices() {
        let t = "Text $ A = mat(1, 2; 3, f(x)) $ und $vec(a, b)$ und #table(columns: 2)[a][b] $ x $";
        let at = |w: &str| t[..t.find(w).unwrap()].encode_utf16().count();
        let m = super::matrix_at(t, at("f(x)") + 2).unwrap();
        assert_eq!((m.func.as_str(), m.args.as_str()), ("mat", "1, 2; 3, f(x)"));
        assert_eq!(&t[m.from..m.to], "mat(1, 2; 3, f(x))");
        let v = super::matrix_at(t, at("a, b")).unwrap();
        assert_eq!(v.func, "vec");
        assert!(super::matrix_at(t, at("Text")).is_none());
        assert!(super::matrix_at(t, at(" x $") + 1).is_none());
        assert!(super::matrix_at(t, at("columns")).is_none());
    }
}
