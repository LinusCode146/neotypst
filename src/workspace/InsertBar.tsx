import { Icon } from "../icons";

export type InsertAction = {
  id: string;
  label: string;
  title: string;
  run(): void;
  /** Trennstrich vor dem Knopf. */
  sep?: boolean;
  /** Pfeil daneben mit weiteren Varianten. */
  more?(anchor: DOMRect): void;
};

/** Werkzeugleiste über dem Editor: die Bausteine aus stil.typ und die Editoren. */
export function InsertBar({ actions }: { actions: InsertAction[] }) {
  return (
    <div className="insertbar" role="toolbar" aria-label="Einfügen">
      {actions.map((a, i) => (
        <span key={a.id} className={a.more ? "insert-group" : "insert-solo"}>
          {a.sep && <span className="insert-sep" />}
          <button className="insert-btn" title={a.title} onClick={a.run}>
            {i === 0 && <Icon.plus />}
            {a.label}
          </button>
          {a.more && (
            <button
              className="insert-btn insert-more"
              aria-label={`${a.label}: Varianten`}
              title="Varianten"
              onClick={(e) => {
                e.stopPropagation();
                a.more?.((e.currentTarget as HTMLElement).getBoundingClientRect());
              }}
            >
              <Icon.chevronDown />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
