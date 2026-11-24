//! Verlauf: frühere Stände von Textdateien unter `<projekt>/.neotypst/verlauf/`.
//!
//! Für jede Datei gibt es einen Ordner mit dem Projektpfad der Datei, darin
//! je Stand eine Datei `<millisekunden>_<grund>.txt`. Der Ordner beginnt mit
//! einem Punkt und taucht deshalb weder im Dateibaum noch in Typst auf.
//!
//! Gesichert wird
//! - beim Speichern, wenn der letzte Stand älter als [`INTERVALL`] ist,
//! - sofort der alte Inhalt, wenn ein Speichern viel Text entfernt,
//! - vor dem Neuladen, Überschreiben oder Wiederherstellen.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::project::resolve;

pub const ORDNER: &str = ".neotypst/verlauf";
/// Abstand zwischen zwei automatischen Ständen.
pub const INTERVALL: u64 = 2 * 60 * 1000;
/// Ab so vielen entfernten Bytes wird der alte Inhalt sofort gesichert.
pub const LOESCHSCHWELLE: usize = 200;
/// Obergrenze für den Verlauf eines Projekts.
pub const MAX_BYTES: u64 = 20 * 1024 * 1024;

const STUNDE: u64 = 60 * 60 * 1000;
const TAG: u64 = 24 * STUNDE;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Stand {
    /// Dateiname im Verlaufsordner, zum Wiederfinden.
    pub id: String,
    /// Zeitpunkt in Millisekunden seit 1970.
    pub zeit: u64,
    /// `auto`, `loeschung`, `vor-neuladen`, `vor-ueberschreiben`, `vor-wiederherstellen`.
    pub grund: String,
    pub bytes: u64,
}

pub fn jetzt() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn ordner(root: &Path, rel: &str) -> Result<PathBuf, String> {
    // resolve() lehnt Pfade außerhalb des Projekts ab.
    resolve(&root.join(ORDNER), rel)
}

/// Alle Stände einer Datei, der neueste zuerst.
pub fn liste(root: &Path, rel: &str) -> Result<Vec<Stand>, String> {
    let dir = ordner(root, rel)?;
    let Ok(eintraege) = fs::read_dir(&dir) else { return Ok(Vec::new()) };
    let mut out: Vec<Stand> = eintraege
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let stamm = name.strip_suffix(".txt")?;
            let (zeit, grund) = stamm.split_once('_')?;
            Some(Stand {
                zeit: zeit.parse().ok()?,
                grund: grund.to_string(),
                bytes: e.metadata().map(|m| m.len()).unwrap_or(0),
                id: name,
            })
        })
        .collect();
    out.sort_by(|a, b| b.zeit.cmp(&a.zeit));
    Ok(out)
}

pub fn lesen(root: &Path, rel: &str, id: &str) -> Result<String, String> {
    if id.contains('/') || id.contains('\\') || id.contains("..") {
        return Err("Ungültiger Stand".into());
    }
    fs::read_to_string(ordner(root, rel)?.join(id)).map_err(|e| e.to_string())
}

/// Sichert `text` als Stand. Bei `grund == "auto"` nur, wenn der letzte Stand
/// älter als [`INTERVALL`] ist. Gleicher Inhalt wie der letzte Stand wird nie
/// doppelt gesichert. Gibt zurück, ob gesichert wurde.
pub fn sichern(root: &Path, rel: &str, text: &str, grund: &str, zeit: u64) -> Result<bool, String> {
    let dir = ordner(root, rel)?;
    let bisher = liste(root, rel)?;
    if let Some(letzter) = bisher.first() {
        if grund == "auto" && zeit.saturating_sub(letzter.zeit) < INTERVALL {
            return Ok(false);
        }
        if fs::read_to_string(dir.join(&letzter.id)).is_ok_and(|t| t == text) {
            return Ok(false);
        }
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Gleiche Millisekunde (Tests, schnelle Folgen): eine weiter.
    let mut z = zeit;
    while bisher.iter().any(|s| s.zeit == z) {
        z += 1;
    }
    fs::write(dir.join(format!("{z}_{grund}.txt")), text).map_err(|e| e.to_string())?;
    aufraeumen(root, rel, zeit)?;
    begrenzen(root)?;
    Ok(true)
}

/// Bytes, die zwischen `alt` und `neu` entfernt wurden (alles zwischen
/// gemeinsamem Anfang und gemeinsamem Ende).
pub fn entfernt(alt: &str, neu: &str) -> usize {
    let (a, b) = (alt.as_bytes(), neu.as_bytes());
    let anfang = a.iter().zip(b).take_while(|(x, y)| x == y).count();
    let rest = a.len().min(b.len()) - anfang;
    let ende = a.iter().rev().zip(b.iter().rev()).take(rest).take_while(|(x, y)| x == y).count();
    a.len() - anfang - ende
}

/// Ausdünnen: die letzten 24 Stunden bleiben ganz, danach ein Stand pro
/// Stunde für 7 Tage, dann einer pro Tag für 30 Tage, älteres fällt weg.
fn aufraeumen(root: &Path, rel: &str, zeit: u64) -> Result<(), String> {
    let dir = ordner(root, rel)?;
    let mut behalten = std::collections::HashSet::new();
    for s in liste(root, rel)? {
        let alter = zeit.saturating_sub(s.zeit);
        let fach = if alter < TAG {
            continue;
        } else if alter < 7 * TAG {
            s.zeit / STUNDE
        } else if alter < 30 * TAG {
            u64::MAX / 2 + s.zeit / TAG
        } else {
            let _ = fs::remove_file(dir.join(&s.id));
            continue;
        };
        // Die Liste ist neueste zuerst: der erste Stand je Fach bleibt.
        if !behalten.insert(fach) {
            let _ = fs::remove_file(dir.join(&s.id));
        }
    }
    Ok(())
}

/// Hält den Verlauf des Projekts unter [`MAX_BYTES`], die ältesten Stände gehen zuerst.
fn begrenzen(root: &Path) -> Result<(), String> {
    let basis = root.join(ORDNER);
    let mut alle: Vec<(u64, u64, PathBuf)> = Vec::new();
    fn sammeln(dir: &Path, out: &mut Vec<(u64, u64, PathBuf)>) {
        let Ok(eintraege) = fs::read_dir(dir) else { return };
        for e in eintraege.flatten() {
            let p = e.path();
            if p.is_dir() {
                sammeln(&p, out);
            } else if let Some(zeit) = p
                .file_name()
                .and_then(|n| n.to_str())
                .and_then(|n| n.split_once('_'))
                .and_then(|(z, _)| z.parse().ok())
            {
                out.push((zeit, e.metadata().map(|m| m.len()).unwrap_or(0), p));
            }
        }
    }
    sammeln(&basis, &mut alle);
    let mut summe: u64 = alle.iter().map(|(_, b, _)| b).sum();
    alle.sort_by_key(|(z, _, _)| *z);
    for (_, bytes, pfad) in alle {
        if summe <= MAX_BYTES {
            break;
        }
        let _ = fs::remove_file(pfad);
        summe -= bytes;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn projekt(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("neotypst-verlauf-{name}"));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn sichert_mit_abstand_und_ohne_doppelte() {
        let root = projekt("abstand");
        let t0 = 1_000_000_000_000;
        assert!(sichern(&root, "main.typ", "a", "auto", t0).unwrap());
        // Zu kurz danach: kein automatischer Stand.
        assert!(!sichern(&root, "main.typ", "ab", "auto", t0 + 1000).unwrap());
        // Andere Gründe sichern sofort, gleicher Inhalt nie doppelt.
        assert!(sichern(&root, "main.typ", "ab", "loeschung", t0 + 1000).unwrap());
        assert!(!sichern(&root, "main.typ", "ab", "vor-neuladen", t0 + 2000).unwrap());
        assert!(sichern(&root, "main.typ", "abc", "auto", t0 + 1000 + INTERVALL).unwrap());

        let l = liste(&root, "main.typ").unwrap();
        assert_eq!(l.iter().map(|s| s.grund.as_str()).collect::<Vec<_>>(), ["auto", "loeschung", "auto"]);
        assert_eq!(lesen(&root, "main.typ", &l[1].id).unwrap(), "ab");
        // Unterordner und Pfade außerhalb.
        assert!(sichern(&root, "templates/stil.typ", "x", "auto", t0).unwrap());
        assert_eq!(liste(&root, "templates/stil.typ").unwrap().len(), 1);
        assert!(liste(&root, "../x").is_err());
        assert!(lesen(&root, "main.typ", "../../main.typ").is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn duennt_alte_staende_aus() {
        let root = projekt("ausduennen");
        let jetzt = 100 * TAG;
        let dir = ordner(&root, "main.typ").unwrap();
        fs::create_dir_all(&dir).unwrap();
        let mut n = 0;
        let mut anlegen = |zeit: u64| {
            n += 1;
            fs::write(dir.join(format!("{zeit}_auto.txt")), format!("{n}")).unwrap();
        };
        // Heute: alle bleiben.
        for i in 0..5 { anlegen(jetzt - i * 10 * 60 * 1000); }
        // Vor 3 Tagen, drei Stände in derselben Stunde: einer bleibt.
        let stunde = (jetzt - 3 * TAG) / STUNDE * STUNDE;
        for i in 0..3 { anlegen(stunde + i * 60 * 1000); }
        // Vor 10 Tagen, zwei am selben Tag: einer bleibt.
        let tag = (jetzt - 10 * TAG) / TAG * TAG;
        anlegen(tag + STUNDE);
        anlegen(tag + 5 * STUNDE);
        // Vor 40 Tagen: fällt weg.
        anlegen(jetzt - 40 * TAG);

        aufraeumen(&root, "main.typ", jetzt).unwrap();
        let l = liste(&root, "main.typ").unwrap();
        assert_eq!(l.len(), 5 + 1 + 1);
        // Je Fach bleibt der neueste.
        assert!(l.iter().any(|s| s.zeit == stunde + 2 * 60 * 1000));
        assert!(l.iter().any(|s| s.zeit == tag + 5 * STUNDE));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn misst_entfernten_text() {
        assert_eq!(entfernt("abcdef", "abcdef"), 0);
        assert_eq!(entfernt("abcdef", "abef"), 2);
        assert_eq!(entfernt("abc", "abcxyz"), 0);
        assert_eq!(entfernt("aaaa", "aa"), 2);
        let lang = format!("A{}B", "x".repeat(300));
        assert_eq!(entfernt(&lang, "AB"), 300);
    }
}
