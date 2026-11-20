//! Symbol list for the symbol palette, read straight from Typst's `sym` module
//! so it always matches the compiler version.

use typst::foundations::Value;
use typst::syntax::{LinkedNode, Side, Source, SyntaxMode};
use typst::{Library, LibraryExt};

/// All (non-deprecated) symbol variants as `(name, glyph)`, e.g.
/// `("arrow.r.double", "⇒")`.
pub fn all() -> Vec<(String, String)> {
    let lib = Library::default();
    let mut out = Vec::new();
    let Some(binding) = lib.global.scope().get("sym") else { return out };
    let Value::Module(module) = binding.read() else { return out };
    for (name, b) in module.scope().iter() {
        let Value::Symbol(sym) = b.read() else { continue };
        for (mods, glyph, deprecation) in sym.variants() {
            if deprecation.is_some() {
                continue;
            }
            let mods: Vec<&str> = mods.into_iter().collect();
            let full = if mods.is_empty() { name.to_string() } else { format!("{name}.{}", mods.join(".")) };
            out.push((full, glyph.to_string()));
        }
    }
    out
}

/// Syntax mode at a UTF-16 cursor offset: "markup", "math" or "code".
pub fn mode_at(text: &str, offset: usize) -> &'static str {
    let source = Source::detached(text);
    let Some(byte) = source.lines().utf16_to_byte(offset) else { return "markup" };
    let root = LinkedNode::new(source.root());
    let Some(leaf) = root.leaf_at(byte, Side::Before) else { return "markup" };
    match leaf.mode_after() {
        Some(SyntaxMode::Math) => "math",
        Some(SyntaxMode::Code) => "code",
        _ => "markup",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_symbols_and_modes() {
        let syms = all();
        assert!(syms.len() > 500, "only {} symbols", syms.len());
        assert!(syms.iter().any(|(n, g)| n == "arrow.r.double" && g == "⇒"));
        assert!(syms.iter().any(|(n, g)| n == "alpha" && g == "α"));
        let t = "Text $a + b$ und #f(x)";
        assert_eq!(mode_at(t, 2), "markup");
        assert_eq!(mode_at(t, 8), "math");
        assert_eq!(mode_at(t, 20), "code");
    }
}
