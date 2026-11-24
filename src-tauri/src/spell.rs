//! Spell checking of the prose in a Typst document.
//!
//! 1. Typst's parser tells us which characters are prose (`Text` in markup) –
//!    code, math, raw blocks, labels and links are never checked.
//! 2. Each paragraph gets a language: an explicit `#set text(lang: …)` or
//!    `#text(lang: …)[…]` wins; otherwise (in "auto" mode) it is detected from
//!    common words, so mixed German/English documents work.
//! 3. Bundled Hunspell dictionaries (German "frami" with compounds, US
//!    English) plus the user's word list find the unknown words – on macOS
//!    and Windows alike. On macOS the system dictionary may veto a flag.
//! 4. Suggestions are computed last, under a time budget and cached.

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
    /// Some suggestions are still being computed: check again soon.
    pub pending: bool,
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

// ---------- 3. Hunspell dictionaries ----------

/// Bundled Hunspell dictionaries (de_DE "frami", en_US), the user's own word
/// list and a cache of suggestions. Works the same on macOS and Windows.
mod hunspell {
    use std::collections::{HashMap, HashSet};
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex, OnceLock};

    use spellbook::Dictionary;

    static DICTIONARIES: OnceLock<PathBuf> = OnceLock::new();
    static USER_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);
    static DICTS: Mutex<Option<HashMap<String, Option<Arc<Dictionary>>>>> = Mutex::new(None);
    static USER: Mutex<Option<HashSet<String>>> = Mutex::new(None);
    static SUGGESTIONS: Mutex<Option<HashMap<(String, String), Vec<String>>>> = Mutex::new(None);

    fn dictionaries() -> &'static PathBuf {
        // Tests (and runs without `init`) read the files from the repo.
        DICTIONARIES.get_or_init(|| PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/dictionaries")))
    }

    fn user_file() -> Option<PathBuf> {
        USER_FILE.lock().unwrap().clone()
    }

    pub fn init(dictionaries: PathBuf, user: PathBuf) {
        let _ = DICTIONARIES.set(dictionaries);
        *USER_FILE.lock().unwrap() = Some(user);
        *USER.lock().unwrap() = None; // reload from the new file
    }

    fn file_name(lang: &str) -> Option<&'static str> {
        match lang {
            "de" => Some("de_DE_frami"),
            "en" => Some("en_US"),
            _ => None,
        }
    }

    pub fn has(lang: &str) -> bool {
        file_name(lang).is_some()
    }

    /// The dictionary for "de"/"en", loaded on first use (~60 ms for German).
    pub fn dictionary(lang: &str) -> Option<Arc<Dictionary>> {
        let mut guard = DICTS.lock().unwrap();
        let map = guard.get_or_insert_with(HashMap::new);
        map.entry(lang.to_string())
            .or_insert_with(|| {
                let name = file_name(lang)?;
                let dir = dictionaries();
                let aff = std::fs::read_to_string(dir.join(format!("{name}.aff"))).ok()?;
                let dic = std::fs::read_to_string(dir.join(format!("{name}.dic"))).ok()?;
                match Dictionary::new(&aff, &dic) {
                    Ok(d) => Some(Arc::new(d)),
                    Err(e) => {
                        eprintln!("Wörterbuch {name} nicht lesbar: {e}");
                        None
                    }
                }
            })
            .clone()
    }

    fn with_user<T>(f: impl FnOnce(&mut HashSet<String>) -> T) -> T {
        let mut guard = USER.lock().unwrap();
        let set = guard.get_or_insert_with(|| {
            user_file()
                .and_then(|p| std::fs::read_to_string(p).ok())
                .map(|t| t.lines().map(|w| w.trim().to_lowercase()).filter(|w| !w.is_empty()).collect())
                .unwrap_or_default()
        });
        f(set)
    }

    /// Words the user added with "Zum Wörterbuch" (any language, any case).
    pub fn is_learned(word: &str) -> bool {
        with_user(|set| set.contains(&word.to_lowercase()))
    }

    pub fn learn(word: &str) -> Result<(), String> {
        let word = word.trim();
        if word.is_empty() || word.contains(['\n', '\r']) {
            return Err("Ungültiges Wort".into());
        }
        let added = with_user(|set| set.insert(word.to_lowercase()));
        if !added {
            return Ok(());
        }
        let Some(path) = user_file() else { return Ok(()) };
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        use std::io::Write;
        let mut file =
            std::fs::OpenOptions::new().create(true).append(true).open(&path).map_err(|e| e.to_string())?;
        writeln!(file, "{word}").map_err(|e| e.to_string())
    }

    /// Hunspell's check plus what it can't know: hyphenated compounds whose
    /// parts are fine ("Hash-Funktion"), abbreviations with a final dot and,
    /// for German, nouns the dictionary doesn't allow as compounds.
    pub fn check(dict: &Dictionary, word: &str, dot_follows: bool, compounds: bool) -> bool {
        let word = word.replace('’', "'");
        if dict.check(&word) || (dot_follows && dict.check(&format!("{word}."))) {
            return true;
        }
        if compounds && compound(dict, &word, 1) {
            return true;
        }
        if word.contains('-') {
            let parts: Vec<&str> = word.split('-').filter(|p| !p.is_empty()).collect();
            if !parts.is_empty()
                && parts.iter().all(|p| p.chars().count() < 2 || dict.check(p) || dict.check(&format!("{p}-")))
            {
                return true;
            }
            // "Hash-Funktion" is fine if "Hashfunktion" is.
            let mut joined = String::new();
            for (i, p) in parts.iter().enumerate() {
                if i == 0 {
                    joined.push_str(p);
                } else {
                    let mut chars = p.chars();
                    joined.extend(chars.next().into_iter().flat_map(char::to_lowercase));
                    joined.push_str(chars.as_str());
                }
            }
            return dict.check(&joined);
        }
        false
    }

    fn capitalize(s: &str) -> String {
        let mut chars = s.chars();
        chars.next().map(|c| c.to_uppercase().collect::<String>() + chars.as_str()).unwrap_or_default()
    }

    /// German compound nouns made of known words, with an optional linking
    /// element: "Rekursion|s|abbruch", "Monotonie|kriterium". The frami
    /// dictionary only allows compounds for some words, so many legitimate
    /// ones fail. Parts need at least 4 letters, so typos inside a part are
    /// still caught. `depth` allows that many further splits (3 parts).
    fn compound(dict: &Dictionary, word: &str, depth: u8) -> bool {
        let chars: Vec<char> = word.chars().collect();
        if chars.len() < 8 || !chars[0].is_uppercase() || chars[1..].iter().any(|c| !c.is_lowercase()) {
            return false;
        }
        for split in 4..=chars.len() - 4 {
            let tail = capitalize(&chars[split..].iter().collect::<String>());
            if !(dict.check(&tail) || (depth > 0 && compound(dict, &tail, depth - 1))) {
                continue;
            }
            let head: String = chars[..split].iter().collect();
            for link in ["", "s", "es", "n", "en"] {
                let Some(stem) = head.strip_suffix(link) else { continue };
                if stem.chars().count() >= 4 && (dict.check(stem) || (depth > 0 && compound(dict, stem, depth - 1))) {
                    return true;
                }
            }
        }
        false
    }

    pub fn cached_suggestions(lang: &str, word: &str) -> Option<Vec<String>> {
        let guard = SUGGESTIONS.lock().unwrap();
        guard.as_ref()?.get(&(lang.to_string(), word.to_string())).cloned()
    }

    /// Slow for German (0.1–0.3 s per word), hence the cache.
    pub fn suggest(lang: &str, word: &str) -> Vec<String> {
        if let Some(s) = cached_suggestions(lang, word) {
            return s;
        }
        let mut out = Vec::new();
        if let Some(dict) = dictionary(lang) {
            dict.suggest(&word.replace('’', "'"), &mut out);
        }
        // Drop Hunspell's affix fragments ("-set") and duplicates.
        let mut seen = HashSet::new();
        out.retain(|s| !s.starts_with('-') && !s.ends_with('-') && s != word && seen.insert(s.clone()));
        out.truncate(5);
        let mut guard = SUGGESTIONS.lock().unwrap();
        let map = guard.get_or_insert_with(HashMap::new);
        if map.len() > 5000 {
            map.clear();
        }
        map.insert((lang.to_string(), word.to_string()), out.clone());
        out
    }
}

/// Tells the checker where the bundled dictionaries and the user's word list
/// live, and loads the dictionaries in the background.
pub fn init(dictionaries: std::path::PathBuf, user_words: std::path::PathBuf) {
    hunspell::init(dictionaries, user_words);
    std::thread::spawn(|| {
        hunspell::dictionary("de");
        hunspell::dictionary("en");
        hunspell::is_learned("");
    });
}

pub fn learn(word: &str) -> Result<(), String> {
    hunspell::learn(word)
}

/// Words of a paragraph as `(start, len)` in UTF-16 units. Hyphens and
/// apostrophes inside a word belong to it ("E-Mail", "don't").
fn words(text: &[u16]) -> Vec<(usize, usize)> {
    let chars: Vec<(usize, char)> = {
        let mut pos = 0;
        char::decode_utf16(text.iter().copied())
            .map(|c| {
                let c = c.unwrap_or(char::REPLACEMENT_CHARACTER);
                let p = pos;
                pos += c.len_utf16();
                (p, c)
            })
            .collect()
    };
    let is_word = |c: char| c.is_alphanumeric();
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if !is_word(chars[i].1) {
            i += 1;
            continue;
        }
        let start = i;
        while i < chars.len()
            && (is_word(chars[i].1)
                || (matches!(chars[i].1, '-' | '\'' | '’') && i + 1 < chars.len() && is_word(chars[i + 1].1)))
        {
            i += 1;
        }
        let from = chars[start].0;
        let to = chars.get(i).map(|c| c.0).unwrap_or(text.len());
        out.push((from, to - from));
    }
    out
}

/// Words that are never checked: one or two letters (pt, ii), digits,
/// acronyms (HTML, BE) and identifiers with inner capitals (JavaScript).
fn skip_word(word: &str) -> bool {
    if word.chars().count() < 3 || word.chars().any(|c| c.is_numeric()) {
        return true;
    }
    let letters: Vec<char> = word.chars().filter(|c| c.is_alphabetic()).collect();
    if letters.iter().all(|c| c.is_uppercase()) {
        return true;
    }
    word.split(['-', '\'', '’']).any(|part| part.chars().skip(1).any(|c| c.is_uppercase()))
}

// ---------- 4. macOS system dictionary ----------

/// On macOS the system spell checker is asked as well: a word counts as
/// correct if either knows it, so words learned in other Mac apps keep
/// working. Languages without a bundled dictionary are checked by macOS alone.
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

    /// True if the system dictionary (including the user's learned words)
    /// accepts the word.
    pub fn knows(word: &str, lang: &str) -> bool {
        let text: Vec<u16> = word.encode_utf16().collect();
        let checker = NSSpellChecker::sharedSpellChecker();
        dictionary_for(&checker, lang).is_some() && check(&text, lang, 1).is_empty()
    }
}

// ---------- 5. Pipeline ----------

/// Result of the Hunspell pass, before the macOS pass and suggestions.
pub struct Pending {
    result: SpellResult,
    /// Paragraphs in languages without a bundled dictionary.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    foreign: Vec<(usize, Vec<u16>, String)>,
    allowed: std::collections::HashSet<String>,
}

const MAX_ISSUES: usize = 400;

/// Step 1 (any thread): find unknown words with the bundled dictionaries.
pub fn find(text: &str, mode: &str, allowed: &[String]) -> Pending {
    let allowed: std::collections::HashSet<String> = allowed.iter().map(|w| w.to_lowercase()).collect();
    if mode == "off" {
        return Pending { result: SpellResult { issues: vec![], dominant: None, pending: false }, foreign: vec![], allowed };
    }
    let paras = paragraphs(text);
    let (langs, dominant) = assign_languages(&paras, mode);
    let mut issues = Vec::new();
    let mut foreign = Vec::new();
    'paras: for (p, lang) in paras.iter().zip(&langs) {
        if !hunspell::has(lang) {
            foreign.push((p.from, p.text.clone(), lang.clone()));
            continue;
        }
        let Some(dict) = hunspell::dictionary(lang) else { continue };
        for (start, len) in words(&p.text) {
            let word = String::from_utf16_lossy(&p.text[start..start + len]);
            if skip_word(&word) || allowed.contains(&word.to_lowercase()) || hunspell::is_learned(&word) {
                continue;
            }
            let dot_follows = p.text.get(start + len) == Some(&(b'.' as u16));
            if hunspell::check(&dict, &word, dot_follows, lang == "de") {
                continue;
            }
            if issues.len() >= MAX_ISSUES {
                break 'paras;
            }
            issues.push(Issue { from: p.from + start, to: p.from + start + len, word, lang: lang.clone(), suggestions: vec![] });
        }
    }
    Pending { result: SpellResult { issues, dominant, pending: false }, foreign, allowed }
}

/// Step 2 (macOS main thread): drop words the system dictionary knows and
/// check paragraphs in other languages.
#[cfg(target_os = "macos")]
pub fn system_pass(p: &mut Pending) {
    let mut known: std::collections::HashMap<(String, String), bool> = Default::default();
    p.result.issues.retain(|i| {
        !*known.entry((i.word.clone(), i.lang.clone())).or_insert_with(|| mac::knows(&i.word, &i.lang))
    });
    for (from, text, lang) in std::mem::take(&mut p.foreign) {
        let room = MAX_ISSUES.saturating_sub(p.result.issues.len());
        for (start, len, suggestions) in mac::check(&text, &lang, room) {
            let word = String::from_utf16_lossy(&text[start..start + len]);
            if p.allowed.contains(&word.to_lowercase()) || hunspell::is_learned(&word) {
                continue;
            }
            p.result.issues.push(Issue { from: from + start, to: from + start + len, word, lang: lang.clone(), suggestions });
        }
    }
    p.result.issues.sort_by_key(|i| i.from);
}

#[cfg(not(target_os = "macos"))]
pub fn system_pass(_: &mut Pending) {}

/// Step 3 (any thread): add suggestions. Computing them is slow, so this
/// stops after `budget`; the rest come from the cache on later checks.
/// Sets `pending` if suggestions are still missing.
pub fn suggest(mut p: Pending, budget: std::time::Duration) -> SpellResult {
    let start = std::time::Instant::now();
    for issue in p.result.issues.iter_mut().filter(|i| hunspell::has(&i.lang)) {
        if let Some(s) = hunspell::cached_suggestions(&issue.lang, &issue.word) {
            issue.suggestions = s;
        } else if start.elapsed() < budget {
            issue.suggestions = hunspell::suggest(&issue.lang, &issue.word);
        } else {
            p.result.pending = true;
        }
    }
    p.result
}

/// Full pipeline in one go (the app runs the steps on different threads).
/// `allowed` are project-specific words that are never flagged.
#[cfg(test)]
pub fn check(text: &str, mode: &str, allowed: &[String]) -> SpellResult {
    let mut p = find(text, mode, allowed);
    system_pass(&mut p);
    suggest(p, std::time::Duration::MAX)
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

    fn flagged(doc: &str, mode: &str) -> Vec<String> {
        // Only the bundled dictionaries, so the result is the same on every OS.
        let p = find(doc, mode, &[]);
        p.result.issues.into_iter().map(|i| i.word).collect()
    }

    #[test]
    fn german_compounds_and_school_words_are_accepted() {
        let doc = "Im Landesabitur sollst du die Hashfunktion erläutern und die Methode implementieren. \
                   Der Erwartungshorizont nennt Sortieralgorithmus, Binärbaum, Datenbankabfrage und \
                   Hash-Funktion, z.B. per E-Mail usw. Die Schülerinnen und Schüler berechnen HTML und JavaScript (5 BE). \
                   Rekursionsabbruch, Monotoniekriterium, Rückgabedatentyp, Grauflächen, Formatvorgaben und \
                   Hashtabellenimplementierung sind zusammengesetzt.";
        assert_eq!(flagged(doc, "de"), Vec::<String>::new());
    }

    #[test]
    fn typos_are_flagged_with_suggestions() {
        let doc = "Das ist ein Tset mit Fehlern und einer Beschleuniung.\n\nThis sentense has a typo.\n\n$sqrt(x)$ und #table() werden ignoriert.";
        let r = check(doc, "auto", &[]);
        let words: Vec<&str> = r.issues.iter().map(|i| i.word.as_str()).collect();
        assert!(words.contains(&"Tset"), "{words:?}");
        assert!(words.contains(&"Beschleuniung"), "{words:?}");
        assert!(words.contains(&"sentense"), "{words:?}");
        assert!(!words.iter().any(|w| ["Das", "This", "sqrt", "table", "Fehlern"].contains(w)), "{words:?}");
        let typo = r.issues.iter().find(|i| i.word == "sentense").unwrap();
        assert_eq!(typo.lang, "en");
        assert!(typo.suggestions.iter().any(|s| s == "sentence"), "{:?}", typo.suggestions);
        let de = r.issues.iter().find(|i| i.word == "Beschleuniung").unwrap();
        assert_eq!(de.lang, "de");
        assert_eq!(de.suggestions.first().map(String::as_str), Some("Beschleunigung"));
        // Offsets point at the word in the document.
        let u: Vec<u16> = doc.encode_utf16().collect();
        assert_eq!(String::from_utf16_lossy(&u[de.from..de.to]), "Beschleuniung");
        assert!(!r.pending);
        // Forcing German marks the English paragraph.
        let forced = check(doc, "de", &[]);
        assert!(forced.issues.len() > r.issues.len());
        // Project words are respected.
        let allowed = check(doc, "auto", &["tset".into()]);
        assert!(!allowed.issues.iter().any(|i| i.word == "Tset"));
        assert!(check(doc, "off", &[]).issues.is_empty());
    }

    #[test]
    fn compounds_do_not_hide_typos() {
        let doc = "Methoode, Implementirung, Datenbankabfrge, Rekursionsabbruhc, Speicherpltz und Algoritmus.";
        assert_eq!(
            flagged(doc, "de"),
            ["Methoode", "Implementirung", "Datenbankabfrge", "Rekursionsabbruhc", "Speicherpltz", "Algoritmus"]
        );
        // English has no such splitting.
        assert_eq!(flagged("The Hashtablelookup works.", "en"), ["Hashtablelookup"]);
    }

    #[test]
    fn suggestions_respect_the_budget() {
        let p = find("Ein Fehlerrrx und noch ein Fehlerrry.", "de", &[]);
        assert_eq!(p.result.issues.len(), 2);
        let r = suggest(p, std::time::Duration::ZERO);
        assert!(r.pending);
        assert!(r.issues.iter().all(|i| i.suggestions.is_empty()));
    }

    #[test]
    fn splits_words_like_hunspell() {
        let text: Vec<u16> = "Das E-Mail-Postfach, don't – ‚Zitat‘ x2 Größe".encode_utf16().collect();
        let got: Vec<String> =
            words(&text).into_iter().map(|(s, l)| String::from_utf16_lossy(&text[s..s + l])).collect();
        assert_eq!(got, ["Das", "E-Mail-Postfach", "don't", "Zitat", "x2", "Größe"]);
        assert!(skip_word("x2") && skip_word("BE") && skip_word("JavaScript") && skip_word("pt"));
        assert!(!skip_word("Größe") && !skip_word("E-Mail") && !skip_word("don't"));
    }

    #[test]
    fn learned_words_are_saved() {
        let dir = std::env::temp_dir().join(format!("neotypst-spell-{}", std::process::id()));
        let file = dir.join("woerterbuch.txt");
        init(std::path::PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/dictionaries")), file.clone());
        assert!(flagged("Das Wort Quuxblarg ist neu.", "de").contains(&"Quuxblarg".to_string()));
        learn("Quuxblarg").unwrap();
        learn("Quuxblarg").unwrap();
        assert!(flagged("Das Wort Quuxblarg ist neu. QUUXBLARG quuxblarg", "de").is_empty());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "Quuxblarg\n");
        assert!(learn("zwei\nZeilen").is_err());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_ten_page_document_is_checked_quickly() {
        let para = "Im Landesabitur sollst du die Hashfunktion erläutern und die Methode implementieren. \
                    Beschreibe, wie der Sortieralgorithmus die Datenbankabfrage beschleunigt, und begründe deine Antwort.\n\n\
                    The algorithm uses a hash table to store the values in constant time.\n\n";
        let doc = para.repeat(150); // ~ 5000 words
        find(&doc, "auto", &[]); // load dictionaries
        let t = std::time::Instant::now();
        let p = find(&doc, "auto", &[]);
        let elapsed = t.elapsed();
        assert!(p.result.issues.is_empty(), "{:?}", p.result.issues.first());
        eprintln!("10 Seiten: {elapsed:?}");
        assert!(elapsed < std::time::Duration::from_millis(500), "{elapsed:?}");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn mac_system_dictionary_only_removes_flags() {
        let doc = "Das ist ein Tset mit Fehlern.\n\nThis sentense has a typo.";
        let mut p = find(doc, "auto", &[]);
        let before = p.result.issues.len();
        system_pass(&mut p);
        let words: Vec<&str> = p.result.issues.iter().map(|i| i.word.as_str()).collect();
        assert!(words.len() <= before);
        assert!(words.contains(&"Tset") && words.contains(&"sentense"), "{words:?}");
    }
}
