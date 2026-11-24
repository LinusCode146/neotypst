//! Spell checking of the prose in a Typst document.
//!
//! 1. Typst's parser tells us which characters are prose (`Text` in markup) –
//!    code, math, raw blocks, labels and links are never checked.
//! 2. Each paragraph gets a language: an explicit `#set text(lang: …)` or
//!    `#text(lang: …)[…]` wins; otherwise (in "auto" mode) it is detected from
//!    common words, so mixed German/English documents work.
//! 3. The macOS spell checker (system dictionaries + the user's dictionary)
//!    finds the misspelled words.

use serde::Serialize;
use typst::syntax::ast;
use typst::syntax::{LinkedNode, Source, SyntaxKind};

/// A paragraph of prose with everything that isn't prose blanked out, so
/// offsets inside `text` map 1:1 to document offsets (UTF-16).
#[derive(Debug)]
pub struct Para {
    pub from: usize,
    pub text: Vec<u16>,
    /// Language set explicitly in the document (`de`, `en`, …).
    pub explicit: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct Issue {
    pub from: usize,
    pub to: usize,
    pub word: String,
    pub lang: String,
    pub suggestions: Vec<String>,
}

#[derive(Serialize, Debug)]
pub struct SpellResult {
    pub issues: Vec<Issue>,
    /// The language used for most of the text (for the status bar).
    pub dominant: Option<String>,
}

// ---------- 1. Prose extraction ----------

struct Run {
    from: usize,
    to: usize,
    para: usize,
    lang: Option<String>,
}

fn lang_of_args(args: ast::Args) -> Option<String> {
    for arg in args.items() {
        if let ast::Arg::Named(n) = arg {
            if n.name().as_str() == "lang" {
                if let ast::Expr::Str(s) = n.expr() {
                    return Some(s.get().to_lowercase().to_string());
                }
            }
        }
    }
    None
}

fn is_text_callee(expr: ast::Expr) -> bool {
    matches!(expr, ast::Expr::Ident(id) if id.as_str() == "text")
}

pub fn paragraphs(text: &str) -> Vec<Para> {
    let source = Source::detached(text);
    let units: Vec<u16> = text.encode_utf16().collect();
    let mut runs: Vec<Run> = Vec::new();
    let mut pos = 0usize;
    let mut para = 0usize;

    fn walk(node: &LinkedNode, lang: Option<String>, pos: &mut usize, para: &mut usize, runs: &mut Vec<Run>) {
        let kind = node.kind();
        if matches!(
            kind,
            SyntaxKind::Raw
                | SyntaxKind::Equation
                | SyntaxKind::Link
                | SyntaxKind::Label
                | SyntaxKind::Ref
                | SyntaxKind::Str
                | SyntaxKind::LineComment
                | SyntaxKind::BlockComment
        ) {
            *pos += node.get().full_text().encode_utf16().count();
            return;
        }
        if matches!(
            kind,
            SyntaxKind::Heading | SyntaxKind::ListItem | SyntaxKind::EnumItem | SyntaxKind::TermItem | SyntaxKind::ContentBlock
        ) {
            *para += 1;
        }
        if node.get().children().len() == 0 {
            let len = node.get().leaf_text().encode_utf16().count();
            match kind {
                SyntaxKind::Text => runs.push(Run { from: *pos, to: *pos + len, para: *para, lang: lang.clone() }),
                SyntaxKind::Parbreak => *para += 1,
                _ => {}
            }
            *pos += len;
        } else {
            // `#text(lang: "en")[…]` applies to its body.
            let mut inner = lang.clone();
            if let Some(fc) = node.cast::<ast::FuncCall>() {
                if is_text_callee(fc.callee()) {
                    if let Some(l) = lang_of_args(fc.args()) {
                        inner = Some(l);
                    }
                }
            }
            // `#set text(lang: "en")` applies to the following siblings.
            let mut current = inner;
            for child in node.children() {
                walk(&child, current.clone(), pos, para, runs);
                if let Some(set) = child.cast::<ast::SetRule>() {
                    if is_text_callee(set.target()) {
                        if let Some(l) = lang_of_args(set.args()) {
                            current = Some(l);
                            *para += 1;
                        }
                    }
                }
            }
        }
        if kind == SyntaxKind::ContentBlock || kind == SyntaxKind::Heading {
            *para += 1;
        }
    }
    walk(&LinkedNode::new(source.root()), None, &mut pos, &mut para, &mut runs);

    // Group runs into paragraphs (same index and same language).
    let mut out: Vec<Para> = Vec::new();
    let mut i = 0;
    while i < runs.len() {
        let mut j = i;
        while j + 1 < runs.len() && runs[j + 1].para == runs[i].para && runs[j + 1].lang == runs[i].lang {
            j += 1;
        }
        let from = runs[i].from;
        let to = runs[j].to.min(units.len());
        let mut buf = vec![b' ' as u16; to - from];
        for r in &runs[i..=j] {
            buf[r.from - from..r.to.min(units.len()) - from].copy_from_slice(&units[r.from..r.to.min(units.len())]);
        }
        out.push(Para { from, text: buf, explicit: runs[i].lang.clone() });
        i = j + 1;
    }
    out
}

// ---------- 2. Language detection ----------

const DE_WORDS: &[&str] = &[
    "der", "die", "das", "und", "ist", "nicht", "mit", "ein", "eine", "einen", "dem", "den", "des", "von", "zu", "für",
    "auf", "im", "sich", "auch", "es", "wird", "werden", "sind", "wir", "sie", "ich", "du", "oder", "aber", "wenn",
    "dass", "bei", "nach", "aus", "wie", "noch", "nur", "man", "kann", "hat", "zum", "zur", "über", "durch", "diese",
    "dieser", "dieses", "berechne", "bestimme", "gilt", "also", "mit", "einer", "eines", "wurde", "soll", "beim",
];
const EN_WORDS: &[&str] = &[
    // Keine Wörter, die es auch im Deutschen gibt (in, an, so, was, will).
    "the", "and", "is", "not", "with", "a", "of", "to", "for", "on", "it", "that", "this", "are", "be",
    "we", "you", "they", "or", "but", "if", "by", "from", "as", "at", "which", "can", "has", "have",
    "these", "those", "there", "their", "its", "into", "than", "then", "such", "each", "calculate", "determine",
    "let", "show", "where", "when", "what", "how", "all", "any", "our", "your", "use", "used", "using",
];

/// "de", "en" or None if the text gives no clear signal.
pub fn detect(text: &str) -> Option<&'static str> {
    let mut de = 0i32;
    let mut en = 0i32;
    for word in text.split(|c: char| !c.is_alphabetic()).filter(|w| !w.is_empty()) {
        // Abkürzungen wie „BE“ oder „ASCII“ sagen nichts über die Sprache.
        if word.chars().count() > 1 && word.chars().all(|c| c.is_uppercase()) {
            continue;
        }
        let w = word.to_lowercase();
        if DE_WORDS.contains(&w.as_str()) {
            de += 2;
        }
        if EN_WORDS.contains(&w.as_str()) {
            en += 2;
        }
        if w.contains(['ä', 'ö', 'ü', 'ß']) {
            de += 1;
        }
    }
    // Ein einzelner Umlaut reicht nicht; solche kurzen Zeilen (Überschriften,
    // Aufgabentitel) nehmen die Sprache ihrer Umgebung.
    if de.max(en) < 2 {
        None
    } else if de >= en {
        Some("de")
    } else {
        Some("en")
    }
}

fn base_lang(l: &str) -> &str {
    l.split(['_', '-']).next().unwrap_or(l)
}

/// Decides the language for every paragraph.
pub fn assign_languages(paras: &[Para], mode: &str) -> (Vec<String>, Option<String>) {
    let texts: Vec<String> = paras.iter().map(|p| String::from_utf16_lossy(&p.text)).collect();
    if mode == "de" || mode == "en" {
        return (vec![mode.to_string(); paras.len()], Some(mode.to_string()));
    }
    // Document-wide fallback for short paragraphs (headings, captions …).
    let whole = texts.join(" ");
    let doc = detect(&whole).unwrap_or("de");
    let detected: Vec<Option<String>> = paras
        .iter()
        .zip(&texts)
        .map(|(p, t)| match &p.explicit {
            Some(l) => Some(base_lang(l).to_string()),
            None => detect(t).map(String::from),
        })
        .collect();
    // Short paragraphs (headings, captions) take the language of the next
    // paragraph with a clear signal, else the previous one, else the document's.
    let langs: Vec<String> = (0..detected.len())
        .map(|i| {
            detected[i]
                .clone()
                .or_else(|| detected[i + 1..].iter().flatten().next().cloned())
                .or_else(|| detected[..i].iter().rev().flatten().next().cloned())
                .unwrap_or_else(|| doc.to_string())
        })
        .collect();
    // Dominant language by amount of text.
    let mut de = 0usize;
    let mut en = 0usize;
    for (l, t) in langs.iter().zip(&texts) {
        match l.as_str() {
            "de" => de += t.len(),
            "en" => en += t.len(),
            _ => {}
        }
    }
    let dominant = if de == 0 && en == 0 { None } else if de >= en { Some("de".into()) } else { Some("en".into()) };
    (langs, dominant)
}

// ---------- 3. macOS spell checker ----------

#[cfg(target_os = "macos")]
mod mac {
    use objc2_app_kit::NSSpellChecker;
    use objc2_foundation::{NSRange, NSString};

    /// Maps "de"/"en" to a dictionary the system actually has.
    fn dictionary_for(checker: &NSSpellChecker, lang: &str) -> Option<String> {
        let available: Vec<String> = checker.availableLanguages().iter().map(|s| s.to_string()).collect();
        let preferred: &[&str] = match lang {
            "de" => &["de_DE", "de"],
            "en" => &["en_US", "en", "en_GB"],
            other => return available.iter().find(|a| a.starts_with(other)).cloned(),
        };
        preferred
            .iter()
            .find(|p| available.iter().any(|a| a == *p))
            .map(|p| p.to_string())
            .or_else(|| available.iter().find(|a| a.starts_with(lang)).cloned())
    }

    /// Returns misspelled `(start, len)` ranges (UTF-16) with suggestions.
    pub fn check(text: &[u16], lang: &str, max: usize) -> Vec<(usize, usize, Vec<String>)> {
        let checker = NSSpellChecker::sharedSpellChecker();
        let Some(dict) = dictionary_for(&checker, lang) else { return vec![] };
        let dict = NSString::from_str(&dict);
        let string = NSString::from_str(&String::from_utf16_lossy(text));
        let len = string.length();
        let mut out = Vec::new();
        let mut start = 0usize;
        while start < len && out.len() < max {
            let range = unsafe {
                checker.checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(
                    &string,
                    start as isize,
                    Some(&dict),
                    false,
                    0,
                    std::ptr::null_mut(),
                )
            };
            let (loc, rlen) = (range.location as usize, range.length as usize);
            if loc == usize::MAX || loc >= len || rlen == 0 || loc < start {
                break;
            }
            let guesses = checker
                .guessesForWordRange_inString_language_inSpellDocumentWithTag(
                    NSRange::new(loc, rlen),
                    &string,
                    Some(&dict),
                    0,
                )
                .map(|a| a.iter().take(5).map(|s| s.to_string()).collect())
                .unwrap_or_default();
            out.push((loc, rlen, guesses));
            start = loc + rlen;
        }
        out
    }

    pub fn learn(word: &str) {
        NSSpellChecker::sharedSpellChecker().learnWord(&NSString::from_str(word));
    }
}

#[cfg(not(target_os = "macos"))]
mod mac {
    pub fn check(_: &[u16], _: &str, _: usize) -> Vec<(usize, usize, Vec<String>)> {
        vec![]
    }
    pub fn learn(_: &str) {}
}

pub fn learn(word: &str) {
    mac::learn(word);
}

/// Full pipeline. `allowed` are project-specific words that are never flagged.
pub fn check(text: &str, mode: &str, allowed: &[String]) -> SpellResult {
    if mode == "off" {
        return SpellResult { issues: vec![], dominant: None };
    }
    let paras = paragraphs(text);
    let (langs, dominant) = assign_languages(&paras, mode);
    let allowed: std::collections::HashSet<String> = allowed.iter().map(|w| w.to_lowercase()).collect();
    let mut issues = Vec::new();
    for (p, lang) in paras.iter().zip(&langs) {
        if issues.len() >= 400 {
            break;
        }
        for (start, len, suggestions) in mac::check(&p.text, lang, 400 - issues.len()) {
            let word = String::from_utf16_lossy(&p.text[start..start + len]);
            if allowed.contains(&word.to_lowercase()) {
                continue;
            }
            issues.push(Issue { from: p.from + start, to: p.from + start + len, word, lang: lang.clone(), suggestions });
        }
    }
    SpellResult { issues, dominant }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_only_prose_with_languages() {
        let doc = "= Einleitung\n\nDas ist ein Test mit $alpha + beta$ und `code` sowie #emph[Betonung].\n\n#set text(lang: \"en\")\nThis paragraph is English. #text(lang: \"fr\")[Bonjour]\n";
        let paras = paragraphs(doc);
        let texts: Vec<String> = paras.iter().map(|p| String::from_utf16_lossy(&p.text)).collect();
        let all = texts.join("|");
        assert!(all.contains("Einleitung"));
        assert!(all.contains("Das ist ein Test mit"));
        assert!(!all.contains("alpha"), "math must be excluded: {all}");
        assert!(!all.contains("code"), "raw must be excluded");
        assert!(!all.contains("emph"), "code must be excluded");
        assert!(all.contains("Betonung"), "content blocks are prose");
        let en = paras.iter().find(|p| String::from_utf16_lossy(&p.text).contains("English")).unwrap();
        assert_eq!(en.explicit.as_deref(), Some("en"));
        let fr = paras.iter().find(|p| String::from_utf16_lossy(&p.text).contains("Bonjour")).unwrap();
        assert_eq!(fr.explicit.as_deref(), Some("fr"));
        // Offsets map back to the document.
        let p = &paras[1];
        let u: Vec<u16> = doc.encode_utf16().collect();
        assert_eq!(&u[p.from..p.from + 3], &"Das".encode_utf16().collect::<Vec<_>>()[..]);
    }

    #[test]
    fn detects_language_per_paragraph() {
        assert_eq!(detect("Berechne die Beschleunigung des Autos und gib das Ergebnis an."), Some("de"));
        assert_eq!(detect("Calculate the acceleration of the car and state the result."), Some("en"));
        assert_eq!(detect("Einleitung"), None);
        // „(5 BE)“ ist kein englisches „be“, „in“ und „was“ sind auch deutsch.
        assert_eq!(detect("Methode erläutern (5 BE)"), None);
        assert_eq!(detect("Was steht in der Liste?"), Some("de"));
        let aufgabe = "#aufgabe(nr: \"2.2\")[Methode `trageEin(…)` erläutern (5 BE)]\n\nDie Methode trägt ein Kennzeichen in die Tabelle ein.";
        let (langs, _) = assign_languages(&paragraphs(aufgabe), "auto");
        assert!(langs.iter().all(|l| l == "de"), "{langs:?}");
        let doc = "= Zusammenfassung\n\nDas ist ein deutscher Absatz mit einem Wort.\n\n= Summary\n\nThis is an English paragraph with the same idea.";
        let paras = paragraphs(doc);
        let (langs, dominant) = assign_languages(&paras, "auto");
        assert_eq!(langs, vec!["de", "de", "en", "en"]);
        assert_eq!(dominant.as_deref(), Some("de"));
        let (forced, _) = assign_languages(&paras, "en");
        assert!(forced.iter().all(|l| l == "en"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn mac_spell_checker_finds_typos() {
        let doc = "Das ist ein Tset mit Fehlern.\n\nThis sentense has a typo.\n\n$sqrt(x)$ und #table() werden ignoriert.";
        let r = check(doc, "auto", &[]);
        let words: Vec<&str> = r.issues.iter().map(|i| i.word.as_str()).collect();
        assert!(words.contains(&"Tset"), "{words:?}");
        assert!(words.contains(&"sentense"), "{words:?}");
        assert!(!words.iter().any(|w| ["Das", "This", "sqrt", "table", "Fehlern"].contains(w)), "{words:?}");
        let typo = r.issues.iter().find(|i| i.word == "sentense").unwrap();
        assert_eq!(typo.lang, "en");
        assert!(typo.suggestions.iter().any(|s| s == "sentence"), "{:?}", typo.suggestions);
        // Forcing German marks the English paragraph.
        let forced = check(doc, "de", &[]);
        assert!(forced.issues.len() > r.issues.len());
        // Project words are respected.
        let allowed = check(doc, "auto", &["tset".into()]);
        assert!(!allowed.issues.iter().any(|i| i.word == "Tset"));
    }
}
