//! Code formatting with typstyle.

use typst::syntax::Source;
use typstyle_core::{Config, Typstyle};

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Formatted {
    /// UTF-16 range of the original text that `text` replaces.
    pub from: usize,
    pub to: usize,
    pub text: String,
}

fn style(width: usize) -> Typstyle {
    Typstyle::new(Config::new().with_width(width.clamp(40, 200)).with_tab_spaces(2))
}

/// Formats the whole text, or — with a non-empty UTF-16 selection — the smallest
/// syntax node covering it. Returns `None` if nothing changes.
pub fn format(text: &str, selection: Option<(usize, usize)>, width: usize) -> Result<Option<Formatted>, String> {
    let source = Source::detached(text);
    let ts = style(width);
    let err = |e: typstyle_core::Error| match e {
        typstyle_core::Error::SyntaxError => "Formatieren geht erst, wenn das Dokument keine Syntaxfehler mehr hat".to_string(),
        e => e.to_string(),
    };
    let lines = source.lines().clone();
    let (range, out) = match selection.filter(|(a, b)| a < b) {
        Some((a, b)) => {
            let a = lines.utf16_to_byte(a).ok_or("Ungültige Auswahl")?;
            let b = lines.utf16_to_byte(b).ok_or("Ungültige Auswahl")?;
            let r = ts.format_source_range(source, a..b).map_err(err)?;
            (r.source_range, r.content)
        }
        None => {
            let out = ts.format_source(source).render().map_err(err)?;
            (0..text.len(), out)
        }
    };
    if text[range.clone()] == out {
        return Ok(None);
    }
    Ok(Some(Formatted {
        from: lines.byte_to_utf16(range.start).unwrap_or(0),
        to: lines.byte_to_utf16(range.end).unwrap_or(0),
        text: out,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_document_and_selection() {
        let src = "#let f(x)=x+1\n#table(columns:2,[a],[b])\n";
        let all = format(src, None, 80).unwrap().unwrap();
        assert_eq!(all.from, 0);
        assert!(all.text.contains("#let f(x) = x + 1"), "{}", all.text);
        assert!(all.text.contains("columns: 2"), "{}", all.text);

        // Already formatted → nothing to do.
        assert_eq!(format(&all.text, None, 80).unwrap(), None);

        // Only the selected call; offsets are UTF-16 (ä counts once).
        let src = "Ä #let f(x)=x+1\n#g(a:1)\n";
        let start = src.find("#g").unwrap() - 1; // byte offset; "Ä" is 2 bytes, 1 UTF-16 unit
        let sel = format(src, Some((start, start + 7)), 80).unwrap().unwrap();
        assert!(sel.text.contains("a: 1"), "{sel:?}");
        assert!(!sel.text.contains("x + 1"));

        assert!(format("#let x = (", None, 80).is_err());
    }
}
