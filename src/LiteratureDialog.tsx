import { useEffect, useMemo, useRef, useState } from "react";
import { api, type BibEntry, type BibOverview } from "./api";
import { Icon } from "./icons";

type Props = {
  onCite(key: string, supplement?: string): void;
  onAdd(bibtex: string, target: string, overview: BibOverview): Promise<void>;
  onStyle(style: string, overview: BibOverview): Promise<void>;
  onClose(): void;
};

const looksLikeDoi = (q: string) => /(^|doi\.org\/|doi:)\s*10\.\d{4,}\/\S+/i.test(q.trim());
const looksLikeIsbn = (q: string) => {
  const d = q.replace(/[^0-9xX]/g, "");
  return /^[\d\s\-xXisbnISBN:]+$/.test(q.trim()) && (d.length === 10 || d.length === 13);
};

const KIND_LABEL: Record<string, string> = {
  article: "Artikel",
  book: "Buch",
  web: "Webseite",
  misc: "Sonstiges",
  thesis: "Abschlussarbeit",
  report: "Bericht",
  chapter: "Kapitel",
  proceedings: "Tagungsband",
  anthology: "Sammelband",
};

function authorsShort(a: string[]) {
  if (a.length === 0) return "";
  const last = (n: string) => n.split(" ").slice(-1)[0];
  if (a.length === 1) return last(a[0]);
  if (a.length === 2) return `${last(a[0])} & ${last(a[1])}`;
  return `${last(a[0])} et al.`;
}

type Manual = { kind: "book" | "article" | "online" | "misc"; authors: string; title: string; year: string; where: string; url: string };

const escape = (s: string) => s.replace(/[{}]/g, (c) => "\\" + c);

export function LiteratureDialog({ onCite, onAdd, onStyle, onClose }: Props) {
  const [ov, setOv] = useState<BibOverview | null>(null);
  const [styles, setStyles] = useState<[string, string][]>([]);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [preview, setPreview] = useState<{ bibtex: string; entry: BibEntry } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<{ key: string; value: string } | null>(null);
  const [manual, setManual] = useState<Manual | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const reload = () => api.bibOverview().then(setOv).catch((e) => setError(String(e)));
  useEffect(() => {
    reload();
    api.bibStyles().then(setStyles);
  }, []);

  const isLookup = looksLikeDoi(query) || looksLikeIsbn(query);
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = ov?.entries ?? [];
    if (!q || isLookup) return all;
    return all.filter((e) => `${e.key} ${e.title} ${e.authors.join(" ")} ${e.year ?? ""} ${e.container ?? ""}`.toLowerCase().includes(q));
  }, [ov, query, isLookup]);

  useEffect(() => setSel(0), [query]);
  useEffect(() => {
    list.current?.querySelector(".lit-row.selected")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const lookup = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.bibLookup(query, (ov?.entries ?? []).map((e) => e.key));
      setPreview(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const add = async (bibtex: string, cite: boolean, key: string) => {
    if (!ov) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(bibtex, ov.target, ov);
      setPreview(null);
      setManual(null);
      setQuery("");
      await reload();
      if (cite) onCite(key);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const manualToBib = async (m: Manual) => {
    const authors = m.authors
      .split(/;|\n/)
      .map((a) => a.trim())
      .filter(Boolean);
    const year = parseInt(m.year) || undefined;
    const key = await api.bibMakeKey(authors, year ?? null, m.title, (ov?.entries ?? []).map((e) => e.key));
    const fields: [string, string][] = [["title", m.title]];
    if (authors.length) fields.push(["author", authors.join(" and ")]);
    if (m.year) fields.push(["year", m.year]);
    if (m.where) fields.push([m.kind === "article" ? "journal" : m.kind === "online" ? "organization" : "publisher", m.where]);
    if (m.url) fields.push(["url", m.url]);
    if (m.kind === "online") fields.push(["urldate", new Date().toISOString().slice(0, 10)]);
    const body = fields.map(([k, v]) => `  ${k} = {${escape(v)}},`).join("\n");
    return { key, bibtex: `@${m.kind}{${key},\n${body}\n}` };
  };

  const current = entries[sel];

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog lit-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="lit-search">
          <Icon.search />
          <input
            ref={input}
            autoFocus
            placeholder="Literatur durchsuchen – oder DOI / ISBN einfügen, um eine Quelle hinzuzufügen"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPreview(null);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                if (page) setPage(null);
                else onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, entries.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (preview) add(preview.bibtex, true, preview.entry.key);
                else if (isLookup) lookup();
                else if (current) {
                  if (e.shiftKey) setPage({ key: current.key, value: "" });
                  else onCite(current.key);
                }
              }
            }}
          />
          <button className="btn" onClick={() => setManual({ kind: "book", authors: "", title: "", year: "", where: "", url: "" })}>
            <Icon.plus /> Manuell
          </button>
        </div>

        <div className="lit-body">
          {error && <div className="lit-error">{error}</div>}

          {isLookup && !preview && (
            <button className="lit-lookup" onClick={lookup} disabled={busy}>
              <Icon.search />
              {busy ? "Suche …" : `${looksLikeDoi(query) ? "DOI" : "ISBN"} nachschlagen und Daten übernehmen`}
              <kbd>↩</kbd>
            </button>
          )}

          {preview && (
            <div className="lit-preview">
              <div className="lit-kind">{KIND_LABEL[preview.entry.kind] ?? preview.entry.kind} gefunden</div>
              <b>{preview.entry.title}</b>
              <div className="dim">
                {preview.entry.authors.join(", ")}
                {preview.entry.year ? ` · ${preview.entry.year}` : ""}
                {preview.entry.container ? ` · ${preview.entry.container}` : ""}
              </div>
              <textarea spellCheck={false} value={preview.bibtex} onChange={(e) => setPreview({ ...preview, bibtex: e.target.value })} />
              <div className="lit-actions">
                <span className="dim">
                  Wird gespeichert in <code>{ov?.target}</code> als <code>@{preview.entry.key}</code>
                </span>
                <div className="grow" />
                <button className="btn" onClick={() => add(preview.bibtex, false, preview.entry.key)} disabled={busy}>
                  Nur hinzufügen
                </button>
                <button className="btn primary" onClick={() => add(preview.bibtex, true, preview.entry.key)} disabled={busy}>
                  Hinzufügen & zitieren <kbd className="on-primary">↩</kbd>
                </button>
              </div>
            </div>
          )}

          {manual && (
            <div className="lit-preview lit-manual">
              <div className="segmented">
                {(
                  [
                    ["book", "Buch"],
                    ["article", "Artikel"],
                    ["online", "Webseite"],
                    ["misc", "Sonstiges"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} className={manual.kind === k ? "on" : ""} onClick={() => setManual({ ...manual, kind: k })}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="lit-form">
                <div className="field">
                  <label>Titel</label>
                  <input autoFocus value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} />
                </div>
                <div className="field">
                  <label>Autor(en)</label>
                  <input placeholder="Nachname, Vorname; Nachname, Vorname" value={manual.authors} onChange={(e) => setManual({ ...manual, authors: e.target.value })} />
                </div>
                <div className="field">
                  <label>Jahr</label>
                  <input value={manual.year} onChange={(e) => setManual({ ...manual, year: e.target.value })} />
                </div>
                <div className="field">
                  <label>{manual.kind === "article" ? "Zeitschrift" : manual.kind === "online" ? "Website / Organisation" : "Verlag"}</label>
                  <input value={manual.where} onChange={(e) => setManual({ ...manual, where: e.target.value })} />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>URL {manual.kind === "online" ? "(Abrufdatum wird automatisch heute)" : "(optional)"}</label>
                  <input value={manual.url} onChange={(e) => setManual({ ...manual, url: e.target.value })} />
                </div>
              </div>
              <div className="lit-actions">
                <div className="grow" />
                <button className="btn" onClick={() => setManual(null)}>
                  Abbrechen
                </button>
                <button
                  className="btn primary"
                  disabled={!manual.title.trim() || busy}
                  onClick={async () => {
                    const { key, bibtex } = await manualToBib(manual);
                    add(bibtex, true, key);
                  }}
                >
                  Hinzufügen & zitieren
                </button>
              </div>
            </div>
          )}

          {!preview && !manual && (
            <div className="lit-list" ref={list}>
              {ov && ov.entries.length === 0 && (
                <div className="lit-empty">
                  <b>Noch keine Literatur in diesem Projekt.</b>
                  <span>
                    Füge oben eine DOI oder ISBN ein – die Daten werden automatisch geholt. Beim ersten Eintrag werden <code>literatur.bib</code> und{" "}
                    <code>#bibliography(…)</code> angelegt.
                  </span>
                </div>
              )}
              {entries.map((e, i) => (
                <div
                  key={e.file + e.key}
                  className={"lit-row" + (i === sel ? " selected" : "")}
                  onMouseMove={() => setSel(i)}
                  onDoubleClick={() => onCite(e.key)}
                >
                  <div className="lit-main">
                    <div className="lit-title">{e.title || <i>ohne Titel</i>}</div>
                    <div className="dim">
                      {authorsShort(e.authors)}
                      {e.year ? ` · ${e.year}` : ""}
                      {e.container ? ` · ${e.container}` : ""}
                    </div>
                  </div>
                  <code className="lit-key">@{e.key}</code>
                  {page?.key === e.key ? (
                    <input
                      className="lit-page"
                      autoFocus
                      placeholder="S. 12"
                      value={page.value}
                      onChange={(ev) => setPage({ ...page, value: ev.target.value })}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") {
                          const v = page.value.trim();
                          onCite(e.key, v ? (/^\d/.test(v) ? `S. ${v}` : v) : undefined);
                        }
                        if (ev.key === "Escape") {
                          setPage(null);
                          input.current?.focus();
                        }
                      }}
                    />
                  ) : (
                    <div className="lit-buttons">
                      <button className="btn ghost" title="Mit Seitenangabe zitieren (⇧↩)" onClick={() => setPage({ key: e.key, value: "" })}>
                        S.
                      </button>
                      <button className="btn" onClick={() => onCite(e.key)}>
                        Zitieren
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="symbol-foot">
          <span className="dim">
            {ov?.files.length ? `Quellen aus ${ov.files.join(", ")}` : "Neue Quellen landen in literatur.bib"}
            {ov && ov.errors.length > 0 && <span style={{ color: "var(--danger)" }}> · {ov.errors[0]}</span>}
          </span>
          <span className="grow" />
          <label className="dim" htmlFor="lit-style">
            Zitierstil
          </label>
          <select
            id="lit-style"
            className="lit-style"
            value={ov?.style ?? ""}
            disabled={!ov?.call_file}
            title={ov?.call_file ? "" : "Wird verfügbar, sobald ein #bibliography(…) im Dokument steht"}
            onChange={async (e) => {
              if (!ov) return;
              await onStyle(e.target.value, ov);
              reload();
            }}
          >
            <option value="">Standard (IEEE)</option>
            {styles.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
