import { Icon } from "../icons";

export type InsertAction = { id: string; label: string; title: string; run(): void; sep?: boolean };

/** Werkzeugleiste über dem Editor: die Bausteine eines Arbeitsblatts. */
export function InsertBar({ actions }: { actions: InsertAction[] }) {
  return (
    <div className="insertbar" role="toolbar" aria-label="Einfügen">
      {actions.map((a, i) => (
        <span key={a.id} style={{ display: "contents" }}>
          {a.sep && <span className="insert-sep" />}
          <button className="insert-btn" title={a.title} onClick={a.run}>
            {i === 0 && <Icon.plus />}
            {a.label}
          </button>
        </span>
      ))}
    </div>
  );
}
