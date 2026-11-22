//! The compile engine. Lives on a dedicated thread with a large stack (Typst
//! can recurse deeply) and owns the current project session. All commands that
//! touch the compiler are funnelled through [`EngineHandle::run`].

use std::num::NonZeroUsize;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Instant;

use serde::Serialize;
use typst::WorldExt;
use typst::diag::{Severity, SourceDiagnostic, Warned};
use typst::introspection::PagedPosition;
use typst::layout::{Abs, Point};
use typst::syntax::{FileId, LinkedNode, Source};
use typst::World;
use typst_layout::PagedDocument;

use crate::world::{EditorWorld, file_id};

type Job = Box<dyn FnOnce(&mut Engine) + Send>;

#[derive(Clone)]
pub struct EngineHandle {
    tx: mpsc::Sender<Job>,
}

impl EngineHandle {
    pub fn spawn() -> Self {
        let (tx, rx) = mpsc::channel::<Job>();
        std::thread::Builder::new()
            .name("typst-engine".into())
            .stack_size(256 * 1024 * 1024)
            .spawn(move || {
                let mut engine = Engine::new();
                while let Ok(job) = rx.recv() {
                    job(&mut engine);
                }
            })
            .expect("failed to spawn engine thread");
        Self { tx }
    }

    pub async fn run<T, F>(&self, f: F) -> T
    where
        T: Send + 'static,
        F: FnOnce(&mut Engine) -> T + Send + 'static,
    {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.tx
            .send(Box::new(move |engine| {
                let _ = tx.send(f(engine));
            }))
            .expect("engine thread gone");
        rx.await.expect("engine dropped job")
    }
}

pub struct Engine {
    session: Option<Session>,
}

struct Session {
    world: EditorWorld,
    document: Option<PagedDocument>,
    /// Hashes of the pages the frontend currently has, to send only changes.
    sent: Vec<u128>,
    solutions: bool,
}

#[derive(Serialize)]
pub struct PageOut {
    hash: String,
    /// `None` if the frontend already has this exact page.
    svg: Option<String>,
    width: f64,
    height: f64,
}

#[derive(Serialize)]
pub struct DiagOut {
    severity: &'static str,
    message: String,
    hints: Vec<String>,
    /// Project-relative file, if the problem is located in the project.
    file: Option<String>,
    /// UTF-16 offsets into that file.
    from: Option<usize>,
    to: Option<usize>,
    line: Option<usize>,
}

#[derive(Serialize)]
pub struct CompileOut {
    /// `None` if compilation failed (keep showing the previous preview).
    pages: Option<Vec<PageOut>>,
    diagnostics: Vec<DiagOut>,
    millis: u128,
}

#[derive(Serialize, Debug)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum JumpOut {
    File { file: String, offset: usize },
    Url { url: String },
    Position { page: usize, x: f64, y: f64 },
}

#[derive(Serialize)]
pub struct PosOut {
    page: usize,
    x: f64,
    y: f64,
}

#[derive(Serialize)]
pub struct MathWord {
    pub from: usize,
    pub to: usize,
    pub known: bool,
}

#[derive(Serialize)]
pub struct CompletionsOut {
    from: usize,
    items: Vec<serde_json::Value>,
}

#[cfg(test)]
impl CompileOut {
    pub fn errors(&self) -> Vec<String> {
        self.diagnostics
            .iter()
            .filter(|d| d.severity == "error")
            .map(|d| format!("{} ({:?}:{:?})", d.message, d.file, d.line))
            .collect()
    }
    pub fn page_count(&self) -> usize {
        self.pages.as_ref().map(|p| p.len()).unwrap_or(0)
    }
}

impl Engine {
    pub fn new() -> Self {
        Engine { session: None }
    }

    /// Compiles once and returns page 1 as SVG (for template previews).
    pub fn first_page_svg(&mut self) -> Result<String, String> {
        let s = self.session()?;
        s.world.reset();
        let doc = typst::compile::<PagedDocument>(&s.world).output.map_err(|errors| {
            errors.first().map(|e| e.message.to_string()).unwrap_or_else(|| "Fehler".into())
        })?;
        let page = doc.pages().first().ok_or("Leeres Dokument")?;
        Ok(typst_svg::svg(page, &Default::default()))
    }

    fn session(&mut self) -> Result<&mut Session, String> {
        self.session.as_mut().ok_or_else(|| "Kein Projekt geöffnet".to_string())
    }

    pub fn open(&mut self, root: PathBuf, main: String) -> Result<(), String> {
        let world = EditorWorld::new(&root, &main)?;
        self.session = Some(Session { world, document: None, sent: vec![], solutions: false });
        Ok(())
    }

    pub fn close(&mut self) {
        self.session = None;
        typst::comemo::evict(0);
    }

    pub fn set_main(&mut self, main: String) -> Result<(), String> {
        let s = self.session()?;
        s.world.set_main(&main)?;
        s.sent.clear();
        Ok(())
    }

    pub fn set_solutions(&mut self, on: bool) -> Result<(), String> {
        let s = self.session()?;
        s.solutions = on;
        s.world.set_solutions(on);
        Ok(())
    }

    pub fn forget_preview(&mut self) -> Result<(), String> {
        self.session()?.sent.clear();
        Ok(())
    }

    pub fn drop_buffer(&mut self, rel: String) -> Result<(), String> {
        let world = &mut self.session()?.world;
        world.drop_buffer(&rel);
        world.drop_buffers_under(&rel);
        Ok(())
    }

    pub fn compile(&mut self, rel: Option<String>, text: Option<String>) -> Result<CompileOut, String> {
        let s = self.session()?;
        if let (Some(rel), Some(text)) = (rel, text) {
            s.world.set_buffer(&rel, text)?;
        }
        s.world.reset();

        let start = Instant::now();
        let Warned { output, warnings } = typst::compile::<PagedDocument>(&s.world);
        let millis = start.elapsed().as_millis();

        let mut diagnostics = Vec::new();
        let pages = match output {
            Ok(doc) => {
                let hashes: Vec<u128> = doc.pages().iter().map(typst::utils::hash128).collect();
                let pages = doc
                    .pages()
                    .iter()
                    .zip(&hashes)
                    .enumerate()
                    .map(|(i, (page, &hash))| {
                        let fresh = s.sent.get(i) != Some(&hash);
                        let size = page.frame.size();
                        PageOut {
                            hash: format!("{hash:032x}"),
                            svg: fresh.then(|| typst_svg::svg(page, &Default::default())),
                            width: size.x.to_pt(),
                            height: size.y.to_pt(),
                        }
                    })
                    .collect();
                s.sent = hashes;
                s.document = Some(doc);
                Some(pages)
            }
            Err(errors) => {
                for e in errors.iter() {
                    diagnostics.push(convert_diag(&s.world, e));
                }
                None
            }
        };
        for w in warnings.iter() {
            diagnostics.push(convert_diag(&s.world, w));
        }

        typst::comemo::evict(30);
        Ok(CompileOut { pages, diagnostics, millis })
    }

    pub fn jump_from_click(&mut self, page: usize, x: f64, y: f64) -> Result<Option<JumpOut>, String> {
        let s = self.session()?;
        let Some(doc) = &s.document else { return Ok(None) };
        let Some(page) = NonZeroUsize::new(page + 1) else { return Ok(None) };
        let at = |x: f64, y: f64| PagedPosition { page, point: Point::new(Abs::pt(x), Abs::pt(y)) };
        let in_template = |j: &typst_ide::Jump| match j {
            typst_ide::Jump::File(id, _) => s.world.rel_path(*id).is_some_and(|f| f.starts_with("templates/")),
            _ => false,
        };
        let mut jump = typst_ide::jump_from_click(&s.world, doc, &at(x, y));
        // Text, den eine Vorlage erzeugt (z. B. „Aufgabe 1“ aus stil.typ), führt
        // in die Vorlage. Gesucht ist aber die Stelle im eigenen Dokument: den
        // nächstgelegenen Text suchen, der aus einer eigenen Datei stammt.
        if jump.as_ref().is_some_and(&in_template) {
            'suche: for r in [6.0, 12.0, 18.0, 26.0, 36.0, 50.0, 70.0, 95.0, 130.0, 180.0] {
                for k in 0..24 {
                    let a = k as f64 * std::f64::consts::TAU / 24.0;
                    let near = typst_ide::jump_from_click(&s.world, doc, &at(x + r * a.cos(), y + r * a.sin()));
                    if let Some(j @ typst_ide::Jump::File(..)) = near
                        && !in_template(&j)
                    {
                        jump = Some(j);
                        break 'suche;
                    }
                }
            }
        }
        Ok(jump.and_then(|j| match j {
            typst_ide::Jump::File(id, byte) => {
                let file = s.world.rel_path(id)?;
                let offset = byte_to_utf16(&s.world, id, byte)?;
                Some(JumpOut::File { file, offset })
            }
            typst_ide::Jump::Url(url) => Some(JumpOut::Url { url: url.to_string() }),
            typst_ide::Jump::Position(p) => Some(JumpOut::Position {
                page: p.page.get() - 1,
                x: p.point.x.to_pt(),
                y: p.point.y.to_pt(),
            }),
        }))
    }

    pub fn jump_from_cursor(&mut self, rel: String, offset: usize) -> Result<Vec<PosOut>, String> {
        let s = self.session()?;
        let Some(doc) = &s.document else { return Ok(vec![]) };
        let source = s.world.source(file_id(&rel)?).map_err(|e| e.to_string())?;
        let Some(byte) = source.lines().utf16_to_byte(offset) else { return Ok(vec![]) };
        Ok(typst_ide::jump_from_cursor(doc, &source, byte)
            .into_iter()
            .map(|p| PosOut { page: p.page.get() - 1, x: p.point.x.to_pt(), y: p.point.y.to_pt() })
            .collect())
    }

    pub fn complete(
        &mut self,
        rel: String,
        text: String,
        offset: usize,
        explicit: bool,
    ) -> Result<Option<CompletionsOut>, String> {
        let s = self.session()?;
        let id = s.world.set_buffer(&rel, text)?;
        s.world.reset();
        let source = s.world.source(id).map_err(|e| e.to_string())?;
        let Some(byte) = source.lines().utf16_to_byte(offset) else { return Ok(None) };
        let Some((from, items)) =
            typst_ide::autocomplete(&s.world, s.document.as_ref(), &source, byte, explicit)
        else {
            return Ok(None);
        };
        let from = source.lines().byte_to_utf16(from).unwrap_or(offset);
        let items = items
            .into_iter()
            .take(200)
            .filter_map(|c| serde_json::to_value(c).ok())
            .collect();
        Ok(Some(CompletionsOut { from, items }))
    }

    /// Looks at the math identifier that ends at `offset` (UTF-16). Returns its
    /// range and whether it resolves to something (math/global scope, `let`,
    /// import). Only multi-letter idents directly inside an equation count;
    /// field accesses (`arrow.r`) and function callees are ignored.
    pub fn math_word(&mut self, rel: String, text: String, offset: usize) -> Result<Option<MathWord>, String> {
        use typst::syntax::{Side, SyntaxKind};
        use typst_ide::NamedItem;
        let s = self.session()?;
        let id = s.world.set_buffer(&rel, text)?;
        s.world.reset();
        let source = s.world.source(id).map_err(|e| e.to_string())?;
        let Some(byte) = source.lines().utf16_to_byte(offset) else { return Ok(None) };
        let root = LinkedNode::new(source.root());
        let Some(leaf) = root.leaf_at(byte, Side::Before) else { return Ok(None) };
        if leaf.kind() != SyntaxKind::MathIdent || leaf.range().end != byte {
            return Ok(None);
        }
        let name = leaf.leaf_text().clone();
        if name.chars().count() < 2 {
            return Ok(None);
        }
        let parent = leaf.parent_kind();
        if matches!(parent, Some(SyntaxKind::FieldAccess | SyntaxKind::FuncCall | SyntaxKind::MathFieldAccess | SyntaxKind::MathCall)) {
            return Ok(None);
        }
        let lib = s.world.library();
        let mut known = lib.math.scope().get(&name).is_some() || lib.global.scope().get(&name).is_some();
        if !known {
            known = typst_ide::named_items(&s.world, leaf.clone(), |item| {
                let n = match &item {
                    NamedItem::Var(i) | NamedItem::Fn(i) => i.get(),
                    NamedItem::Module(n, ..) | NamedItem::Import(n, ..) => *n,
                };
                (n == &name).then_some(())
            })
            .is_some();
        }
        let r = leaf.range();
        let lines = source.lines();
        Ok(Some(MathWord {
            from: lines.byte_to_utf16(r.start).unwrap_or(0),
            to: lines.byte_to_utf16(r.end).unwrap_or(offset),
            known,
        }))
    }

    /// Exports PDFs into `<project>/out/`. With `both`, exports a student and
    /// a solution version (`-loesung`). Returns the written paths.
    pub fn export_pdf(&mut self, both: bool) -> Result<Vec<String>, String> {
        let s = self.session()?;
        let out_dir = s.world.root().join("out");
        std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
        let stem = s
            .world
            .rel_path(s.world.main())
            .and_then(|p| PathBuf::from(p).file_stem().map(|s| s.to_string_lossy().into_owned()))
            .unwrap_or_else(|| "dokument".into());

        let previous = s.solutions;
        let variants: Vec<bool> = if both { vec![false, true] } else { vec![previous] };
        let mut written = Vec::new();
        let mut failure = None;
        for solutions in variants {
            s.world.set_solutions(solutions);
            s.world.reset();
            let doc = match typst::compile::<PagedDocument>(&s.world).output {
                Ok(doc) => doc,
                Err(errors) => {
                    failure = Some(format!(
                        "Kompilieren fehlgeschlagen: {}",
                        errors.first().map(|e| e.message.as_str()).unwrap_or("?")
                    ));
                    break;
                }
            };
            let bytes = match typst_pdf::pdf(&doc, &Default::default()) {
                Ok(b) => b,
                Err(errors) => {
                    failure = Some(format!(
                        "PDF-Export fehlgeschlagen: {}",
                        errors.first().map(|e| e.message.as_str()).unwrap_or("?")
                    ));
                    break;
                }
            };
            let name = if both && solutions { format!("{stem}-loesung.pdf") } else { format!("{stem}.pdf") };
            let path = out_dir.join(name);
            std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
            written.push(path.to_string_lossy().into_owned());
        }
        s.world.set_solutions(previous);
        match failure {
            Some(f) => Err(f),
            None => Ok(written),
        }
    }
}

fn byte_to_utf16(world: &EditorWorld, id: FileId, byte: usize) -> Option<usize> {
    world.source(id).ok()?.lines().byte_to_utf16(byte)
}

fn convert_diag(world: &EditorWorld, d: &SourceDiagnostic) -> DiagOut {
    let severity = match d.severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
    };
    let hints = d.hints.iter().map(|h| h.v.to_string()).collect();

    // Prefer the diagnostic's own location if it lies in the project. If it
    // lies inside a package (e.g. a template function), fall back to the
    // innermost call site in the project.
    let candidates = std::iter::once(d.span).chain(d.trace.iter().map(|t| t.span.into()));
    for span in candidates {
        let Some(id) = span.id() else { continue };
        let Some(file) = world.rel_path(id) else { continue };
        let Some(range) = world.range(span) else { continue };
        let Ok(source) = world.source(id) else { continue };
        let lines = source.lines();
        return DiagOut {
            severity,
            message: d.message.to_string(),
            hints,
            file: Some(file),
            from: lines.byte_to_utf16(range.start),
            to: lines.byte_to_utf16(range.end),
            line: lines.byte_to_line(range.start).map(|l| l + 1),
        };
    }
    DiagOut { severity, message: d.message.to_string(), hints, file: None, from: None, to: None, line: None }
}

/// Syntax highlighting straight from Typst's own parser. Returns flat,
/// non-overlapping `(from, to, class)` tokens in UTF-16 offsets.
///
/// Typst's highlighter leaves most of math unstyled (variables, numbers,
/// symbol names look like plain text), so inside equations we assign our own
/// `typ-math-*` classes, plus a `typ-math` base class for a subtle tint.
pub fn highlight(text: &str) -> Vec<(usize, usize, &'static str)> {
    use typst::syntax::{SyntaxKind, Tag};

    #[derive(Clone, Copy)]
    struct Ctx {
        tag: Option<Tag>,
        in_math: bool,
        /// Forced class for all leaves (e.g. a whole `arrow.r`).
        force: Option<&'static str>,
    }

    fn math_class(tag: Option<Tag>, leaf: &LinkedNode) -> &'static str {
        match tag {
            Some(Tag::MathDelimiter) => "typ-math typ-math-delim",
            Some(Tag::MathOperator) | Some(Tag::Escape) => "typ-math typ-math-op",
            Some(Tag::MathGroupingParens) => "typ-math typ-math-group",
            Some(Tag::Function) => "typ-math typ-math-func",
            Some(Tag::Interpolated) => "typ-math typ-math-ident",
            Some(Tag::String) => "typ-math typ-math-str",
            Some(Tag::Comment) => "typ-math typ-comment",
            Some(Tag::Error) => "typ-math typ-error",
            Some(Tag::Number) => "typ-math typ-math-num",
            Some(Tag::Keyword) => "typ-math typ-key",
            Some(Tag::Punctuation) => "typ-math typ-math-group",
            Some(_) => "typ-math typ-math-ident",
            None => match leaf.kind() {
                SyntaxKind::MathText => {
                    let t = leaf.get().leaf_text();
                    if t.chars().all(|c| c.is_ascii_digit() || c == '.' || c == ',') {
                        "typ-math typ-math-num"
                    } else if t.chars().all(char::is_alphabetic) {
                        "typ-math typ-math-var"
                    } else {
                        "typ-math typ-math-op"
                    }
                }
                SyntaxKind::Comma | SyntaxKind::Semicolon => "typ-math typ-math-group",
                _ => "typ-math",
            },
        }
    }

    fn walk(node: &LinkedNode, ctx: Ctx, pos: &mut usize, out: &mut Vec<(usize, usize, &'static str)>) {
        let kind = node.kind();
        let in_math = ctx.in_math || kind == SyntaxKind::Equation;
        // Embedded code (`#x`) and content blocks inside math are not math.
        let in_math = in_math && !matches!(kind, SyntaxKind::ContentBlock | SyntaxKind::Markup);
        let tag = typst::syntax::highlight(node).or(ctx.tag);
        let mut force = ctx.force;
        if in_math && force.is_none() && kind == SyntaxKind::MathFieldAccess {
            // `arrow.r.double` as one unit; a function if called (`dot.double(x)`).
            let head_tag = typst::syntax::highlight(node);
            let called = node
                .next_leaf()
                .is_some_and(|n| n.kind() == SyntaxKind::LeftParen && n.offset() == node.range().end);
            force = Some(if called || head_tag == Some(Tag::Function) {
                "typ-math typ-math-func"
            } else {
                "typ-math typ-math-ident"
            });
        }

        if node.get().children().len() == 0 {
            let len = node.get().leaf_text().encode_utf16().count();
            let class = if in_math {
                Some(force.unwrap_or_else(|| math_class(tag, node)))
            } else {
                tag.map(|t| t.css_class())
            };
            if let Some(class) = class {
                let from = *pos;
                let to = from + len;
                match out.last_mut() {
                    Some(last) if last.1 == from && last.2 == class => last.1 = to,
                    _ => out.push((from, to, class)),
                }
            }
            *pos += len;
        } else {
            let child_ctx = Ctx { tag, in_math, force };
            for child in node.children() {
                walk(&child, child_ctx, pos, out);
            }
        }
    }

    let source = Source::detached(text);
    let mut out = Vec::new();
    let mut pos = 0usize;
    walk(&LinkedNode::new(source.root()), Ctx { tag: None, in_math: false, force: None }, &mut pos, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn math_words() {
        let dir = std::env::temp_dir().join("neotypst-math-word-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("lib.typ"), "#let kraft = 1").unwrap();
        let text = "#import \"lib.typ\": *\n#let vv = 2\n$ Fläche = sin alpha + vv + kraft + arrow.r + E_kin + x $";
        std::fs::write(dir.join("main.typ"), text).unwrap();
        let mut e = Engine::new();
        e.open(dir, "main.typ".into()).unwrap();
        let at = |w: &str| {
            let end = text.rfind(w).unwrap() + w.len();
            text[..end].encode_utf16().count()
        };
        let mut check = |w: &str| e.math_word("main.typ".into(), text.into(), at(w)).unwrap().map(|m| m.known);
        assert_eq!(check("Fläche"), Some(false));
        assert_eq!(check("sin"), Some(true));
        assert_eq!(check("alpha"), Some(true));
        assert_eq!(check("vv"), Some(true));
        assert_eq!(check("kraft"), Some(true));
        assert_eq!(check("arrow"), None);
        assert_eq!(check("kin"), Some(false));
        assert_eq!(check(" x"), None);
        assert_eq!(check("#import"), None);
    }

    /// Ein Klick auf Text, den eine Vorlage erzeugt, springt nicht in die
    /// Vorlage, sondern zur nächsten Stelle im eigenen Dokument.
    #[test]
    fn click_on_template_text_lands_in_document() {
        let dir = std::env::temp_dir().join("neotypst-template-jump-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("templates")).unwrap();
        std::fs::write(dir.join("templates/vorlage.typ"), "#let kasten(body) = [*Aufgabe Kopfzeile* \\ #body]").unwrap();
        let text = "#import \"templates/vorlage.typ\": *\n#kasten[Hier steht die Aufgabenstellung.]";
        std::fs::write(dir.join("main.typ"), text).unwrap();
        let mut e = Engine::new();
        e.open(dir, "main.typ".into()).unwrap();
        e.compile(None, None).unwrap();
        let off = text[..text.find("Hier").unwrap()].encode_utf16().count();
        let p = e.jump_from_cursor("main.typ".into(), off).unwrap().remove(0);
        // Eine Zeile höher steht die Kopfzeile aus der Vorlage: Typst selbst
        // würde dorthin springen …
        let (kx, ky) = (p.x + 3.0, p.y - 18.0);
        {
            let s = e.session().unwrap();
            let pos = PagedPosition {
                page: NonZeroUsize::new(p.page + 1).unwrap(),
                point: Point::new(Abs::pt(kx), Abs::pt(ky)),
            };
            let roh = typst_ide::jump_from_click(&s.world, s.document.as_ref().unwrap(), &pos);
            let ziel = match roh {
                Some(typst_ide::Jump::File(id, _)) => s.world.rel_path(id),
                _ => None,
            };
            assert_eq!(ziel.as_deref(), Some("templates/vorlage.typ"));
        }
        // … NeoTypst landet im eigenen Dokument.
        let j = e.jump_from_click(p.page, kx, ky).unwrap();
        match j {
            Some(JumpOut::File { file, .. }) => assert_eq!(file, "main.typ"),
            other => panic!("Sprung nicht ins Dokument: {other:?}"),
        }
    }

    #[test]
    fn ide_features() {
        let dir = std::env::temp_dir().join("neotypst-ide-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let base = "= Überschrift\n\nHallo Welt $x^2$ ünd mehr.\n\n";
        let text = &format!("{base}#tab");
        std::fs::write(dir.join("main.typ"), text).unwrap();
        let mut e = Engine::new();
        e.open(dir, "main.typ".into()).unwrap();
        let out = e.compile(Some("main.typ".into()), Some(base.into())).unwrap();
        assert_eq!(out.page_count(), 1);
        // A broken document reports an error and keeps the last preview.
        let broken = e.compile(Some("main.typ".into()), Some(text.clone())).unwrap();
        assert!(broken.pages.is_none() && !broken.errors().is_empty());

        // Completion after `#tab` (UTF-16 offset = end of text).
        let end = text.encode_utf16().count();
        let c = e.complete("main.typ".into(), text.clone(), end, false).unwrap().unwrap();
        assert!(c.items.iter().any(|i| i["label"] == "table"), "no table completion");

        // Cursor in "Welt" → preview position on page 0.
        e.compile(Some("main.typ".into()), Some(base.into())).unwrap();
        let off = text.find("Welt").unwrap();
        let off16 = text[..off].encode_utf16().count();
        let pos = e.jump_from_cursor("main.typ".into(), off16).unwrap();
        assert!(!pos.is_empty(), "no position for cursor");

        // Clicking there jumps back into main.typ.
        let p = &pos[0];
        let j = e.jump_from_click(p.page, p.x + 1.0, p.y - 2.0).unwrap();
        assert!(matches!(j, Some(JumpOut::File { .. })), "click did not resolve to file");

        // Highlighting covers the heading.
        let hl = highlight(text);
        assert!(hl.iter().any(|t| t.2 == "typ-heading"));

        // Math gets its own classes.
        let m = "Es gilt $alpha + sqrt(x^2) -> arrow.r 12 \"m\"$ fertig.";
        let hl = highlight(m);
        let class_of = |needle: &str| {
            let at = m[..m.find(needle).unwrap()].encode_utf16().count();
            hl.iter().find(|t| t.0 <= at && at < t.1).map(|t| t.2).unwrap_or("none")
        };
        assert_eq!(class_of("alpha"), "typ-math typ-math-ident");
        assert_eq!(class_of("sqrt"), "typ-math typ-math-func");
        assert_eq!(class_of("x^"), "typ-math typ-math-var");
        assert_eq!(class_of("^2"), "typ-math typ-math-op");
        assert_eq!(class_of("->"), "typ-math typ-math-op");
        assert_eq!(class_of("arrow.r"), "typ-math typ-math-ident");
        assert_eq!(class_of("12"), "typ-math typ-math-num");
        assert_eq!(class_of("\"m\""), "typ-math typ-math-str");
        assert_eq!(class_of("$alpha"), "typ-math typ-math-delim");
        assert_eq!(class_of("fertig"), "none");
    }
}

#[cfg(test)]
mod pkg_download {
    use super::*;
    #[test]
    #[ignore]
    fn download_packages() {
        let dir = std::path::PathBuf::from(std::env::var("PKG_DIR").unwrap());
        let mut e = Engine::new();
        e.open(dir, "main.typ".into()).unwrap();
        let out = e.compile(None, None).unwrap();
        println!("ERRORS: {:?}", out.errors());
    }
}
