//! The Typst `World`: gives the compiler access to project files, packages,
//! fonts and — crucially for a live editor — unsaved editor buffers.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

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

/// Packages from `@preview` are downloaded on first use and cached in the
/// standard Typst cache directory (shared with the Typst CLI).
static PACKAGES: LazyLock<SystemPackages> = LazyLock::new(|| {
    let agent = format!("neotypst/{}", env!("CARGO_PKG_VERSION"));
    SystemPackages::from_parts(
        FsPackages::system_data(),
        FsPackages::system_cache(),
        UniversePackages::new(SystemDownloader::new(agent)),
    )
});

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
        self.library = LazyHash::new(build_library(on));
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
