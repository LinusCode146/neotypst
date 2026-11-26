//! Projects are plain folders: `main.typ`, `assets/`, `templates/`, `out/`.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::templates;

pub fn projects_dir() -> Result<PathBuf, String> {
    let base = dirs::document_dir().ok_or("Dokumente-Ordner nicht gefunden")?;
    let dir = base.join("Typst");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[derive(Serialize)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    modified: u64,
    files: usize,
}

pub fn list_projects() -> Result<Vec<ProjectInfo>, String> {
    let dir = projects_dir()?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if !path.is_dir() || is_hidden(&path) || entry.file_name() == templates::USER_DIR {
            continue;
        }
        let files = walk_files(&path);
        if !files.iter().any(|f| f.ends_with(".typ")) {
            continue;
        }
        let modified = files
            .iter()
            .filter_map(|f| fs::metadata(path.join(f)).ok()?.modified().ok())
            .max()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        out.push(ProjectInfo {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            modified,
            files: files.len(),
        });
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

pub fn create_project(name: &str, template: &str, fields: &[(String, String)]) -> Result<String, String> {
    let clean: String = name
        .trim()
        .chars()
        .map(|c| if matches!(c, '/' | ':' | '\\') { '-' } else { c })
        .collect();
    if clean.is_empty() || clean.starts_with('.') || clean == templates::USER_DIR {
        return Err("Ungültiger Projektname".into());
    }
    let dir = projects_dir()?.join(&clean);
    if dir.exists() {
        return Err(format!("Ein Projekt namens „{clean}“ existiert bereits"));
    }
    fs::create_dir_all(dir.join("assets")).map_err(|e| e.to_string())?;
    if let Err(e) = templates::materialize(template, &dir, fields) {
        let _ = fs::remove_dir_all(&dir);
        return Err(e);
    }
    // Das Stilprofil ist kein Platzhalter der Vorlage: es wird nachträglich in
    // den Aufruf in main.typ geschrieben, damit auch ältere Vorlagen es können.
    if let Some((_, profil)) = fields.iter().find(|(k, _)| k == "profil") {
        let main = dir.join("main.typ");
        if let Ok(text) = fs::read_to_string(&main) {
            let neu = profil_setzen(&text, profil);
            if neu != text {
                fs::write(&main, neu).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(dir.to_string_lossy().into_owned())
}

/// Trägt `profil: "…"` in den ersten `#show: ….with(`-Aufruf ein, bei
/// `#show: stil` wird daraus `stil.with(profil: …)`. „klassisch“ ist der
/// Standard und ändert nichts, ebenso ein schon gesetztes Profil.
pub fn profil_setzen(text: &str, profil: &str) -> String {
    if !matches!(profil, "akademisch" | "schlicht") || text.contains("profil:") {
        return text.to_string();
    }
    let mut out = String::with_capacity(text.len() + 32);
    let mut erledigt = false;
    for line in text.split_inclusive('\n') {
        let t = line.trim_end();
        if !erledigt && t.starts_with("#show:") && t.ends_with(".with(") {
            out.push_str(line);
            out.push_str(&format!("  profil: \"{profil}\",\n"));
            erledigt = true;
        } else if !erledigt && t == "#show: stil" {
            out.push_str(&format!("#show: stil.with(profil: \"{profil}\")"));
            out.push_str(&line[t.len()..]);
            erledigt = true;
        } else {
            out.push_str(line);
        }
    }
    out
}

#[derive(Serialize)]
pub struct FileEntry {
    path: String,
    kind: &'static str,
}

pub fn file_kind(rel: &str) -> &'static str {
    let ext = Path::new(rel).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "typ" => "typ",
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" => "image",
        "pdf" => "pdf",
        "bib" | "yml" | "yaml" | "csv" | "json" | "toml" | "txt" | "md" | "xml" => "text",
        _ => "other",
    }
}

/// Files and folders (also empty ones) for the file tree. Folders have kind `dir`.
pub fn list_files(root: &Path) -> Vec<FileEntry> {
    let mut out: Vec<FileEntry> = walk_files(root).into_iter().map(|path| FileEntry { kind: file_kind(&path), path }).collect();
    out.extend(walk_dirs(root).into_iter().map(|path| FileEntry { path, kind: "dir" }));
    out
}

/// All non-hidden folders below `root`.
pub fn walk_dirs(root: &Path) -> Vec<String> {
    fn rec(root: &Path, dir: &Path, out: &mut Vec<String>, depth: usize) {
        if depth > 8 || out.len() > 2000 {
            return;
        }
        let Ok(entries) = fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if is_hidden(&path) || !path.is_dir() {
                continue;
            }
            if let Ok(rel) = path.strip_prefix(root) {
                let rel: Vec<String> = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
                out.push(rel.join("/"));
            }
            rec(root, &path, out, depth + 1);
        }
    }
    let mut out = Vec::new();
    rec(root, root, &mut out, 0);
    out.sort();
    out
}

/// All non-hidden files below `root`, as sorted, `/`-separated relative paths.
pub fn walk_files(root: &Path) -> Vec<String> {
    fn rec(root: &Path, dir: &Path, out: &mut Vec<String>, depth: usize) {
        if depth > 8 || out.len() > 5000 {
            return;
        }
        let Ok(entries) = fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if is_hidden(&path) {
                continue;
            }
            if path.is_dir() {
                rec(root, &path, out, depth + 1);
            } else if let Ok(rel) = path.strip_prefix(root) {
                let rel: Vec<String> =
                    rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
                out.push(rel.join("/"));
            }
        }
    }
    let mut out = Vec::new();
    rec(root, root, &mut out, 0);
    out.sort_by_key(|p| (p.matches('/').count() > 0, p.to_lowercase()));
    out
}

fn is_hidden(path: &Path) -> bool {
    path.file_name().map(|n| n.to_string_lossy().starts_with('.')).unwrap_or(false)
}

/// Resolve a project-relative path, refusing anything that escapes the root.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute()
        || rel_path.components().any(|c| matches!(c, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("Pfad liegt außerhalb des Projekts".into());
    }
    Ok(root.join(rel_path))
}

pub fn read_text(root: &Path, rel: &str) -> Result<String, String> {
    fs::read_to_string(resolve(root, rel)?).map_err(|e| e.to_string())
}

/// Schreibt sicher: erst in eine Nachbardatei, dann umbenennen. Die Datei ist
/// damit immer ganz alt oder ganz neu, auch bei Absturz oder voller Platte.
pub fn write_text(root: &Path, rel: &str, text: &str) -> Result<(), String> {
    let path = resolve(root, rel)?;
    let parent = path.parent().ok_or("Ungültiger Pfad")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let name = path.file_name().ok_or("Ungültiger Pfad")?.to_string_lossy();
    let tmp = parent.join(format!(".{name}.neotypst-tmp"));
    let result = (|| {
        use std::io::Write;
        let mut f = fs::File::create(&tmp)?;
        f.write_all(text.as_bytes())?;
        f.sync_all()?;
        fs::rename(&tmp, &path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result.map_err(|e| e.to_string())
}

/// Prüfsumme eines Inhalts, um fremde Änderungen zu erkennen.
pub fn hash_text(text: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut h);
    format!("{:016x}", h.finish())
}

#[derive(Serialize)]
pub struct Opened {
    pub text: String,
    pub hash: String,
}

/// Liest eine Datei für den Editor, mit Prüfsumme für das spätere Speichern.
pub fn open_text(root: &Path, rel: &str) -> Result<Opened, String> {
    let text = read_text(root, rel)?;
    Ok(Opened { hash: hash_text(&text), text })
}

/// Prüfsumme der Datei auf der Platte, `None` wenn es sie nicht (mehr) gibt.
pub fn file_hash(root: &Path, rel: &str) -> Result<Option<String>, String> {
    Ok(fs::read_to_string(resolve(root, rel)?).ok().map(|t| hash_text(&t)))
}

pub const KONFLIKT: &str = "konflikt";

/// Speichert aus dem Editor und führt den Verlauf.
///
/// `expected` ist die Prüfsumme des Stands, den der Editor zuletzt gelesen
/// oder geschrieben hat. Steht auf der Platte etwas anderes, wurde die Datei
/// von außen geändert: dann wird nichts geschrieben und der Fehler beginnt mit
/// [`KONFLIKT`]. Ohne `expected` wird überschrieben, der alte Inhalt kommt
/// vorher in den Verlauf. Gibt die Prüfsumme des neuen Inhalts zurück.
pub fn save_text(root: &Path, rel: &str, text: &str, expected: Option<&str>, zeit: u64) -> Result<String, String> {
    use crate::history;
    let alt = fs::read_to_string(resolve(root, rel)?).ok();
    // Versteckte Dateien (Wörterliste …) brauchen keinen Verlauf.
    let verlauf = !rel.split('/').any(|t| t.starts_with('.'));
    if let Some(alt) = &alt {
        if let Some(exp) = expected
            && hash_text(alt) != exp
        {
            return Err(format!("{KONFLIKT}: Die Datei wurde außerhalb von NeoTypst geändert"));
        }
        if verlauf && alt != text {
            if expected.is_none() {
                let _ = history::sichern(root, rel, alt, "vor-ueberschreiben", zeit);
            } else if history::entfernt(alt, text) >= history::LOESCHSCHWELLE {
                let _ = history::sichern(root, rel, alt, "loeschung", zeit);
            }
        }
    }
    write_text(root, rel, text)?;
    if verlauf {
        let _ = history::sichern(root, rel, text, "auto", zeit);
    }
    Ok(hash_text(text))
}

pub fn create_file(root: &Path, rel: &str) -> Result<(), String> {
    let path = resolve(root, rel)?;
    if path.exists() {
        return Err("Datei existiert bereits".into());
    }
    write_text(root, rel, "")
}

pub fn rename(root: &Path, from: &str, to: &str) -> Result<(), String> {
    let (a, b) = (resolve(root, from)?, resolve(root, to)?);
    if b.exists() {
        return Err("Ziel existiert bereits".into());
    }
    if let Some(parent) = b.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(a, b).map_err(|e| e.to_string())
}

pub fn create_dir(root: &Path, rel: &str) -> Result<(), String> {
    let path = resolve(root, rel)?;
    if path.exists() {
        return Err("Ordner existiert bereits".into());
    }
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

/// Copies a file or folder next to itself (`name kopie.ext`, `name kopie 2.ext`, …).
/// Returns the new relative path.
pub fn duplicate(root: &Path, rel: &str) -> Result<String, String> {
    let src = resolve(root, rel)?;
    let (dir, name) = match rel.rsplit_once('/') {
        Some((d, n)) => (format!("{d}/"), n.to_string()),
        None => (String::new(), rel.to_string()),
    };
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() && src.is_file() => (s.to_string(), format!(".{e}")),
        _ => (name.clone(), String::new()),
    };
    let mut n = 1;
    let target = loop {
        let candidate = if n == 1 { format!("{dir}{stem} kopie{ext}") } else { format!("{dir}{stem} kopie {n}{ext}") };
        if !resolve(root, &candidate)?.exists() {
            break candidate;
        }
        n += 1;
    };
    copy_recursive(&src, &resolve(root, &target)?)?;
    Ok(target)
}

fn copy_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if src.is_dir() {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
            copy_recursive(&entry.path(), &dst.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(src, dst).map(|_| ()).map_err(|e| e.to_string())
    }
}

/// Moves a file or folder to the Trash (macOS) or Recycle Bin (Windows).
/// Returns where it ended up, so it can be restored; empty if the system does
/// not tell (Windows), then there is no undo.
pub fn trash(root: &Path, rel: &str) -> Result<String, String> {
    if rel.trim_matches('/').is_empty() {
        return Err("Das Projekt selbst kann hier nicht gelöscht werden".into());
    }
    let path = resolve(root, rel)?;
    if !path.exists() {
        return Err("Datei existiert nicht".into());
    }
    trash_path(&path)
}

#[cfg(target_os = "macos")]
fn trash_path(path: &Path) -> Result<String, String> {
    use objc2_foundation::{NSFileManager, NSString, NSURL};
    let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
    let mut out = None;
    NSFileManager::defaultManager()
        .trashItemAtURL_resultingItemURL_error(&url, Some(&mut out))
        .map_err(|e| e.localizedDescription().to_string())?;
    Ok(out.and_then(|u| u.path()).map(|p| p.to_string()).unwrap_or_default())
}

#[cfg(not(target_os = "macos"))]
fn trash_path(path: &Path) -> Result<String, String> {
    trash::delete(path).map_err(|e| e.to_string())?;
    Ok(String::new())
}

/// Moves an item back from the Trash to its old place in the project.
pub fn restore(root: &Path, trashed: &str, rel: &str) -> Result<(), String> {
    let target = resolve(root, rel)?;
    if target.exists() {
        return Err("Am alten Ort liegt inzwischen eine andere Datei".into());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(trashed, target).map_err(|e| e.to_string())
}

/// Copies external files (e.g. dropped images) into `<project>/<subdir>/`.
/// Returns the new project-relative paths.
pub fn import_files(root: &Path, paths: &[String], subdir: &str) -> Result<Vec<String>, String> {
    let target_dir = resolve(root, subdir)?;
    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for p in paths {
        let src = PathBuf::from(p);
        // Already inside the project? Just reference it.
        if let Ok(rel) = src.strip_prefix(root) {
            out.push(rel.to_string_lossy().replace('\\', "/"));
            continue;
        }
        let name = src.file_name().ok_or("Ungültige Datei")?.to_string_lossy().into_owned();
        let (stem, ext) = match name.rsplit_once('.') {
            Some((s, e)) => (s.to_string(), format!(".{e}")),
            None => (name.clone(), String::new()),
        };
        let mut candidate = name.clone();
        let mut n = 2;
        while target_dir.join(&candidate).exists() {
            candidate = format!("{stem}-{n}{ext}");
            n += 1;
        }
        fs::copy(&src, target_dir.join(&candidate)).map_err(|e| e.to_string())?;
        out.push(format!("{subdir}/{candidate}"));
    }
    Ok(out)
}

/// Saves pasted image bytes into `assets/`. Generic clipboard names ("image.png")
/// become `bild-1.png`, `bild-2.png` …; real file names are kept (made unique).
pub fn save_asset(root: &Path, name: &str, bytes: &[u8]) -> Result<String, String> {
    let dir = root.join("assets");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !e.is_empty() && e.len() <= 5 => (s, e.to_ascii_lowercase()),
        _ => (name, "png".to_string()),
    };
    let clean: String = stem
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let generic = clean.is_empty() || matches!(clean.to_lowercase().as_str(), "image" | "bild" | "unknown" | "untitled");
    let mut n = 1;
    let candidate = loop {
        let c = if generic {
            format!("bild-{n}.{ext}")
        } else if n == 1 {
            format!("{clean}.{ext}")
        } else {
            format!("{clean}-{n}.{ext}")
        };
        if !dir.join(&c).exists() {
            break c;
        }
        n += 1;
    };
    fs::write(dir.join(&candidate), bytes).map_err(|e| e.to_string())?;
    Ok(format!("assets/{candidate}"))
}

#[cfg(test)]
mod file_ops_tests {
    use super::*;

    #[test]
    fn profil_wird_eingetragen() {
        let blatt = "#import \"templates/arbeitsblatt.typ\": *\n\n#show: arbeitsblatt.with(\n  titel: \"A\",\n)\n";
        let neu = profil_setzen(blatt, "akademisch");
        assert!(neu.contains("#show: arbeitsblatt.with(\n  profil: \"akademisch\",\n  titel: \"A\","));
        assert_eq!(profil_setzen(blatt, "klassisch"), blatt);
        assert_eq!(profil_setzen(&neu, "schlicht"), neu);
        let leer = "#import \"templates/stil.typ\": *\n#show: stil\n\n= T\n";
        assert_eq!(profil_setzen(leer, "schlicht"), "#import \"templates/stil.typ\": *\n#show: stil.with(profil: \"schlicht\")\n\n= T\n");
    }

    #[test]
    fn pasted_assets_get_free_names() {
        let root = std::env::temp_dir().join("neotypst-asset-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        assert_eq!(save_asset(&root, "image.png", b"x").unwrap(), "assets/bild-1.png");
        assert_eq!(save_asset(&root, "image.png", b"x").unwrap(), "assets/bild-2.png");
        assert_eq!(save_asset(&root, "Bildschirmfoto 2026-11-21 um 10.02.png", b"x").unwrap(), "assets/Bildschirmfoto-2026-11-21-um-10-02.png");
        assert_eq!(save_asset(&root, "Graph.JPG", b"x").unwrap(), "assets/Graph.jpg");
        assert_eq!(save_asset(&root, "Graph.jpg", b"x").unwrap(), "assets/Graph-2.jpg");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn save_detects_conflicts_and_keeps_history() {
        let root = std::env::temp_dir().join("neotypst-save-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let t0 = 1_000_000_000_000;

        write_text(&root, "main.typ", "Anfang").unwrap();
        let o = open_text(&root, "main.typ").unwrap();
        let h1 = save_text(&root, "main.typ", "Anfang und mehr", Some(&o.hash), t0).unwrap();
        assert_eq!(file_hash(&root, "main.typ").unwrap().as_deref(), Some(h1.as_str()));
        assert!(!root.join(".main.typ.neotypst-tmp").exists());

        // Von außen geändert: Speichern verweigert, Datei bleibt.
        fs::write(root.join("main.typ"), "von außen").unwrap();
        let e = save_text(&root, "main.typ", "aus dem Editor", Some(&h1), t0 + 1).unwrap_err();
        assert!(e.starts_with(KONFLIKT));
        assert_eq!(read_text(&root, "main.typ").unwrap(), "von außen");

        // Überschreiben ohne Prüfsumme sichert den fremden Inhalt vorher.
        save_text(&root, "main.typ", "aus dem Editor", None, t0 + 2).unwrap();
        let l = crate::history::liste(&root, "main.typ").unwrap();
        assert!(l.iter().any(|s| s.grund == "vor-ueberschreiben"
            && crate::history::lesen(&root, "main.typ", &s.id).unwrap() == "von außen"));

        // Viel gelöscht: der alte Inhalt kommt sofort in den Verlauf.
        let lang = format!("Aufgabe: {}", "Text ".repeat(60));
        let h = save_text(&root, "main.typ", &lang, None, t0 + 3).unwrap();
        save_text(&root, "main.typ", "Aufgabe:", Some(&h), t0 + 4).unwrap();
        let l = crate::history::liste(&root, "main.typ").unwrap();
        let s = l.iter().find(|s| s.grund == "loeschung").expect("Stand vor dem Löschen");
        assert_eq!(crate::history::lesen(&root, "main.typ", &s.id).unwrap(), lang);

        // Versteckte Dateien haben keinen Verlauf, der Verlauf ist versteckt.
        save_text(&root, ".neotypst-woerter.txt", "Wort", None, t0).unwrap();
        assert!(crate::history::liste(&root, ".neotypst-woerter.txt").unwrap().is_empty());
        assert_eq!(walk_files(&root), vec!["main.typ".to_string()]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn folders_duplicate_trash_restore() {
        let root = std::env::temp_dir().join("neotypst-fileops-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        create_dir(&root, "kapitel/leer").unwrap();
        create_file(&root, "kapitel/a.typ").unwrap();
        let entries = list_files(&root);
        let has = |p: &str, k: &str| entries.iter().any(|e| e.path == p && e.kind == k);
        assert!(has("kapitel", "dir") && has("kapitel/leer", "dir") && has("kapitel/a.typ", "typ"));
        assert!(create_dir(&root, "kapitel").is_err());

        assert_eq!(duplicate(&root, "kapitel/a.typ").unwrap(), "kapitel/a kopie.typ");
        assert_eq!(duplicate(&root, "kapitel/a.typ").unwrap(), "kapitel/a kopie 2.typ");
        assert_eq!(duplicate(&root, "kapitel/leer").unwrap(), "kapitel/leer kopie");

        rename(&root, "kapitel", "teile/kapitel").unwrap();
        assert!(root.join("teile/kapitel/a.typ").exists());

        assert!(trash(&root, "").is_err());
        assert!(resolve(&root, "../x").is_err());
        let trashed = trash(&root, "teile/kapitel/a.typ").unwrap();
        assert!(!root.join("teile/kapitel/a.typ").exists());
        if cfg!(target_os = "macos") {
            // Nur macOS sagt, wo die Datei im Papierkorb liegt; nur dort gibt es „Rückgängig“.
            assert!(Path::new(&trashed).exists());
            restore(&root, &trashed, "teile/kapitel/a.typ").unwrap();
            assert!(root.join("teile/kapitel/a.typ").exists());
        } else {
            assert!(trashed.is_empty());
        }
        let _ = fs::remove_dir_all(&root);
    }
}
