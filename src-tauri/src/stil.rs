//! Stil-Kopien in Projekten aktuell halten.
//!
//! Jedes Projekt hat eine eigene `templates/stil.typ` (und je nach Vorlage
//! `templates/arbeitsblatt.typ` …), damit es auch ohne NeoTypst kompiliert.
//! Hier wird erkannt, ob eine Kopie aktuell ist, eine unveränderte ältere
//! Fassung (darf ersetzt werden) oder von Hand angepasst (nur auf Wunsch).

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::{history, project, templates};

/// Prüfsummen aller je veröffentlichten Fassungen, aus scripts/stil-versionen.py.
const VERSIONEN: &str = include_str!("../templates/_stil/versionen.txt");

/// Version des lokalen Pakets `@local/stil`, das die App bereitstellt.
pub const PAKET_VERSION: &str = "0.1.0";

/// FNV-1a 64, wie in scripts/stil-versionen.py.
pub fn stil_hash(data: &[u8]) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in data {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

fn bekannt_in(versionen: &str, pfad: &str, hash: &str) -> bool {
    versionen.lines().filter(|l| !l.starts_with('#')).any(|l| l.split_once(' ') == Some((pfad, hash)))
}

/// Die Versionskennung aus der ersten Zeile (`// neotypst-stil 0.5.0`).
fn version(text: &str) -> Option<String> {
    text.lines().next()?.strip_prefix("// neotypst-stil ").map(|v| v.trim().to_string())
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct StilDatei {
    pub path: String,
    /// `aktuell`, `veraltet` (unveränderte ältere Fassung) oder `angepasst`.
    pub status: &'static str,
    /// Versionskennung der Kopie im Projekt, falls vorhanden.
    pub version: Option<String>,
}

pub fn status(root: &Path) -> Vec<StilDatei> {
    status_in(root, VERSIONEN)
}

fn status_in(root: &Path, versionen: &str) -> Vec<StilDatei> {
    templates::managed_files()
        .into_iter()
        .filter_map(|(pfad, neu)| {
            let alt = fs::read(root.join(pfad)).ok()?;
            let status = if alt == neu.as_bytes() {
                "aktuell"
            } else if bekannt_in(versionen, pfad, &stil_hash(&alt)) {
                "veraltet"
            } else {
                "angepasst"
            };
            Some(StilDatei { path: pfad.to_string(), status, version: version(&String::from_utf8_lossy(&alt)) })
        })
        .collect()
}

/// Der mitgelieferte Inhalt einer verwalteten Datei.
pub fn mitgeliefert(pfad: &str) -> Result<&'static str, String> {
    templates::managed_files()
        .into_iter()
        .find(|(p, _)| *p == pfad)
        .map(|(_, t)| t)
        .ok_or_else(|| format!("{pfad} gehört nicht zum Stil"))
}

/// Ersetzt die genannten Dateien durch die mitgelieferte Fassung. Der alte
/// Inhalt kommt vorher in den Verlauf. Gibt die ersetzten Pfade zurück.
pub fn aktualisieren(root: &Path, pfade: &[String]) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for pfad in pfade {
        let neu = mitgeliefert(pfad)?;
        let alt = fs::read_to_string(root.join(pfad)).unwrap_or_default();
        if alt == neu {
            continue;
        }
        if !alt.is_empty() {
            history::sichern(root, pfad, &alt, "vor-stil-update", history::jetzt())?;
        }
        project::write_text(root, pfad, neu)?;
        out.push(pfad.clone());
    }
    Ok(out)
}

#[derive(Serialize)]
pub struct ProjektStil {
    pub name: String,
    pub path: String,
    pub veraltet: Vec<String>,
    pub angepasst: Vec<String>,
}

/// Alle Projekte im Projektordner, deren Stil nicht aktuell ist.
pub fn alle_projekte() -> Result<Vec<ProjektStil>, String> {
    let mut out = Vec::new();
    for p in project::list_projects()? {
        let dateien = status(Path::new(&p.path));
        let nach = |s: &str| dateien.iter().filter(|d| d.status == s).map(|d| d.path.clone()).collect::<Vec<_>>();
        let (veraltet, angepasst) = (nach("veraltet"), nach("angepasst"));
        if !veraltet.is_empty() || !angepasst.is_empty() {
            out.push(ProjektStil { name: p.name.clone(), path: p.path.clone(), veraltet, angepasst });
        }
    }
    Ok(out)
}

/// Stellt `@local/stil` im Typst-Datenordner bereit, immer in der Fassung
/// dieser App. Schreibt nur, was sich geändert hat.
pub fn paket_bereitstellen(daten: &Path) -> std::io::Result<()> {
    let dir = daten.join("local/stil").join(PAKET_VERSION);
    fs::create_dir_all(&dir)?;
    let dateien = [
        ("lib.typ", mitgeliefert("templates/stil.typ").unwrap_or_default()),
        ("STIL.md", include_str!("../templates/_stil/STIL.md")),
        (
            "typst.toml",
            concat!(
                "[package]\n",
                "name = \"stil\"\n",
                "version = \"0.1.0\"\n",
                "entrypoint = \"lib.typ\"\n",
                "authors = [\"Linus Schulze\"]\n",
                "license = \"MIT\"\n",
                "description = \"Einheitlicher Stil für Mathe-, Physik- und Informatik-Dokumente: Schrift, Aufgaben, Teilaufgaben, Rechnungen.\"\n",
            ),
        ),
    ];
    for (name, inhalt) in dateien {
        let pfad = dir.join(name);
        if fs::read_to_string(&pfad).ok().as_deref() != Some(inhalt) {
            fs::write(pfad, inhalt)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_wie_im_skript() {
        // FNV-1a 64 Referenzwerte.
        assert_eq!(stil_hash(b""), "cbf29ce484222325");
        assert_eq!(stil_hash(b"a"), "af63dc4c8601ec8c");
    }

    #[test]
    fn mitgelieferte_fassungen_sind_bekannt_und_gleich_versioniert() {
        // Sonst wurde scripts/stil-versionen.py nach einer Änderung vergessen.
        let mut versionen = std::collections::HashSet::new();
        for (pfad, inhalt) in templates::managed_files() {
            assert!(bekannt_in(VERSIONEN, pfad, &stil_hash(inhalt.as_bytes())), "{pfad}: scripts/stil-versionen.py ausführen");
            versionen.insert(version(inhalt).unwrap_or_else(|| panic!("{pfad}: erste Zeile `// neotypst-stil …` fehlt")));
        }
        assert_eq!(versionen.len(), 1, "alle Stil-Dateien tragen dieselbe Version: {versionen:?}");
    }

    #[test]
    fn erkennt_aktuell_veraltet_angepasst_und_aktualisiert() {
        let root = std::env::temp_dir().join("neotypst-stil-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("templates")).unwrap();
        let alt = "// neotypst-stil 0.4.0\n// alte Fassung\n";
        let liste = format!("templates/arbeitsblatt.typ {}\n", stil_hash(alt.as_bytes()));
        fs::write(root.join("templates/stil.typ"), mitgeliefert("templates/stil.typ").unwrap()).unwrap();
        fs::write(root.join("templates/arbeitsblatt.typ"), alt).unwrap();
        fs::write(root.join("templates/essay.typ"), "// eigene Änderung\n").unwrap();

        let s = status_in(&root, &liste);
        let kurz: Vec<_> = s.iter().map(|d| (d.path.as_str(), d.status, d.version.as_deref())).collect();
        assert_eq!(kurz, [
            ("templates/stil.typ", "aktuell", Some(version(mitgeliefert("templates/stil.typ").unwrap()).unwrap().as_str())),
            ("templates/arbeitsblatt.typ", "veraltet", Some("0.4.0")),
            ("templates/essay.typ", "angepasst", None),
        ]);

        let ersetzt = aktualisieren(&root, &["templates/arbeitsblatt.typ".into(), "templates/stil.typ".into()]).unwrap();
        assert_eq!(ersetzt, ["templates/arbeitsblatt.typ"]);
        assert_eq!(status_in(&root, &liste)[1].status, "aktuell");
        let verlauf = history::liste(&root, "templates/arbeitsblatt.typ").unwrap();
        assert_eq!(history::lesen(&root, "templates/arbeitsblatt.typ", &verlauf[0].id).unwrap(), alt);
        assert_eq!(verlauf[0].grund, "vor-stil-update");
        assert!(aktualisieren(&root, &["main.typ".into()]).is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn paket_wird_bereitgestellt() {
        let daten = std::env::temp_dir().join("neotypst-paket-test");
        let _ = fs::remove_dir_all(&daten);
        paket_bereitstellen(&daten).unwrap();
        let lib = fs::read_to_string(daten.join("local/stil/0.1.0/lib.typ")).unwrap();
        assert_eq!(lib, mitgeliefert("templates/stil.typ").unwrap());
        assert!(daten.join("local/stil/0.1.0/typst.toml").is_file());
        let _ = fs::remove_dir_all(&daten);
    }
}
