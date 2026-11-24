import type { Menu, Toast } from "./types";

/** Kontextmenü an einer Bildschirmposition. */
export function PopupMenu({ menu, onClose }: { menu: Menu; onClose(): void }) {
  return (
    <div
      className="menu"
      style={{
        left: Math.min(menu.x, window.innerWidth - 250),
        top: Math.max(8, Math.min(menu.y, window.innerHeight - 16 - menu.items.reduce((h, it) => h + (it === "sep" ? 11 : 28), 10))),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {menu.items.map((it, i) =>
        it === "sep" ? (
          <hr key={i} />
        ) : (
          <button
            key={i}
            className={it.danger ? "danger" : undefined}
            onClick={() => {
              onClose();
              it.run();
            }}
          >
            {it.label}
            {it.detail && <span className="detail">{it.detail}</span>}
          </button>
        ),
      )}
    </div>
  );
}

/** Meldung unten, mit optionalen Knöpfen. */
export function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss(): void }) {
  return (
    <div className={"toast" + (toast.kind === "error" ? " error" : "")}>
      <span>{toast.text}</span>
      {toast.actions?.map((a) => (
        <button
          key={a.label}
          onClick={() => {
            a.run();
            onDismiss();
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
