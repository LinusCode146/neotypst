//! Literature: reading BibTeX/Hayagriva files, finding the bibliography file
//! of a project, and fetching entries by DOI or ISBN.

use std::fs;
use std::path::Path;

use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
pub struct BibEntry {
    pub key: String,
    pub kind: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub container: Option<String>,
    pub file: String,
}

#[derive(Serialize, Debug)]
pub struct BibOverview {
    /// Bibliography files referenced in the project (or found in it).
    pub files: Vec<String>,
    /// The file new entries go to (may not exist yet).
    pub target: String,
    /// `.typ` file containing the `bibliography(...)` call, if any.
    pub call_file: Option<String>,
    /// Current `style:` argument, if set.
    pub style: Option<String>,
    pub entries: Vec<BibEntry>,
    pub errors: Vec<String>,
}

pub fn parse(text: &str, file: &str) -> Result<Vec<BibEntry>, String> {
    let lib = if file.ends_with(".yml") || file.ends_with(".yaml") {
        hayagriva::io::from_yaml_str(text).map_err(|e| e.to_string())?
    } else {
        hayagriva::io::from_biblatex_str(text).map_err(|errs| {
            errs.iter().map(|e| format!("{e:?}")).take(3).collect::<Vec<_>>().join("; ")
        })?
    };
    Ok(lib
        .iter()
        .map(|e| BibEntry {
            key: e.key().to_string(),
            kind: format!("{:?}", e.entry_type()).to_lowercase(),
            title: e.title().map(|t| t.to_string()).unwrap_or_default(),
            authors: e
                .authors()
                .map(|a| a.iter().map(|p| p.name_first(false, true)).collect())
                .unwrap_or_default(),
            year: e.date_any().map(|d| d.year),
            container: e.parents().first().and_then(|p| p.title()).map(|t| t.to_string()),
            file: file.to_string(),
        })
        .collect())
}

/// Finds `bibliography("a.bib")` / `bibliography(("a.bib", "b.yml"))` calls.
fn find_calls(text: &str) -> Vec<(Vec<String>, Option<String>)> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(i) = rest.find("bibliography(") {
        let after = &rest[i + "bibliography(".len()..];
        // Up to the matching close paren (no nesting deeper than one level).
        let mut depth = 1;
        let mut end = after.len();
        for (j, c) in after.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = j;
                        break;
                    }
                }
                _ => {}
            }
        }
        let args = &after[..end];
        let style = args.find("style:").and_then(|s| {
            let v = &args[s + 6..];
            let a = v.find('"')?;
            let b = v[a + 1..].find('"')?;
            Some(v[a + 1..a + 1 + b].to_string())
        });
        let head = args.split("style:").next().unwrap_or(args);
        let files: Vec<String> = head
            .split('"')
            .skip(1)
            .step_by(2)
            .filter(|s| s.ends_with(".bib") || s.ends_with(".yml") || s.ends_with(".yaml"))
            .map(|s| s.trim_start_matches('/').to_string())
            .collect();
        if !files.is_empty() {
            out.push((files, style));
        }
        rest = &after[end.min(after.len())..];
    }
    out
}

pub fn overview(root: &Path) -> BibOverview {
    let all = crate::project::walk_files(root);
    let mut files: Vec<String> = Vec::new();
    let mut call_file = None;
    let mut style = None;
    for rel in all.iter().filter(|f| f.ends_with(".typ")) {
        let Ok(text) = fs::read_to_string(root.join(rel)) else { continue };
        // Strip line comments to avoid picking up commented-out calls.
        let text: String = text.lines().map(|l| l.split("//").next().unwrap_or("")).collect::<Vec<_>>().join("\n");
        for (fs_, st) in find_calls(&text) {
            if call_file.is_none() {
                call_file = Some(rel.clone());
                style = st;
            }
            for f in fs_ {
                // Paths are relative to the .typ file.
                let base = Path::new(rel).parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
                let full = if base.is_empty() { f } else { format!("{base}/{f}") };
                if !files.contains(&full) {
                    files.push(full);
                }
            }
        }
    }
    if files.is_empty() {
        files = all.iter().filter(|f| f.ends_with(".bib")).cloned().collect();
    }
    let target = files.first().cloned().unwrap_or_else(|| "literatur.bib".into());
    let mut entries = Vec::new();
    let mut errors = Vec::new();
    for f in &files {
        match fs::read_to_string(root.join(f)) {
            Ok(text) => match parse(&text, f) {
                Ok(mut e) => entries.append(&mut e),
                Err(e) => errors.push(format!("{f}: {e}")),
            },
            Err(_) => {}
        }
    }
    BibOverview { files, target, call_file, style, entries, errors }
}

// ---------- Lookup ----------

#[derive(Serialize, Debug)]
pub struct Lookup {
    pub bibtex: String,
    pub entry: BibEntry,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent(concat!("neotypst/", env!("CARGO_PKG_VERSION")))
        .build()
}

fn clean_doi(q: &str) -> Option<String> {
    let q = q.trim();
    let q = q
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_start_matches("dx.doi.org/")
        .trim_start_matches("doi.org/")
        .trim_start_matches("doi:")
        .trim();
    (q.starts_with("10.") && q.contains('/')).then(|| q.to_string())
}

fn clean_isbn(q: &str) -> Option<String> {
    let digits: String = q.chars().filter(|c| c.is_ascii_digit() || *c == 'X' || *c == 'x').collect();
    let looks_like = q.chars().all(|c| c.is_ascii_digit() || " -xXISBNisbn:".contains(c));
    (looks_like && (digits.len() == 10 || digits.len() == 13)).then_some(digits)
}

/// Readable citation key: `nachname2024wort`.
pub fn make_key(authors: &[String], year: Option<i32>, title: &str, taken: &[String]) -> String {
    let fold = |s: &str| -> String {
        s.chars()
            .flat_map(|c| match c {
                'ä' | 'Ä' => "ae".chars().collect::<Vec<_>>(),
                'ö' | 'Ö' => "oe".chars().collect(),
                'ü' | 'Ü' => "ue".chars().collect(),
                'ß' => "ss".chars().collect(),
                c if c.is_ascii_alphanumeric() => vec![c.to_ascii_lowercase()],
                _ => vec![],
            })
            .collect()
    };
    let last = authors
        .first()
        .map(|a| a.split(',').next().unwrap_or(a).split_whitespace().last().unwrap_or("").to_string())
        .unwrap_or_default();
    const SKIP: &[&str] = &["the", "a", "an", "der", "die", "das", "ein", "eine", "on", "of", "zur", "zum", "and", "und"];
    let word = title
        .split_whitespace()
        .map(fold)
        .find(|w| w.len() > 2 && !SKIP.contains(&w.as_str()))
        .unwrap_or_default();
    let mut base = format!("{}{}{}", fold(&last), year.map(|y| y.to_string()).unwrap_or_default(), word);
    if base.is_empty() {
        base = "quelle".into();
    }
    let mut key = base.clone();
    let mut n = b'a';
    while taken.iter().any(|t| t == &key) {
        key = format!("{base}{}", n as char);
        n += 1;
    }
    key
}

/// Replaces the key of the first BibTeX entry.
fn rekey(bibtex: &str, key: &str) -> String {
    match (bibtex.find('{'), bibtex.find(',')) {
        (Some(a), Some(b)) if a < b => format!("{}{{{}{}", &bibtex[..a], key, &bibtex[b..]),
        _ => bibtex.to_string(),
    }
}

fn escape_bib(s: &str) -> String {
    s.replace('{', "\\{").replace('}', "\\}")
}

pub fn lookup(query: &str, taken: &[String]) -> Result<Lookup, String> {
    let bibtex = if let Some(doi) = clean_doi(query) {
        let url = format!("https://doi.org/{doi}");
        agent()
            .get(&url)
            .set("Accept", "application/x-bibtex; charset=utf-8")
            .call()
            .map_err(|e| match e {
                ureq::Error::Status(404, _) => "Diese DOI wurde nicht gefunden.".to_string(),
                e => format!("DOI-Abfrage fehlgeschlagen: {e}"),
            })?
            .into_string()
            .map_err(|e| e.to_string())?
    } else if let Some(isbn) = clean_isbn(query) {
        let url = format!("https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data");
        let json: serde_json::Value = agent()
            .get(&url)
            .call()
            .map_err(|e| format!("ISBN-Abfrage fehlgeschlagen: {e}"))?
            .into_json()
            .map_err(|e| e.to_string())?;
        let book = json.get(format!("ISBN:{isbn}")).ok_or("Zu dieser ISBN wurde nichts gefunden.")?;
        let title = book["title"].as_str().unwrap_or("").to_string();
        let subtitle = book["subtitle"].as_str().map(|s| format!(": {s}")).unwrap_or_default();
        let authors: Vec<String> = book["authors"]
            .as_array()
            .map(|a| a.iter().filter_map(|x| x["name"].as_str().map(String::from)).collect())
            .unwrap_or_default();
        let publisher = book["publishers"].get(0).and_then(|p| p["name"].as_str()).unwrap_or("");
        let year: String = book["publish_date"].as_str().unwrap_or("").chars().filter(|c| c.is_ascii_digit()).collect();
        let year = if year.len() >= 4 { year[year.len() - 4..].to_string() } else { String::new() };
        let mut b = format!(
            "@book{{key,\n  title = {{{}}},\n  author = {{{}}},\n",
            escape_bib(&format!("{title}{subtitle}")),
            escape_bib(&authors.join(" and "))
        );
        if !year.is_empty() {
            b += &format!("  year = {{{year}}},\n");
        }
        if !publisher.is_empty() {
            b += &format!("  publisher = {{{}}},\n", escape_bib(publisher));
        }
        b += &format!("  isbn = {{{isbn}}},\n}}");
        b
    } else {
        return Err("Bitte eine DOI (z. B. 10.1103/PhysRev.47.777) oder ISBN eingeben.".into());
    };

    let mut parsed = parse(&bibtex, "")?;
    if parsed.is_empty() {
        return Err("Die Antwort enthielt keinen Eintrag.".into());
    }
    let first = parsed.remove(0);
    let key = make_key(&first.authors, first.year, &first.title, taken);
    let bibtex = tidy_bibtex(&rekey(bibtex.trim(), &key));
    let entry = parse(&bibtex, "")?.into_iter().next().ok_or("Fehler beim Lesen")?;
    Ok(Lookup { bibtex, entry })
}

/// doi.org returns everything on one line; put each field on its own line.
fn tidy_bibtex(b: &str) -> String {
    if b.lines().count() > 2 {
        return b.to_string();
    }
    let mut out = String::new();
    let mut depth = 0;
    for c in b.chars() {
        match c {
            '{' => {
                depth += 1;
                out.push(c);
            }
            '}' => {
                depth -= 1;
                if depth == 0 {
                    out = out.trim_end().to_string();
                    out.push_str("\n}");
                    continue;
                }
                out.push(c);
            }
            ',' if depth == 1 => {
                out.push_str(",\n ");
            }
            _ => out.push(c),
        }
    }
    out.replace("\n  ", "\n  ").replace(",\n ", ",\n  ").replace("\n   ", "\n  ")
}

pub fn append(root: &Path, file: &str, bibtex: &str) -> Result<(), String> {
    let path = crate::project::resolve(root, file)?;
    let mut text = fs::read_to_string(&path).unwrap_or_default();
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    if !text.is_empty() {
        text.push('\n');
    }
    text.push_str(bibtex.trim());
    text.push('\n');
    // Make sure the result still parses before writing.
    parse(&text, file).map_err(|e| format!("Eintrag ist kein gültiges BibTeX: {e}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, text).map_err(|e| e.to_string())
}

/// Citation styles offered in the UI (all built into Typst).
pub const STYLES: &[(&str, &str)] = &[
    ("ieee", "IEEE – nummeriert [1]"),
    ("apa", "APA – Autor (Jahr)"),
    ("iso-690-numeric", "ISO 690 (DIN) – nummeriert"),
    ("iso-690-author-date", "ISO 690 (DIN) – Autor Jahr"),
    ("chicago-author-date", "Chicago – Autor Jahr"),
    ("chicago-notes", "Chicago – Fußnoten"),
    ("harvard-cite-them-right", "Harvard"),
    ("mla", "MLA"),
    ("american-physics-society", "APS (Physik)"),
    ("springer-basic", "Springer"),
    ("nature", "Nature"),
    ("vancouver", "Vancouver"),
];

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"@article{einstein1935,
  title = {Can Quantum-Mechanical Description of Physical Reality Be Considered Complete?},
  author = {Einstein, Albert and Podolsky, Boris and Rosen, Nathan},
  journal = {Physical Review},
  year = {1935},
  doi = {10.1103/PhysRev.47.777},
}

@book{knuth,
  title = {The Art of Computer Programming},
  author = {Donald E. Knuth},
  publisher = {Addison-Wesley},
  year = {1968},
}
"#;

    #[test]
    fn parses_and_finds_bibliography() {
        let e = parse(SAMPLE, "lit.bib").unwrap();
        assert_eq!(e.len(), 2);
        assert_eq!(e[0].key, "einstein1935");
        assert_eq!(e[0].year, Some(1935));
        assert_eq!(e[0].authors.len(), 3);
        assert!(e[0].authors[0].contains("Einstein"));
        assert_eq!(e[0].container.as_deref(), Some("Physical Review"));

        let calls = find_calls(r#"#bibliography("lit.bib", title: [Quellen], style: "apa")"#);
        assert_eq!(calls, vec![(vec!["lit.bib".to_string()], Some("apa".to_string()))]);
        let calls = find_calls(r#"#bibliography(("a.bib", "b.yml"))"#);
        assert_eq!(calls[0].0, vec!["a.bib", "b.yml"]);

        assert_eq!(make_key(&["Einstein, Albert".into()], Some(1935), "Can Quantum-Mechanical", &[]), "einstein1935can");
        assert_eq!(make_key(&["Erwin Schrödinger".into()], Some(1926), "Die gegenwärtige Situation", &[]), "schroedinger1926gegenwaertige");
        assert_eq!(make_key(&["Knuth".into()], None, "The Art", &["knuthart".into()]), "knutharta");
        assert_eq!(clean_doi("https://doi.org/10.1103/PhysRev.47.777").as_deref(), Some("10.1103/PhysRev.47.777"));
        assert_eq!(clean_isbn("978-3-16-148410-0").as_deref(), Some("9783161484100"));
        assert_eq!(clean_isbn("Hallo"), None);
    }

    #[test]
    fn styles_and_bibliography_compile() {
        let dir = std::env::temp_dir().join("neotypst-bib-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("lit.bib"), SAMPLE).unwrap();
        for (style, _) in STYLES {
            fs::write(
                dir.join("main.typ"),
                format!("Siehe @einstein1935 und @knuth[S. 12].\n#bibliography(\"lit.bib\", style: \"{style}\")\n"),
            )
            .unwrap();
            let mut e = crate::engine::Engine::new();
            e.open(dir.clone(), "main.typ".into()).unwrap();
            let out = e.compile(None, None).unwrap();
            assert!(out.errors().is_empty(), "style {style}: {:?}", out.errors());
        }
        let o = overview(&dir);
        assert_eq!(o.files, vec!["lit.bib"]);
        assert_eq!(o.entries.len(), 2);
        assert_eq!(o.call_file.as_deref(), Some("main.typ"));
        assert_eq!(o.style.as_deref(), Some("vancouver"));

        // Appending keeps the file valid; invalid input is rejected.
        append(&dir, "lit.bib", "@misc{web, title = {Seite}, url = {https://example.org}}").unwrap();
        assert_eq!(overview(&dir).entries.len(), 3);
        assert!(append(&dir, "lit.bib", "@misc{kaputt, title = {").is_err());
    }

    /// Network test: run with `cargo test -- --ignored lookup`.
    #[test]
    #[ignore]
    fn lookup_doi_and_isbn() {
        let l = lookup("10.1103/PhysRev.47.777", &[]).unwrap();
        println!("{}", l.bibtex);
        assert_eq!(l.entry.year, Some(1935));
        assert!(l.entry.key.starts_with("einstein1935"));
        let b = lookup("9780201896831", &[]).unwrap();
        println!("{}", b.bibtex);
        assert!(b.entry.title.to_lowercase().contains("art of computer programming"));
    }
}
