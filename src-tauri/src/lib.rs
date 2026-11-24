mod bib;
mod engine;
mod format;
mod graphics;
mod history;
mod project;
mod spell;
mod stil;
mod symbols;
mod table;
mod templates;
mod world;

use std::path::PathBuf;
use std::sync::Mutex;

use engine::{CompileOut, CompletionsOut, EngineHandle, JumpOut, PosOut};
use tauri::State;

struct AppState {
    engine: EngineHandle,
    root: Mutex<Option<PathBuf>>,
    previews: Mutex<std::collections::HashMap<String, String>>,
}

impl AppState {
    fn root(&self) -> Result<PathBuf, String> {
        self.root.lock().unwrap().clone().ok_or_else(|| "Kein Projekt geöffnet".into())
    }
}

// ---------- Projekte ----------

#[tauri::command]
fn projects_dir() -> Result<String, String> {
    Ok(project::projects_dir()?.to_string_lossy().into_owned())
}

#[tauri::command]
fn list_projects() -> Result<Vec<project::ProjectInfo>, String> {
    project::list_projects()
}

#[tauri::command]
async fn list_templates() -> Vec<templates::TemplateInfo> {
    templates::list()
}

#[tauri::command]
async fn template_preview(state: State<'_, AppState>, id: String) -> Result<String, String> {
    if let Some(svg) = state.previews.lock().unwrap().get(&id) {
        return Ok(svg.clone());
    }
    let key = id.clone();
    let svg = state.engine.run(move |_| templates::preview_svg(&key)).await?;
    // Built-in previews never change; user templates are re-rendered on restart.
    state.previews.lock().unwrap().insert(id, svg.clone());
    Ok(svg)
}

#[tauri::command]
fn save_as_template(state: State<'_, AppState>, name: String, description: String) -> Result<String, String> {
    templates::save_project_as_template(&state.root()?, &name, &description)
}

#[tauri::command]
fn templates_dir() -> Result<String, String> {
    Ok(templates::user_dir()?.to_string_lossy().into_owned())
}

#[tauri::command]
fn create_project(name: String, template: String, fields: Vec<(String, String)>) -> Result<String, String> {
    project::create_project(&name, &template, &fields)
}

#[derive(serde::Serialize)]
struct OpenedProject {
    root: String,
    name: String,
    main: String,
    files: Vec<project::FileEntry>,
}

#[tauri::command]
async fn open_project(state: State<'_, AppState>, path: String) -> Result<OpenedProject, String> {
    let root = PathBuf::from(&path).canonicalize().map_err(|e| e.to_string())?;
    let files = project::walk_files(&root);
    let main = if files.iter().any(|f| f == "main.typ") {
        "main.typ".to_string()
    } else {
        files.iter().find(|f| f.ends_with(".typ")).cloned().ok_or("Keine .typ-Datei im Ordner")?
    };
    let (r, m) = (root.clone(), main.clone());
    state.engine.run(move |e| e.open(r, m)).await?;
    *state.root.lock().unwrap() = Some(root.clone());
    Ok(OpenedProject {
        name: root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        root: root.to_string_lossy().into_owned(),
        main,
        files: project::list_files(&root),
    })
}

#[tauri::command]
async fn close_project(state: State<'_, AppState>) -> Result<(), String> {
    *state.root.lock().unwrap() = None;
    state.engine.run(|e| e.close()).await;
    Ok(())
}

// ---------- Dateien ----------

#[tauri::command]
fn list_files(state: State<'_, AppState>) -> Result<Vec<project::FileEntry>, String> {
    Ok(project::list_files(&state.root()?))
}

#[tauri::command]
fn read_file(state: State<'_, AppState>, rel: String) -> Result<String, String> {
    project::read_text(&state.root()?, &rel)
}

/// Speichert und gibt die neue Prüfsumme zurück. Mit `expected` verweigert es
/// das Speichern, wenn die Datei inzwischen von außen geändert wurde.
#[tauri::command]
fn write_file(state: State<'_, AppState>, rel: String, text: String, expected: Option<String>) -> Result<String, String> {
    project::save_text(&state.root()?, &rel, &text, expected.as_deref(), history::jetzt())
}

// ---------- Stil ----------

#[tauri::command]
fn stil_status(state: State<'_, AppState>) -> Result<Vec<stil::StilDatei>, String> {
    Ok(stil::status(&state.root()?))
}

#[tauri::command]
fn stil_bundled(path: String) -> Result<String, String> {
    stil::mitgeliefert(&path).map(str::to_string)
}

/// Ersetzt Stil-Dateien im offenen Projekt; der Compiler vergisst seine Puffer davon.
#[tauri::command]
async fn stil_update(state: State<'_, AppState>, paths: Vec<String>) -> Result<Vec<String>, String> {
    let done = stil::aktualisieren(&state.root()?, &paths)?;
    for rel in done.clone() {
        state.engine.run(move |e| e.drop_buffer(rel)).await?;
    }
    Ok(done)
}

#[tauri::command]
fn stil_scan_all() -> Result<Vec<stil::ProjektStil>, String> {
    stil::alle_projekte()
}

#[tauri::command]
fn stil_update_project(path: String, paths: Vec<String>) -> Result<Vec<String>, String> {
    let root = std::path::PathBuf::from(&path);
    let base = project::projects_dir()?;
    if !root.starts_with(&base) {
        return Err("Projekt liegt nicht im Projektordner".into());
    }
    stil::aktualisieren(&root, &paths)
}

#[tauri::command]
fn open_text(state: State<'_, AppState>, rel: String) -> Result<project::Opened, String> {
    project::open_text(&state.root()?, &rel)
}

#[tauri::command]
fn file_hash(state: State<'_, AppState>, rel: String) -> Result<Option<String>, String> {
    project::file_hash(&state.root()?, &rel)
}

#[tauri::command]
fn history_list(state: State<'_, AppState>, rel: String) -> Result<Vec<history::Stand>, String> {
    history::liste(&state.root()?, &rel)
}

#[tauri::command]
fn history_read(state: State<'_, AppState>, rel: String, id: String) -> Result<String, String> {
    history::lesen(&state.root()?, &rel, &id)
}

/// Sichert einen Stand, etwa den Editor-Inhalt vor dem Neuladen.
#[tauri::command]
fn history_snapshot(state: State<'_, AppState>, rel: String, text: String, reason: String) -> Result<bool, String> {
    history::sichern(&state.root()?, &rel, &text, &reason, history::jetzt())
}

#[tauri::command]
fn create_file(state: State<'_, AppState>, rel: String) -> Result<(), String> {
    project::create_file(&state.root()?, &rel)
}

#[tauri::command]
async fn rename_file(state: State<'_, AppState>, from: String, to: String) -> Result<(), String> {
    project::rename(&state.root()?, &from, &to)?;
    state.engine.run(move |e| e.drop_buffer(from)).await
}

#[tauri::command]
fn create_dir(state: State<'_, AppState>, rel: String) -> Result<(), String> {
    project::create_dir(&state.root()?, &rel)
}

#[tauri::command]
fn duplicate_file(state: State<'_, AppState>, rel: String) -> Result<String, String> {
    project::duplicate(&state.root()?, &rel)
}

/// Moves a file or folder to the Trash; returns its path there (for undo).
#[tauri::command]
async fn trash_file(state: State<'_, AppState>, rel: String) -> Result<String, String> {
    let trashed = project::trash(&state.root()?, &rel)?;
    state.engine.run(move |e| e.drop_buffer(rel)).await?;
    Ok(trashed)
}

#[tauri::command]
fn restore_file(state: State<'_, AppState>, trashed: String, rel: String) -> Result<(), String> {
    project::restore(&state.root()?, &trashed, &rel)
}

#[tauri::command]
fn import_files(state: State<'_, AppState>, paths: Vec<String>, subdir: String) -> Result<Vec<String>, String> {
    project::import_files(&state.root()?, &paths, &subdir)
}

/// Pasted image: raw bytes as the request body, the file name in the `x-name` header.
#[tauri::command]
fn save_asset(state: State<'_, AppState>, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("Keine Bilddaten".into()) };
    let name = request.headers().get("x-name").and_then(|v| v.to_str().ok()).unwrap_or("image.png");
    let name = percent_decode(name);
    project::save_asset(&state.root()?, &name, bytes)
}

/// Header values are ASCII; the frontend percent-encodes the file name.
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[tauri::command]
async fn format_typst(text: String, from: Option<usize>, to: Option<usize>, width: Option<usize>) -> Result<Option<format::Formatted>, String> {
    let sel = from.zip(to);
    tauri::async_runtime::spawn_blocking(move || format::format(&text, sel, width.unwrap_or(80)))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn absolute_path(state: State<'_, AppState>, rel: String) -> Result<String, String> {
    Ok(project::resolve(&state.root()?, &rel)?.to_string_lossy().into_owned())
}

// ---------- Compiler ----------

#[tauri::command]
async fn compile(state: State<'_, AppState>, rel: Option<String>, text: Option<String>) -> Result<CompileOut, String> {
    state.engine.run(move |e| e.compile(rel, text)).await
}

#[tauri::command]
async fn set_main(state: State<'_, AppState>, rel: String) -> Result<(), String> {
    state.engine.run(move |e| e.set_main(rel)).await
}

#[tauri::command]
async fn set_solutions(state: State<'_, AppState>, on: bool) -> Result<(), String> {
    state.engine.run(move |e| e.set_solutions(on)).await
}

#[tauri::command]
async fn forget_preview(state: State<'_, AppState>) -> Result<(), String> {
    state.engine.run(|e| e.forget_preview()).await
}

#[tauri::command]
async fn jump_from_click(state: State<'_, AppState>, page: usize, x: f64, y: f64) -> Result<Option<JumpOut>, String> {
    state.engine.run(move |e| e.jump_from_click(page, x, y)).await
}

#[tauri::command]
async fn jump_from_cursor(state: State<'_, AppState>, rel: String, offset: usize) -> Result<Vec<PosOut>, String> {
    state.engine.run(move |e| e.jump_from_cursor(rel, offset)).await
}

#[tauri::command]
async fn complete(
    state: State<'_, AppState>,
    rel: String,
    text: String,
    offset: usize,
    explicit: bool,
) -> Result<Option<CompletionsOut>, String> {
    state.engine.run(move |e| e.complete(rel, text, offset, explicit)).await
}

#[tauri::command]
async fn math_word(
    state: State<'_, AppState>,
    rel: String,
    text: String,
    offset: usize,
) -> Result<Option<engine::MathWord>, String> {
    state.engine.run(move |e| e.math_word(rel, text, offset)).await
}

#[tauri::command]
async fn export_pdf(state: State<'_, AppState>, both: bool, target: Option<String>) -> Result<Vec<String>, String> {
    let target = target.map(std::path::PathBuf::from);
    state.engine.run(move |e| e.export_pdf(both, target)).await
}

#[tauri::command]
async fn highlight(text: String) -> Vec<(usize, usize, &'static str)> {
    engine::highlight(&text)
}

#[tauri::command]
async fn table_at(text: String, offset: usize) -> table::TableAt {
    table::table_at(&text, offset)
}

#[tauri::command]
async fn matrix_at(text: String, offset: usize) -> Option<table::MatrixAt> {
    table::matrix_at(&text, offset)
}

#[tauri::command]
async fn symbols() -> Vec<(String, String)> {
    symbols::all()
}

#[tauri::command]
async fn mode_at(text: String, offset: usize) -> &'static str {
    symbols::mode_at(&text, offset)
}

#[tauri::command]
async fn render_snippet(state: State<'_, AppState>, code: String, key: Option<String>) -> Result<String, String> {
    let _ = key; // only used by the browser mock
    state.engine.run(move |_| graphics::render_snippet(&code)).await
}

/// Hunspell runs on a worker thread; on macOS the system dictionary is then
/// asked on the main thread, as AppKit expects.
#[tauri::command]
async fn spellcheck(app: tauri::AppHandle, text: String, mode: String, allowed: Vec<String>) -> Result<spell::SpellResult, String> {
    let pending = tauri::async_runtime::spawn_blocking(move || spell::find(&text, &mode, &allowed))
        .await
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    let pending = {
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let mut pending = pending;
            spell::system_pass(&mut pending);
            let _ = tx.send(pending);
        })
        .map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())?
    };
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    tauri::async_runtime::spawn_blocking(move || spell::suggest(pending, std::time::Duration::from_millis(300)))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn learn_word(word: String) -> Result<(), String> {
    spell::learn(&word)
}

#[tauri::command]
fn bib_overview(state: State<'_, AppState>) -> Result<bib::BibOverview, String> {
    Ok(bib::overview(&state.root()?))
}

#[tauri::command]
async fn bib_lookup(query: String, taken: Vec<String>) -> Result<bib::Lookup, String> {
    tauri::async_runtime::spawn_blocking(move || bib::lookup(&query, &taken)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn bib_append(state: State<'_, AppState>, file: String, bibtex: String) -> Result<(), String> {
    bib::append(&state.root()?, &file, &bibtex)
}

#[tauri::command]
fn bib_styles() -> Vec<(&'static str, &'static str)> {
    bib::STYLES.to_vec()
}

#[tauri::command]
fn bib_make_key(authors: Vec<String>, year: Option<i32>, title: String, taken: Vec<String>) -> String {
    bib::make_key(&authors, year, &title, &taken)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Discover fonts in the background so the first compile doesn't wait.
    std::thread::spawn(|| {
        std::sync::LazyLock::force(&world::FONTS);
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            use tauri::Manager;
            // Bundled dictionaries and the user's own word list ("Zum Wörterbuch").
            let dictionaries = app.path().resource_dir().map(|d| d.join("dictionaries")).unwrap_or_default();
            spell::init(dictionaries, app.path().app_data_dir()?.join("woerterbuch.txt"));
            Ok(())
        })
        .manage(AppState { engine: EngineHandle::spawn(), root: Mutex::new(None), previews: Default::default() })
        .invoke_handler(tauri::generate_handler![
            projects_dir,
            list_projects,
            list_templates,
            create_project,
            open_project,
            close_project,
            list_files,
            read_file,
            write_file,
            open_text,
            stil_status,
            stil_bundled,
            stil_update,
            stil_scan_all,
            stil_update_project,
            file_hash,
            history_list,
            history_read,
            history_snapshot,
            create_file,
            rename_file,
            import_files,
            create_dir,
            duplicate_file,
            trash_file,
            restore_file,
            absolute_path,
            save_asset,
            format_typst,
            compile,
            set_main,
            set_solutions,
            forget_preview,
            jump_from_click,
            jump_from_cursor,
            complete,
            export_pdf,
            highlight,
            table_at,
            matrix_at,
            symbols,
            bib_overview,
            bib_lookup,
            bib_append,
            bib_styles,
            bib_make_key,
            spellcheck,
            learn_word,
            render_snippet,
            mode_at,
            math_word,
            template_preview,
            save_as_template,
            templates_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NeoTypst");
}
