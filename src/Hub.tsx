import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, type ProjektStil, type ProjectInfo, type Template } from "./api";
import { StilAlleDialog } from "./StilDialog";
import { Icon } from "./icons";
import { kbd, modKey } from "./platform";
import { setSettings, useSettings } from "./settings";
import { SCHRIFTEN, schriftAnwenden } from "./schriften";

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

const PROFILE = ["klassisch", "akademisch", "schlicht"] as const;

/** „Neues Blatt“: Vorlage wählen, Kopf ausfüllen, Satz einstellen, anlegen. */
function NewSheet({ templates, onCreated, focusKey }: { templates: Template[]; onCreated(path: string): void; focusKey: number }) {
  const settings = useSettings();
  const [tplId, setTplId] = useState("arbeitsblatt");
  const tpl = templates.find((t) => t.id === tplId) ?? templates[0];
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(tpl));
  const [profil, setProfil] = useState<(typeof PROFILE)[number]>("klassisch");
  const [folder, setFolder] = useState("");
  const [folderEdited, setFolderEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);

  // Erst wenn die Vorlagen geladen sind, stehen die Felder fest.
  const loaded = templates.length > 0;
  useEffect(() => {
    if (loaded) setValues(initialValues(templates.find((t) => t.id === tplId) ?? templates[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    if (focusKey > 0) firstInput.current?.focus();
  }, [focusKey]);

  const pick = (id: string) => {
    setTplId(id);
    const t = templates.find((x) => x.id === id);
    // Werte für Felder, die beide Vorlagen haben (Titel, Name), bleiben stehen.
    setValues((old) => {
      const next = initialValues(t);
      for (const k of Object.keys(next)) if (old[k] && t?.fields.find((f) => f.key === k)?.kind !== "date") next[k] = old[k];
      return next;
    });
    setError(null);
  };

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
    if (!tpl.user) fields.push(["profil", profil]);
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
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modKey(e) && e.key === "Enter") {
        e.preventDefault();
        create();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section className="sheet">
      <div className="sheet-head">
        <h1>Neues Blatt</h1>
        <span>alles lässt sich später ändern</span>
      </div>

      <h2 className="sheet-sec">
        <span>1</span>Vorlage
        <button className="link" onClick={() => api.templatesDir().then(revealItemInDir)}>
          Eigene Vorlagen
        </button>
      </h2>
      <div className="sheet-tpls">
        {templates.map((t) => (
          <button
            key={t.id}
            className={"sheet-tpl" + (t.id === tpl?.id ? " on" : "")}
            onClick={() => pick(t.id)}
            onDoubleClick={create}
            title={t.description}
          >
            <span className="thumb">
              <TemplatePreview id={t.id} />
            </span>
            <b>{t.name}</b>
            <span className="cat">{t.user ? "eigene" : t.category}</span>
          </button>
        ))}
      </div>

      <h2 className="sheet-sec">
        <span>2</span>Kopf
      </h2>
      <div className="sheet-fields">
        {tpl?.fields.map((f, i) => (
          <label key={tpl.id + f.key} className={"sheet-field" + (f.key === "titel" ? " wide" : "")}>
            <span>{f.label}</span>
            <input
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
          </label>
        ))}
      </div>

      <h2 className="sheet-sec">
        <span>3</span>Satz
      </h2>
      <div className="sheet-satz">
        {!tpl?.user && (
          <div className="sheet-choice" role="radiogroup" aria-label="Stilprofil">
            <span className="lbl">Profil</span>
            {PROFILE.map((p) => (
              <button key={p} role="radio" aria-checked={profil === p} className={profil === p ? "on" : ""} onClick={() => setProfil(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
        <label className="sheet-choice">
          <span className="lbl">Schrift</span>
          <select
            value={settings.schrift}
            onChange={(e) => {
              setSettings({ schrift: e.target.value });
              schriftAnwenden(e.target.value).catch(() => {});
            }}
          >
            {SCHRIFTEN.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="hint">gilt für alle Projekte</span>
        </label>
      </div>

      <div className="sheet-foot">
        <label className="sheet-folder">
          <span>Typst/</span>
          <input
            aria-label="Ordnername"
            value={folderName}
            onChange={(e) => {
              setFolder(e.target.value);
              setFolderEdited(true);
              setError(null);
            }}
            onKeyDown={onKey}
          />
        </label>
        {error && <span className="form-error">{error}</span>}
        <div className="grow" />
        <button className="btn primary big" onClick={create} disabled={busy || !tpl}>
          Blatt anlegen <kbd className="on-primary">{kbd("⌘↩")}</kbd>
        </button>
      </div>
    </section>
  );
}

export function Hub({ onOpen }: { onOpen(path: string): void }) {
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [dir, setDir] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stil, setStil] = useState<ProjektStil[]>([]);
  const [stilOpen, setStilOpen] = useState(false);
  const [focusNew, setFocusNew] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const veraltet = useMemo(() => new Set(stil.filter((p) => p.veraltet.length > 0).map((p) => p.path)), [stil]);

  useEffect(() => {
    api.listProjects().then(setProjects).catch((e) => setError(String(e)));
    api.stilScanAll().then(setStil, () => setStil([]));
    api.listTemplates().then(setTemplates);
    api.projectsDir().then(setDir);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modKey(e) && e.key === "n") {
        e.preventDefault();
        setFocusNew((n) => n + 1);
      }
      if (modKey(e) && e.key === "o") {
        e.preventDefault();
        openFolder();
      }
      if (modKey(e) && e.key === "k") {
        e.preventDefault();
        search.current?.focus();
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
  const anyOld = filtered.some((p) => veraltet.has(p.path));

  return (
    <div className="hub">
      <div className="hub-drag" data-tauri-drag-region />
      <header className="hub-header" data-tauri-drag-region>
        <div className="wordmark">NeoTypst</div>
        <div className="grow" data-tauri-drag-region />
        <label className="hub-search">
          <Icon.search />
          <input
            ref={search}
            placeholder="Projekte durchsuchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered[0]) onOpen(filtered[0].path);
              if (e.key === "Escape") setQuery("");
            }}
          />
          <kbd>{kbd("⌘K")}</kbd>
        </label>
        <button className="btn" onClick={openFolder}>
          Ordner öffnen <kbd>{kbd("⌘O")}</kbd>
        </button>
      </header>

      <main className="hub-main">
        <NewSheet templates={templates} onCreated={onOpen} focusKey={focusNew} />

        <section className="recent">
          <div className="recent-head">
            <h2>Weiterarbeiten</h2>
            {projects && <span>{projects.length === 1 ? "1 Projekt" : `${projects.length} Projekte`}</span>}
          </div>
          <div className="recent-table">
            <div className="recent-row recent-cols">
              <span>Projekt</span>
              <span>Dateien</span>
              <span>Geändert</span>
            </div>
            <div className="recent-body">
              {error && <div className="empty-note">{error}</div>}
              {projects && projects.length === 0 && <div className="empty-note">Noch keine Projekte. Links ein Blatt anlegen.</div>}
              {projects && projects.length > 0 && filtered.length === 0 && <div className="empty-note">Kein Projekt passt zu „{query}“.</div>}
              {filtered.map((p) => (
                <button key={p.path} className="recent-row" onClick={() => onOpen(p.path)}>
                  <span className="pname">
                    {p.name}
                    {veraltet.has(p.path) && (
                      <sup className="dagger" title="Stil veraltet">
                        †
                      </sup>
                    )}
                  </span>
                  <span className="num">{p.files}</span>
                  <span className="when">{relative(p.modified)}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="recent-foot">
            {anyOld || veraltet.size > 0 ? (
              <>
                <sup className="dagger">†</sup> Stil veraltet,{" "}
                <button className="link" onClick={() => setStilOpen(true)}>
                  {veraltet.size === 1 ? "Projekt aktualisieren" : `${veraltet.size} Projekte aktualisieren`}
                </button>
              </>
            ) : (
              <span className="path">{dir}</span>
            )}
          </p>
        </section>
      </main>
      {stilOpen && (
        <StilAlleDialog
          projects={stil}
          onClose={() => {
            setStilOpen(false);
            api.stilScanAll().then(setStil, () => {});
          }}
        />
      )}
    </div>
  );
}
