import { useState } from "react";

/** Projekt als eigene Vorlage speichern: Name und Beschreibung. */
export function SaveTemplateDialog({
  initialName,
  onSave,
  onClose,
}: {
  initialName: string;
  /** Wirft bei Fehlern; die Meldung erscheint im Dialog. */
  onSave(name: string, description: string): Promise<void>;
  onClose(): void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog small-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>Als Vorlage speichern</h2>
          <p>
            Alle Dateien außer <code>out/</code> werden kopiert. Platzhalter wie <code>{"{{titel}}"}</code> oder <code>{"{{datum}}"}</code> in
            .typ-Dateien werden beim Anlegen ausgefüllt.
          </p>
        </div>
        <div className="dialog-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field">
            <label htmlFor="tpl-name">Name</label>
            <input
              id="tpl-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="tpl-desc">Beschreibung</label>
            <input id="tpl-desc" placeholder="optional" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="dialog-foot">
          <div className="grow" />
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            className="btn primary"
            onClick={() => onSave(name, description).catch((e) => setError(String(e)))}
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
