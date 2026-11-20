//! Renders a standalone snippet (e.g. a graphic building block) to SVG, with
//! the page sized to its content. Used for gallery thumbnails.

use std::fs;

use crate::engine::Engine;

/// Removes CodeMirror snippet syntax: `${1:text}` → `text`.
pub fn strip_snippet(code: &str) -> String {
    let mut out = String::with_capacity(code.len());
    let mut rest = code;
    while let Some(start) = rest.find("${") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        // Find the matching close brace (fields contain no nested braces).
        let Some(end) = after.find('}') else {
            out.push_str(&rest[start..]);
            return out;
        };
        let field = &after[..end];
        let text = match field.split_once(':') {
            Some((idx, t)) if idx.chars().all(|c| c.is_ascii_digit()) => t,
            _ if field.chars().all(|c| c.is_ascii_digit()) => "",
            _ => field,
        };
        out.push_str(text);
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    out
}

pub fn render_snippet(code: &str) -> Result<String, String> {
    let dir = std::env::temp_dir().join(format!("neotypst-snippet-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let doc = format!(
        "#set page(width: auto, height: auto, margin: 10pt, fill: white)\n#set text(lang: \"de\", size: 11pt)\n{}",
        strip_snippet(code)
    );
    fs::write(dir.join("main.typ"), doc).map_err(|e| e.to_string())?;
    let mut engine = Engine::new();
    engine.open(dir.clone(), "main.typ".into())?;
    let result = engine.first_page_svg();
    let _ = fs::remove_dir_all(&dir);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_snippets() {
        assert_eq!(strip_snippet("a ${1:b} c ${2:} d ${3} $x$"), "a b c  d  $x$");
    }

    /// Every graphic building block in `src/graphics/` must compile.
    #[test]
    fn graphics_compile() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/graphics");
        let mut failures = Vec::new();
        let mut count = 0;
        for entry in fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().and_then(|e| e.to_str()) != Some("typ") {
                continue;
            }
            count += 1;
            let code = fs::read_to_string(&path).unwrap();
            match render_snippet(&code) {
                Ok(svg) => assert!(svg.starts_with("<svg")),
                Err(e) => failures.push(format!("{}: {e}", path.file_name().unwrap().to_string_lossy())),
            }
        }
        assert!(count >= 10);
        assert!(failures.is_empty(), "\n{}", failures.join("\n"));
    }
}
