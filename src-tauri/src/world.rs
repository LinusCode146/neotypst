//! The Typst `World`: gives the compiler access to project files, packages,
//! fonts and — crucially for a live editor — unsaved editor buffers.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, RwLock};

use typst::diag::FileResult;
use typst::foundations::{Bytes, Datetime, Dict, Duration, IntoValue};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_kit::datetime::Time;
use typst_kit::downloader::SystemDownloader;
use typst_kit::files::{FileLoader, FileStore, FsRoot};
use typst_kit::fonts::{self, FontStore};
use typst_kit::packages::{FsPackages, SystemPackages, UniversePackages};

/// Fonts are discovered once per app run (system fonts + Typst's embedded
/// defaults). Forced in the background at startup so the first compile is fast.
pub static FONTS: LazyLock<FontStore> = LazyLock::new(|| {
    let mut store = FontStore::new();
    store.extend(fonts::system());
    store.extend(fonts::embedded());
    store
});

/// Gewählte Dokumentschrift aus den Einstellungen: Textschriften (mit Komma
/// getrennt, die erste vorhandene gilt) und Formelschrift. `None` = Standard
/// von stil.typ. Gilt für alle Welten, auch die Vorschauen der Vorlagen.
static SCHRIFT: RwLock<Option<(String, String)>> = RwLock::new(None);

pub fn set_schrift(schrift: Option<(String, String)>) {
    // Nur vorhandene Familien weitergeben: Typst warnt bei jeder unbekannten,
    // auch wenn eine andere aus der Liste passt. Fehlt die Formelschrift, gilt
    // die von stil.typ.
    let schrift = schrift.and_then(|(text, formeln)| {
        let familien: Vec<String> = text.split(',').map(|f| f.trim().to_string()).filter(|f| !f.is_empty()).collect();
        let da = schriften_vorhanden(&familien);
        let text: Vec<String> = familien.into_iter().zip(da).filter(|(_, d)| *d).map(|(f, _)| f).collect();
        if text.is_empty() {
            return None;
        }
        let formeln = if schriften_vorhanden(std::slice::from_ref(&formeln))[0] { formeln } else { String::new() };
        Some((text.join(", "), formeln))
    });
    *SCHRIFT.write().unwrap_or_else(|e| e.into_inner()) = schrift;
}

/// Welche der genannten Schriftfamilien installiert oder eingebaut sind.
pub fn schriften_vorhanden(familien: &[String]) -> Vec<bool> {
    familien.iter().map(|f| FONTS.book().select_family(&f.to_lowercase()).next().is_some()).collect()
}

/// Common `@preview` packages (CeTZ, Fletcher, Lilaq, Physica, Zero, …) ship
/// inside the app, so they work offline from the first use. See
/// `packages/README.md` for the list and how to add more.
static BUNDLED: include_dir::Dir<'static> = include_dir::include_dir!("$CARGO_MANIFEST_DIR/packages");

/// Copies the bundled packages into the Typst package cache (`<cache>/preview/
/// <name>/<version>`). Versions already there are left alone. Each version is
/// written to a temporary folder first and renamed, so a crash never leaves a
/// half-written package behind.
pub fn install_bundled_packages(cache: &std::path::Path) -> std::io::Result<usize> {
    fn write_all(dir: &include_dir::Dir, strip: &std::path::Path, target: &std::path::Path) -> std::io::Result<()> {
        for file in dir.files() {
            let rel = file.path().strip_prefix(strip).unwrap_or(file.path());
            let out = target.join(rel);
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(out, file.contents())?;
        }
        for sub in dir.dirs() {
            write_all(sub, strip, target)?;
        }
        Ok(())
    }

    let mut installed = 0;
    for namespace in BUNDLED.dirs() {
        for name in namespace.dirs() {
            for version in name.dirs() {
                let target = cache.join(version.path());
                if target.exists() {
                    continue;
                }
                let Some(parent) = target.parent() else { continue };
                let label = version.path().file_name().and_then(|n| n.to_str()).unwrap_or("paket");
                let tmp = parent.join(format!(".{label}.neotypst-tmp"));
                let _ = std::fs::remove_dir_all(&tmp);
                write_all(version, version.path(), &tmp)?;
                std::fs::rename(&tmp, &target)?;
                installed += 1;
            }
        }
    }
    Ok(installed)
}

/// Packages from `@preview` are downloaded on first use and cached in the
/// standard Typst cache directory (shared with the Typst CLI). Bundled
/// packages are put there first, so they never need the network.
static PACKAGES: LazyLock<SystemPackages> = LazyLock::new(|| {
    if let Some(cache) = FsPackages::system_cache()
        && let Err(e) = install_bundled_packages(cache.path())
    {
        eprintln!("Mitgelieferte Pakete konnten nicht bereitgestellt werden: {e}");
    }
    // @local/stil immer in der Fassung dieser App.
    if let Some(data) = FsPackages::system_data()
        && let Err(e) = crate::stil::paket_bereitstellen(data.path())
    {
        eprintln!("@local/stil konnte nicht bereitgestellt werden: {e}");
    }
    let agent = format!("neotypst/{}", env!("CARGO_PKG_VERSION"));
    SystemPackages::from_parts(
        FsPackages::system_data(),
        FsPackages::system_cache(),
        UniversePackages::new(SystemDownloader::new(agent)),
    )
});

/// Bereitet Pakete und Schriften im Hintergrund vor (beim App-Start), damit
/// das erste Kompilieren nicht darauf wartet.
pub fn vorbereiten() {
    LazyLock::force(&FONTS);
    LazyLock::force(&PACKAGES);
}

/// Loads project files from disk, but prefers in-memory editor buffers.
pub struct ProjectFiles {
    project: FsRoot,
    overlay: HashMap<FileId, String>,
}

impl FileLoader for ProjectFiles {
    fn load(&self, id: FileId) -> FileResult<Bytes> {
        if let Some(text) = self.overlay.get(&id) {
            return Ok(Bytes::from_string(text.clone()));
        }
        match id.root() {
            VirtualRoot::Project => self.project.load(id.vpath()),
            VirtualRoot::Package(spec) => PACKAGES.obtain(spec)?.load(id.vpath()),
        }
    }
}

pub struct EditorWorld {
    root: PathBuf,
    solutions: bool,
    main: FileId,
    library: LazyHash<Library>,
    files: FileStore<ProjectFiles>,
    now: Time,
}

impl EditorWorld {
    pub fn new(root: &Path, main: &str) -> Result<Self, String> {
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        Ok(Self {
            main: file_id(main)?,
            solutions: false,
            library: LazyHash::new(build_library(false)),
            files: FileStore::new(ProjectFiles {
                project: FsRoot::new(root.clone()),
                overlay: HashMap::new(),
            }),
            now: Time::system(),
            root,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn set_main(&mut self, main: &str) -> Result<(), String> {
        self.main = file_id(main)?;
        Ok(())
    }

    /// Switches `sys.inputs.loesungen` (used by the worksheet templates).
    pub fn set_solutions(&mut self, on: bool) {
        self.solutions = on;
        self.library = LazyHash::new(build_library(on));
    }

    /// Nach einer geänderten Dokumentschrift die Eingaben neu setzen.
    pub fn refresh_inputs(&mut self) {
        self.library = LazyHash::new(build_library(self.solutions));
    }

    /// Replaces the in-memory content of a project file.
    pub fn set_buffer(&mut self, rel: &str, text: String) -> Result<FileId, String> {
        let id = file_id(rel)?;
        self.files.loader_mut().overlay.insert(id, text);
        Ok(id)
    }

    /// Drops an in-memory buffer (e.g. after the file was saved or deleted).
    pub fn drop_buffer(&mut self, rel: &str) {
        if let Ok(id) = file_id(rel) {
            self.files.loader_mut().overlay.remove(&id);
        }
    }

    /// Drops all buffers at or below a path (after a folder was moved or deleted).
    pub fn drop_buffers_under(&mut self, rel: &str) {
        let prefix = format!("{}/", rel.trim_end_matches('/'));
        self.files.loader_mut().overlay.retain(|id, _| match id.root() {
            VirtualRoot::Project => {
                let p = id.vpath().get_without_slash();
                p != rel && !p.starts_with(&prefix)
            }
            _ => true,
        });
    }

    /// Prepare for a new compilation: re-read changed files, refresh the clock.
    pub fn reset(&mut self) {
        self.files.reset();
        self.now.reset();
    }

    /// Project-relative path for a file id (None for package files).
    pub fn rel_path(&self, id: FileId) -> Option<String> {
        match id.root() {
            VirtualRoot::Project => Some(id.vpath().get_without_slash().to_string()),
            VirtualRoot::Package(_) => None,
        }
    }
}

pub fn file_id(rel: &str) -> Result<FileId, String> {
    let vpath = VirtualPath::new(rel).map_err(|e| format!("{e:?}"))?;
    Ok(RootedPath::new(VirtualRoot::Project, vpath).intern())
}

fn build_library(solutions: bool) -> Library {
    let mut inputs = Dict::new();
    inputs.insert("loesungen".into(), (if solutions { "true" } else { "false" }).into_value());
    inputs.insert("editor".into(), "neotypst".into_value());
    // Von stil.typ gelesen, wenn im Dokument keine `schrift` angegeben ist.
    if let Some((text, formeln)) = SCHRIFT.read().unwrap_or_else(|e| e.into_inner()).as_ref() {
        inputs.insert("neotypst-schrift".into(), text.as_str().into_value());
        if !formeln.is_empty() {
            inputs.insert("neotypst-formeln".into(), formeln.as_str().into_value());
        }
    }
    Library::builder().with_inputs(inputs).build()
}

impl World for EditorWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        FONTS.book()
    }

    fn main(&self) -> FileId {
        self.main
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        self.files.source(id)
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        self.files.file(id)
    }

    fn font(&self, index: usize) -> Option<Font> {
        FONTS.font(index)
    }

    fn today(&self, offset: Option<Duration>) -> Option<Datetime> {
        self.now.today(offset)
    }
}

impl typst_ide::IdeWorld for EditorWorld {
    fn upcast(&self) -> &dyn World {
        self
    }

    fn files(&self) -> Vec<FileId> {
        let mut out = Vec::new();
        for rel in crate::project::walk_files(&self.root) {
            if let Ok(id) = file_id(&rel) {
                out.push(id);
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    /// The bundled packages land in an empty cache once, with their files
    /// complete, and a second run leaves them alone.
    #[test]
    fn bundled_packages_install_once() {
        let cache = std::env::temp_dir().join("neotypst-paket-cache-test");
        let _ = std::fs::remove_dir_all(&cache);
        let first = super::install_bundled_packages(&cache).unwrap();
        assert!(first >= 10, "nur {first} Pakete bereitgestellt");
        for pkg in ["cetz/0.5.3", "fletcher/0.6.0", "lilaq/0.6.0", "physica/0.9.5", "zero/0.6.1"] {
            let dir = cache.join("preview").join(pkg);
            assert!(dir.join("typst.toml").is_file(), "{pkg} fehlt");
        }
        assert!(cache.join("preview/cetz/0.5.3/cetz-core/cetz_core.wasm").is_file());
        assert_eq!(super::install_bundled_packages(&cache).unwrap(), 0);
        let leftovers = std::fs::read_dir(cache.join("preview/cetz")).unwrap()
            .filter(|e| e.as_ref().unwrap().file_name().to_string_lossy().contains("neotypst-tmp"))
            .count();
        assert_eq!(leftovers, 0);
    }
}
