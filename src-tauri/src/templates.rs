//! Project templates: built-in ones (compiled into the app) and the user's own
//! (folders in `~/Documents/Typst/_Vorlagen/`). A template is a set of files
//! copied into a new project; `{{feld}}` placeholders in `.typ` files are
//! filled from a small form.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Field {
    pub key: String,
    pub label: String,
    #[serde(default)]
    pub placeholder: String,
    /// Value used when the field is left empty (and for preview images).
    #[serde(default)]
    pub default: String,
    /// `text`, `date` or `choice` (free text with suggestions).
    #[serde(default = "text_kind")]
    pub kind: String,
    #[serde(default)]
    pub options: Vec<String>,
    /// Remember the last entered value for the next project (e.g. your name).
    #[serde(default)]
    pub remember: bool,
}

fn text_kind() -> String {
    "text".into()
}

#[derive(Serialize, Clone, Debug)]
pub struct TemplateInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub fields: Vec<Field>,
    pub user: bool,
}

/// `vorlage.json` inside a user template folder.
#[derive(Serialize, Deserialize)]
struct Manifest {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default = "own_category")]
    category: String,
    #[serde(default)]
    fields: Vec<Field>,
}

fn own_category() -> String {
    "Eigene Vorlagen".into()
}

pub const USER_DIR: &str = "_Vorlagen";
const MANIFEST: &str = "vorlage.json";

macro_rules! tpl_file {
    ($dir:literal, $file:literal) => {
        ($file, include_str!(concat!("../templates/", $dir, "/", $file)))
    };
}

/// Gemeinsame Stil-Bibliothek: Jede eingebaute Vorlage legt sie als
/// `templates/stil.typ` ins Projekt, damit das Projekt ohne Paket kompiliert.
/// Dieselbe Datei gibt es als `@local/stil` (siehe templates/_stil/README.md).
const STIL: (&str, &str) = ("templates/stil.typ", include_str!("../templates/_stil/stil.typ"));

/// Dateien, die NeoTypst in Projekte kopiert und aktuell hält: der Stil und
/// die Bausteine der Vorlagen (Projektpfad, mitgelieferter Inhalt).
pub fn managed_files() -> Vec<(&'static str, &'static str)> {
    let mut out = vec![STIL];
    for b in BUILTIN {
        for f in b.files {
            if f.0.starts_with("templates/") && !out.iter().any(|o| o.0 == f.0) {
                out.push(*f);
            }
        }
    }
    out
}

struct Builtin {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    category: &'static str,
    files: &'static [(&'static str, &'static str)],
}

static BUILTIN: &[Builtin] = &[
    Builtin {
        id: "arbeitsblatt",
        name: "Arbeitsblatt",
        description: "Aufgaben mit Punkten, Rechenplatz und ein-/ausblendbaren Lösungen.",
        category: "Mathe & Physik",
        files: &[tpl_file!("arbeitsblatt", "main.typ"), tpl_file!("arbeitsblatt", "templates/arbeitsblatt.typ"), STIL],
    },
    Builtin {
        id: "hausaufgabe",
        name: "Hausaufgabe",
        description: "Abgabe mit Aufgabenstellung, Lösungsweg und markierten Ergebnissen.",
        category: "Mathe & Physik",
        files: &[tpl_file!("hausaufgabe", "main.typ"), tpl_file!("hausaufgabe", "templates/hausaufgabe.typ"), STIL],
    },
    Builtin {
        id: "wettbewerb",
        name: "Wettbewerb",
        description: "Olympiade-Format: jede Aufgabe auf eigener Seite, Behauptung und Beweis.",
        category: "Mathe & Physik",
        files: &[tpl_file!("wettbewerb", "main.typ"), tpl_file!("wettbewerb", "templates/wettbewerb.typ"), STIL],
    },
    Builtin {
        id: "dokumentation",
        name: "Dokumentation",
        description: "Deckblatt, Inhaltsverzeichnis, Codeblöcke und Hinweiskästen.",
        category: "Informatik",
        files: &[tpl_file!("dokumentation", "main.typ"), tpl_file!("dokumentation", "templates/dokumentation.typ"), STIL],
    },
    Builtin {
        id: "essay",
        name: "Essay",
        description: "Deckblatt mit Fragestellung und Angaben, danach schlichter Text im Blocksatz.",
        category: "Allgemein",
        files: &[tpl_file!("essay", "main.typ"), tpl_file!("essay", "templates/essay.typ"), STIL],
    },
    Builtin {
        id: "leer",
        name: "Leeres Dokument",
        description: "Nur der Grundstil: A4, Deutsch, New Computer Modern 12 pt, Aufgaben und Teilaufgaben.",
        category: "Allgemein",
        files: &[tpl_file!("leer", "main.typ"), STIL],
    },
];

fn field(key: &str, label: &str, placeholder: &str, default: &str) -> Field {
    Field {
        key: key.into(),
        label: label.into(),
        placeholder: placeholder.into(),
        default: default.into(),
        kind: "text".into(),
        options: vec![],
        remember: false,
    }
}

fn titel(default: &str) -> Field {
    field("titel", "Titel", default, default)
}

fn datum() -> Field {
    Field { kind: "date".into(), ..field("datum", "Datum", "", "") }
}

fn name() -> Field {
    Field { remember: true, ..field("name", "Dein Name", "Vor- und Nachname", "Dein Name") }
}

fn builtin_fields(id: &str) -> Vec<Field> {
    match id {
        "arbeitsblatt" => vec![
            titel("Arbeitsblatt"),
            Field {
                kind: "choice".into(),
                remember: true,
                options: ["Mathematik", "Physik", "Informatik", "Chemie", "Biologie", "Astronomie"]
                    .map(String::from)
                    .to_vec(),
                ..field("fach", "Fach", "z. B. Physik", "Physik")
            },
            Field { remember: true, ..field("klasse", "Klasse / Kurs", "z. B. 10b", "") },
            datum(),
        ],
        "hausaufgabe" => vec![
            titel("Übungsblatt 1"),
            Field { remember: true, ..field("kurs", "Kurs / Vorlesung", "z. B. Analysis I", "Analysis I") },
            name(),
            datum(),
        ],
        "wettbewerb" => vec![
            Field {
                kind: "choice".into(),
                options: ["Mathematik-Olympiade", "Physik-Olympiade", "Bundeswettbewerb Mathematik", "Bundeswettbewerb Informatik", "Informatik-Olympiade"]
                    .map(String::from)
                    .to_vec(),
                ..field("titel", "Wettbewerb", "z. B. Mathematik-Olympiade", "Mathematik-Olympiade")
            },
            field("runde", "Runde", "z. B. 1. Runde", "1. Runde"),
            name(),
            Field { remember: true, ..field("teilnehmernummer", "Teilnehmernummer", "optional", "") },
            datum(),
        ],
        "dokumentation" => vec![
            titel("Projektdokumentation"),
            field("untertitel", "Untertitel", "z. B. Softwareprojekt Klasse 12", "Projektdokumentation"),
            name(),
            datum(),
        ],
        "essay" => vec![
            field("titel", "Fragestellung", "z. B. Darf man lügen, um Leben zu retten?", "Darf man lügen, um Leben zu retten?"),
            name(),
            Field { remember: true, ..field("kurs", "Kurs", "z. B. Philosophie Q1", "") },
            Field { remember: true, ..field("lehrkraft", "Lehrkraft", "optional", "") },
            datum(),
        ],
        _ => vec![titel("Dokument")],
    }
}

pub fn user_dir() -> Result<PathBuf, String> {
    let dir = crate::project::projects_dir()?.join(USER_DIR);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn read_manifest(dir: &Path) -> Option<Manifest> {
    let raw = fs::read_to_string(dir.join(MANIFEST)).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn list() -> Vec<TemplateInfo> {
    let mut out: Vec<TemplateInfo> = BUILTIN
        .iter()
        .map(|b| TemplateInfo {
            id: b.id.into(),
            name: b.name.into(),
            description: b.description.into(),
            category: b.category.into(),
            fields: builtin_fields(b.id),
            user: false,
        })
        .collect();
    if let Ok(dir) = user_dir() {
        let mut users = Vec::new();
        for entry in fs::read_dir(dir).into_iter().flatten().flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let folder = entry.file_name().to_string_lossy().into_owned();
            if folder.starts_with('.') {
                continue;
            }
            let m = read_manifest(&path).unwrap_or(Manifest {
                name: folder.clone(),
                description: String::new(),
                category: own_category(),
                fields: vec![],
            });
            let mut fields = m.fields;
            if !fields.iter().any(|f| f.key == "titel") {
                fields.insert(0, titel(&m.name));
            }
            users.push(TemplateInfo {
                id: format!("user:{folder}"),
                name: m.name,
                description: m.description,
                category: m.category,
                fields,
                user: true,
            });
        }
        users.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out.extend(users);
    }
    out
}

pub fn find(id: &str) -> Option<TemplateInfo> {
    list().into_iter().find(|t| t.id == id)
}

/// All files of a template as (relative path, bytes).
pub fn files_of(id: &str) -> Result<Vec<(String, Vec<u8>)>, String> {
    if let Some(folder) = id.strip_prefix("user:") {
        if folder.contains('/') || folder.contains("..") {
            return Err("Ungültige Vorlage".into());
        }
        let dir = user_dir()?.join(folder);
        let mut out = Vec::new();
        for rel in crate::project::walk_files(&dir) {
            if rel == MANIFEST || rel.starts_with("out/") {
                continue;
            }
            out.push((rel.clone(), fs::read(dir.join(&rel)).map_err(|e| e.to_string())?));
        }
        if out.is_empty() {
            return Err("Die Vorlage ist leer".into());
        }
        return Ok(out);
    }
    let b = BUILTIN.iter().find(|b| b.id == id).ok_or("Unbekannte Vorlage")?;
    Ok(b.files.iter().map(|(p, c)| (p.to_string(), c.as_bytes().to_vec())).collect())
}

/// Fills `{{key}}` placeholders. Empty values fall back to the field default;
/// `{{datum}}` falls back to today.
pub fn fill(content: &str, fields: &[Field], values: &[(String, String)]) -> String {
    let today = chrono::Local::now().format("%d.%m.%Y").to_string();
    let escape = |s: &str| s.replace('\\', "\\\\").replace('"', "\\\"");
    let value = |key: &str| -> String {
        let given = values.iter().find(|(k, _)| k == key).map(|(_, v)| v.trim().to_string()).unwrap_or_default();
        if !given.is_empty() {
            return given;
        }
        if key == "datum" {
            return today.clone();
        }
        fields.iter().find(|f| f.key == key).map(|f| f.default.clone()).unwrap_or_default()
    };
    let mut out = String::with_capacity(content.len());
    let mut rest = content;
    while let Some(start) = rest.find("{{") {
        let Some(len) = rest[start + 2..].find("}}") else { break };
        let key = &rest[start + 2..start + 2 + len];
        if key.is_empty() || !key.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
            out.push_str(&rest[..start + 2]);
            rest = &rest[start + 2..];
            continue;
        }
        out.push_str(&rest[..start]);
        out.push_str(&escape(&value(key)));
        rest = &rest[start + 2 + len + 2..];
    }
    out.push_str(rest);
    out
}

/// Writes a template into `dir`, filling placeholders in text files.
pub fn materialize(id: &str, dir: &Path, values: &[(String, String)]) -> Result<(), String> {
    let info = find(id).ok_or("Unbekannte Vorlage")?;
    for (rel, bytes) in files_of(id)? {
        let target = dir.join(&rel);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let data = if rel.ends_with(".typ") {
            match String::from_utf8(bytes) {
                Ok(text) => fill(&text, &info.fields, values).into_bytes(),
                Err(e) => e.into_bytes(),
            }
        } else {
            bytes
        };
        fs::write(&target, data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Saves a project folder as a user template.
pub fn save_project_as_template(root: &Path, name: &str, description: &str) -> Result<String, String> {
    let folder: String = name
        .trim()
        .chars()
        .map(|c| if matches!(c, '/' | ':' | '\\') { '-' } else { c })
        .collect();
    if folder.is_empty() || folder.starts_with('.') {
        return Err("Ungültiger Name".into());
    }
    let dir = user_dir()?.join(&folder);
    if dir.exists() {
        return Err(format!("Eine Vorlage „{folder}“ existiert bereits"));
    }
    for rel in crate::project::walk_files(root) {
        if rel.starts_with("out/") {
            continue;
        }
        let target = dir.join(&rel);
        fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::copy(root.join(&rel), &target).map_err(|e| e.to_string())?;
    }
    let manifest = Manifest {
        name: name.trim().into(),
        description: description.trim().into(),
        category: own_category(),
        fields: vec![titel(name.trim()), datum()],
    };
    fs::write(dir.join(MANIFEST), serde_json::to_string_pretty(&manifest).unwrap()).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Renders the first page of a template (filled with defaults) as SVG.
pub fn preview_svg(id: &str) -> Result<String, String> {
    let dir = std::env::temp_dir().join(format!("neotypst-preview-{}", id.replace(':', "_")));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    materialize(id, &dir, &[])?;
    let main = if dir.join("main.typ").exists() {
        "main.typ".to_string()
    } else {
        crate::project::walk_files(&dir).into_iter().find(|f| f.ends_with(".typ")).ok_or("Keine .typ-Datei")?
    };
    let mut engine = crate::engine::Engine::new();
    engine.open(dir.clone(), main)?;
    let svg = engine.first_page_svg();
    let _ = fs::remove_dir_all(&dir);
    svg
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;

    /// Every built-in template must compile without errors.
    #[test]
    fn templates_compile() {
        for t in BUILTIN {
            let dir = std::env::temp_dir().join(format!("neotypst-test-{}", t.id));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            materialize(t.id, &dir, &[("titel".into(), "Test \"mit\" Zitat".into())]).unwrap();
            let main = std::fs::read_to_string(dir.join("main.typ")).unwrap();
            assert!(!main.contains("{{"), "unfilled placeholder in {}", t.id);
            for solutions in [false, true] {
                let mut engine = Engine::new();
                engine.open(dir.clone(), "main.typ".into()).unwrap();
                engine.set_solutions(solutions).unwrap();
                let out = engine.compile(None, None).unwrap();
                let errors = out.errors();
                assert!(errors.is_empty(), "template {} failed: {:?}", t.id, errors);
                assert!(out.page_count() > 0);
            }
            assert!(preview_svg(t.id).unwrap().starts_with("<svg"));
        }
    }

    /// Die Regeln aus stil.typ: Dezimalkomma, Einheiten, Formelnummern und
    /// Farben, die nur in ihrem Bereich gelten. Die Prüfungen laufen in Typst.
    #[test]
    fn stil_rules() {
        let dir = std::env::temp_dir().join("neotypst-stil-regeln-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("templates")).unwrap();
        std::fs::write(dir.join("templates/stil.typ"), STIL.1).unwrap();
        let main = r#"#import "templates/stil.typ": *
#show: stil

// Dezimalkomma ja, Argument-Kommas nein
#assert(_neu($0,4871$.body) != none)
#assert(_neu($f(x, y)$.body) == none)
#assert(_neu($x_(0,5)$.body) != none)
#assert(_neu($(0,5)/(1,5)$.body) != none)
// Einheiten nur direkt nach einer Zahl, einbuchstabige nur mit Leerzeichen
#assert(_neu($8 s$.body) != none)
#assert(_neu($100 km/h$.body) != none)
#assert(_neu($3,5 m/s^2$.body) != none)
#assert(_neu($2s$.body) == none)
#assert(_neu($v = s/t$.body) == none)
#assert(_neu($2 x$.body) == none)

// Nummerierte Formeln zählen einfach, auch wenn die Regel sie ändert
#set math.equation(numbering: "(1)")
$ 0,5 + 8 s $ <a>
$ x = y $
$ 1,25 km $ <b>
#context assert.eq(counter(math.equation).get().first(), 3)
Siehe @a und @b.

// Eine Akzentfarbe gilt nur in ihrem Bereich
#[
  #show: stil.with(akzent: red, kasten: blue)
  #context assert.eq(_akzent.get().last(), red)
]
#context assert.eq(_akzent.get().last(), black)
#context assert.eq(_kasten.get().last(), luma(244))

// Profil „akademisch“: kein Kasten, e aufrecht, e_1 bleibt Name
#assert(_neu($e^x$.body) == none)
#assert(_neu($e^x$.body, iso: true) != none)
#assert(_neu($e$.body, iso: true) != none)
#[
  #show: stil.with(profil: "akademisch")
  #context assert(_akademisch())
  #context assert.eq(_kasten.get().last(), none)
  #aufgabe(punkte: 2)[+ a + b]
  #teil[$x = 1$]
  #figure(table(columns: 2, [a], [b]), caption: [T])
]
#context assert(not _akademisch())
"#;
        std::fs::write(dir.join("main.typ"), main).unwrap();
        let mut engine = Engine::new();
        engine.open(dir, "main.typ".into()).unwrap();
        let out = engine.compile(None, None).unwrap();
        assert!(out.errors().is_empty(), "stil.typ: {:?}", out.errors());
    }

    #[test]
    fn fill_placeholders() {
        let fields = vec![field("fach", "Fach", "", "Physik")];
        let out = fill("{{titel}}|{{fach}}|{{datum}}|{{ x }}|{{", &fields, &[("titel".into(), "A\"B".into())]);
        assert!(out.starts_with("A\\\"B|Physik|"));
        assert!(out.ends_with("|{{ x }}|{{"));
    }
}

#[cfg(test)]
mod fixture {
    use super::*;
    use crate::engine::Engine;

    fn graphics_previews() -> std::collections::HashMap<String, String> {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/graphics");
        let mut out = std::collections::HashMap::new();
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let code = std::fs::read_to_string(&path).unwrap();
            let name = path.file_stem().unwrap().to_string_lossy().into_owned();
            out.insert(name, crate::graphics::render_snippet(&code).unwrap());
        }
        out
    }

    /// Writes a real compile result for the browser mock (dev only).
    #[test]
    #[ignore]
    fn dump_fixture() {
        let dir = std::env::temp_dir().join("neotypst-fixture");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        materialize(
            "arbeitsblatt",
            &dir,
            &[("titel".into(), "Gleichmäßig beschleunigte Bewegung".into()), ("klasse".into(), "10".into())],
        )
        .unwrap();
        let main = std::fs::read_to_string(dir.join("main.typ")).unwrap();
        let mut engine = Engine::new();
        engine.open(dir.clone(), "main.typ".into()).unwrap();
        let out = engine.compile(None, None).unwrap();
        let hl = crate::engine::highlight(&main);
        let previews: std::collections::HashMap<&str, String> =
            BUILTIN.iter().map(|b| (b.id, preview_svg(b.id).unwrap())).collect();
        let json = serde_json::json!({ "compile": out, "main": main, "highlight": hl, "templates": list(), "previews": previews, "symbols": crate::symbols::all(), "graphics": graphics_previews() });
        std::fs::write(std::env::var("FIXTURE_OUT").unwrap(), json.to_string()).unwrap();
    }
}
