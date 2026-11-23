import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, type ProjectInfo, type Template } from "./api";
import { Icon } from "./icons";
import { kbd, modKey } from "./platform";

/** Schematic page previews for the template cards. */
export function TemplateThumb({ id }: { id: string }) {
  const ink = "var(--text-2)";
  const acc = "var(--accent)";
  const soft = "var(--line-strong)";
  const line = (y: number, w = 44, x = 10, c = soft, h = 2) => <rect x={x} y={y} width={w} height={h} rx={1} fill={c} />;
  return (
    <svg viewBox="0 0 64 88">
      <rect x="0.5" y="0.5" width="63" height="87" rx="1.5" fill="#fff" stroke="rgba(0,0,0,.06)" />
      {id === "arbeitsblatt" && (
        <>
          {line(8, 18, 10, ink, 3)}
          {line(13, 44, 10, acc, 0.8)}
          {line(20, 7, 10, acc, 2)}
          {line(24, 40)}
          {line(28, 34)}
          <rect x="10" y="33" width="44" height="12" fill="none" stroke={soft} strokeWidth="0.5" />
          <path d="M14 33v12M18 33v12M22 33v12M26 33v12M30 33v12M34 33v12M38 33v12M42 33v12M46 33v12M50 33v12M10 37h44M10 41h44" stroke={soft} strokeWidth="0.3" />
          {line(51, 7, 10, acc, 2)}
          {line(55, 38)}
          <rect x="10" y="60" width="44" height="13" rx="1" fill="none" stroke={soft} strokeWidth="0.6" />
          <path d="M10 64.5h44M10 68.5h44M25 60v13M40 60v13" stroke={soft} strokeWidth="0.5" />
        </>
      )}
      {id === "hausaufgabe" && (
        <>
          {line(8, 22, 10, ink, 3)}
          {line(8, 10, 44, soft)}
          {line(14, 44, 10, soft, 0.6)}
          {line(21, 8, 10, acc)}
          {line(25, 40, 10, "var(--line)")}
          {line(30, 44)}
          {line(34, 38)}
          <rect x="18" y="38.5" width="18" height="5" rx="1" fill="none" stroke={acc} strokeWidth="0.6" />
          {line(50, 8, 10, acc)}
          {line(54, 36, 10, "var(--line)")}
          {line(59, 44)}
          {line(63, 30)}
          {line(67, 40)}
        </>
      )}
      {id === "wettbewerb" && (
        <>
          {line(6, 44, 10, soft, 0.6)}
          {line(12, 20, 10, ink, 3)}
          <rect x="10" y="19" width="0.8" height="10" fill={soft} />
          {line(20, 40, 13)}
          {line(24, 32, 13)}
          {line(34, 12, 10, acc)}
          {line(38, 44)}
          {line(42, 36)}
          {line(50, 9, 10, acc)}
          {line(54, 44)}
          {line(58, 40)}
          {line(62, 44)}
          {line(66, 28)}
          <rect x="50" y="66" width="4" height="4" fill="none" stroke={ink} strokeWidth="0.6" />
        </>
      )}
      {id === "dokumentation" && (
        <>
          {line(28, 34, 10, ink, 4)}
          {line(35, 22, 10, soft, 2)}
          {line(41, 10, 10, acc, 1.5)}
          {line(70, 18, 10, soft, 1.5)}
          {line(74, 12, 10, soft, 1.5)}
        </>
      )}
      {id === "leer" && (
        <>
          {line(10, 22, 10, ink, 3)}
          {line(18, 44)}
          {line(22, 40)}
          {line(26, 44)}
          {line(30, 30)}
        </>
      )}
    </svg>
  );
}

function relative(secs: number) {
  const d = Date.now() / 1000 - secs;
  if (d < 60) return "gerade eben";
  if (d < 3600) return `vor ${Math.floor(d / 60)} min`;
  if (d < 86400) return `vor ${Math.floor(d / 3600)} h`;
  if (d < 86400 * 7) return `vor ${Math.floor(d / 86400)} Tagen`;
  return new Date(secs * 1000).toLocaleDateString("de-DE");
}

const previewCache = new Map<string, Promise<string>>();

/** First page of the template, rendered by Typst. Falls back to a sketch. */
export function TemplatePreview({ id }: { id: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let p = previewCache.get(id);
    if (!p) {
      p = api.templatePreview(id);
      previewCache.set(id, p);
      p.catch(() => previewCache.delete(id));
    }
    p.then((s) => alive && setSvg(s)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);
  if (!svg) return <TemplateThumb id={id} />;
  return <div className="tpl-page" dangerouslySetInnerHTML={{ __html: svg }} />;
}

const MEMORY = "neotypst.fieldMemory";
function loadMemory(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MEMORY) || "{}");
  } catch {
    return {};
  }
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const isoToGerman = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};

function initialValues(t: Template | undefined): Record<string, string> {
  const mem = loadMemory();
  const v: Record<string, string> = {};
  for (const f of t?.fields ?? []) {
    if (f.kind === "date") v[f.key] = todayIso();
    else if (f.remember && mem[f.key]) v[f.key] = mem[f.key];
    else v[f.key] = "";
  }
  return v;
}

export function NewProjectDialog({
  templates,
  initial,
  onClose,
  onCreated,
}: {
  templates: Template[];
  initial: string;
  onClose(): void;
  onCreated(path: string): void;
}) {
  const [tplId, setTplId] = useState(initial);
  const tpl = templates.find((t) => t.id === tplId) ?? templates[0];
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(tpl));
  const [folder, setFolder] = useState("");
  const [folderEdited, setFolderEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);

  const pick = (id: string) => {
    setTplId(id);
    const t = templates.find((x) => x.id === id);
    // Keep values for fields both templates share (e.g. title, name).
    setValues((old) => {
      const next = initialValues(t);
      for (const k of Object.keys(next)) if (old[k] && next[k] !== undefined && t?.fields.find((f) => f.key === k)?.kind !== "date") next[k] = old[k];
      return next;
    });
    setError(null);
  };

  useEffect(() => {
    firstInput.current?.focus();
  }, [tplId]);

  const titleField = tpl?.fields.find((f) => f.key === "titel");
  const suggestedFolder = (() => {
    const title = values.titel?.trim() || titleField?.default || tpl?.name || "";
    const extra = values.fach?.trim() || values.kurs?.trim();
    return extra && !title.includes(extra) ? `${extra} – ${title}` : title;
  })();
  const folderName = folderEdited ? folder : suggestedFolder;

  const create = async () => {
    if (!tpl || busy) return;
    if (!folderName.trim()) return setError("Bitte gib einen Titel oder Ordnernamen ein.");
    setBusy(true);
    const fields: [string, string][] = tpl.fields.map((f) => [f.key, f.kind === "date" ? isoToGerman(values[f.key] ?? "") : values[f.key] ?? ""]);
    try {
      const path = await api.createProject(folderName.trim(), tpl.id, fields);
      const mem = loadMemory();
      for (const f of tpl.fields) if (f.remember && values[f.key]?.trim()) mem[f.key] = values[f.key].trim();
      localStorage.setItem(MEMORY, JSON.stringify(mem));
      onCreated(path);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      create();
    }
    if (e.key === "Escape") onClose();
  };

  const groups = useMemo(() => {
    const m = new Map<string, Template[]>();
    for (const t of templates) m.set(t.category, [...(m.get(t.category) ?? []), t]);
    return [...m.entries()];
  }, [templates]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog new-project" onMouseDown={(e) => e.stopPropagation()}>
        <div className="np-list">
          {groups.map(([cat, ts]) => (
            <div key={cat}>
              <div className="np-cat">{cat}</div>
              {ts.map((t) => (
                <button key={t.id} className={"np-item" + (t.id === tplId ? " selected" : "")} onClick={() => pick(t.id)} onDoubleClick={create}>
                  <span className="np-mini">
                    <TemplatePreview id={t.id} />
                  </span>
                  <span className="np-text">
                    <b>{t.name}</b>
                    <span>{t.description || (t.user ? "Eigene Vorlage" : "")}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="np-main">
          <div className="np-preview">
            {tpl && <TemplatePreview id={tpl.id} />}
          </div>
          <div className="np-form">
            <h2>{tpl?.name ?? "Neues Projekt"}</h2>
            {tpl?.fields.map((f, i) => (
              <div className="field" key={tpl.id + f.key}>
                <label htmlFor={"f-" + f.key}>
                  {f.label}
                  {f.remember && <span className="remember" title="Wird fürs nächste Projekt gemerkt">gemerkt</span>}
                </label>
                <input
                  id={"f-" + f.key}
                  ref={i === 0 ? firstInput : undefined}
                  type={f.kind === "date" ? "date" : "text"}
                  list={f.kind === "choice" ? "opts-" + f.key : undefined}
                  placeholder={f.default || f.placeholder}
                  value={values[f.key] ?? ""}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [f.key]: e.target.value }));
                    setError(null);
                  }}
                  onKeyDown={onKey}
                />
                {f.kind === "choice" && (
                  <datalist id={"opts-" + f.key}>
                    {f.options.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                )}
              </div>
            ))}
            <div className="field folder-field">
              <label htmlFor="f-folder">Ordner</label>
              <div className="folder-input">
                <span>Typst/</span>
                <input
                  id="f-folder"
                  value={folderName}
                  onChange={(e) => {
                    setFolder(e.target.value);
                    setFolderEdited(true);
                    setError(null);
                  }}
                  onKeyDown={onKey}
                />
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
          </div>
          <div className="dialog-foot">
            <span className="dim">Leere Felder bekommen den grauen Vorschlag.</span>
            <div className="grow" />
            <button className="btn" onClick={onClose}>
              Abbrechen
            </button>
            <button className="btn primary" onClick={create} disabled={busy}>
              Erstellen <kbd style={{ background: "transparent", color: "inherit", borderColor: "rgba(255,255,255,.35)" }}>↩</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hub({ onOpen }: { onOpen(path: string): void }) {
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [dir, setDir] = useState("");
  const [dialog, setDialog] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects().then(setProjects).catch((e) => setError(String(e)));
    api.listTemplates().then(setTemplates);
    api.projectsDir().then(setDir);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modKey(e) && e.key === "n") {
        e.preventDefault();
        setDialog("arbeitsblatt");
      }
      if (modKey(e) && e.key === "o") {
        e.preventDefault();
        openFolder();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const openFolder = async () => {
    const picked = await open({ directory: true, defaultPath: dir || undefined, title: "Projektordner öffnen" });
    if (typeof picked === "string") onOpen(picked);
  };

  const filtered = useMemo(
    () => (projects ?? []).filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [projects, query],
  );

  return (
    <div className="hub">
      <div className="hub-drag" data-tauri-drag-region />
      <div className="hub-inner">
        <div className="hub-header">
          <div>
            <div className="wordmark">NeoTypst</div>
            <p className="sub">Typst für Arbeitsblätter, Aufgaben und Dokumentationen</p>
          </div>
          <div className="grow" />
          <button className="btn" onClick={openFolder}>
            <Icon.folderOpen /> Ordner öffnen <kbd>{kbd("⌘O")}</kbd>
          </button>
          <button className="btn primary" onClick={() => setDialog("arbeitsblatt")}>
            <Icon.plus /> Neues Projekt <kbd style={{ background: "transparent", color: "inherit", borderColor: "rgba(255,255,255,.35)" }}>{kbd("⌘N")}</kbd>
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h3 style={{ flex: 1 }}>Neu aus Vorlage</h3>
          <button className="btn ghost" style={{ marginTop: 18, color: "var(--muted)" }} onClick={() => api.templatesDir().then(revealItemInDir)}>
            <Icon.folder /> Eigene Vorlagen
          </button>
        </div>
        <div className="template-strip">
          {templates.map((t) => (
            <button key={t.id} className="tpl-card" onClick={() => setDialog(t.id)}>
              <div className="thumb">
                <TemplatePreview id={t.id} />
              </div>
              <div className="meta">
                <span className="cat">{t.category}</span>
                <b>{t.name}</b>
                <span>{t.description}</span>
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h3 style={{ flex: 1 }}>Projekte</h3>
          {projects && projects.length > 6 && (
            <input className="hub-search" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
          )}
        </div>
        {error && <div className="empty-note">{error}</div>}
        {projects && projects.length === 0 && (
          <div className="empty-note">
            Noch keine Projekte. Wähle oben eine Vorlage, um loszulegen.
            <br />
            <span style={{ fontSize: 12 }}>Projekte liegen in {dir}</span>
          </div>
        )}
        {filtered.length > 0 && (
          <div className="project-list">
            {filtered.map((p) => (
              <button key={p.path} className="project-row" onClick={() => onOpen(p.path)}>
                <Icon.folder />
                <span className="pname">{p.name}</span>
                <span className="pmeta">{p.files} Dateien</span>
                <span className="pmeta" style={{ width: 110, textAlign: "right" }}>
                  {relative(p.modified)}
                </span>
              </button>
            ))}
          </div>
        )}
        {projects && projects.length > 0 && (
          <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>Projektordner: {dir}</p>
        )}
      </div>
      {dialog && (
        <NewProjectDialog templates={templates} initial={dialog} onClose={() => setDialog(null)} onCreated={(path) => onOpen(path)} />
      )}
    </div>
  );
}
