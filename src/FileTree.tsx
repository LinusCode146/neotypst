import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { FileEntry } from "./api";
import { Icon } from "./icons";

export type MenuItem = { label: string; detail?: string; danger?: boolean; run(): void } | "sep";

export type TreeActions = {
  open(rel: string, kind: FileEntry["kind"]): void;
  insertImage(rel: string): void;
  setMain(rel: string): void;
  openExternal(rel: string): void;
  reveal(rel: string): void;
  copyPath(rel: string): void;
  createFile(rel: string): Promise<string | null>;
  createDir(rel: string): Promise<boolean>;
  rename(from: string, to: string): Promise<boolean>;
  duplicate(rel: string): Promise<string | null>;
  trash(rel: string): Promise<void>;
  showMenu(x: number, y: number, items: MenuItem[]): void;
};

type Props = {
  projectRoot: string;
  files: FileEntry[];
  current: string | null;
  main: string;
  actions: TreeActions;
  /** Bumped from outside (command palette) to start creating a file or folder. */
  request?: { kind: "file" | "dir"; n: number } | null;
};

type Node = { path: string; name: string; kind: FileEntry["kind"]; depth: number; children: Node[] };
type Row = { node: Node; match?: [number, number] };
type Editing = { mode: "rename"; path: string } | { mode: "new"; kind: "file" | "dir"; parent: string } | null;

export function fileIcon(kind: FileEntry["kind"]) {
  switch (kind) {
    case "typ":
      return <Icon.typ />;
    case "image":
      return <Icon.image />;
    case "pdf":
      return <Icon.pdf />;
    default:
      return <Icon.file />;
  }
}

const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const isInside = (p: string, dir: string) => dir === "" || p === dir || p.startsWith(dir + "/");

function buildTree(files: FileEntry[]): Node[] {
  const root: Node = { path: "", name: "", kind: "dir", depth: -1, children: [] };
  const dirs = new Map<string, Node>([["", root]]);
  const ensureDir = (path: string): Node => {
    const hit = dirs.get(path);
    if (hit) return hit;
    const parent = ensureDir(parentOf(path));
    const node: Node = { path, name: baseName(path), kind: "dir", depth: parent.depth + 1, children: [] };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };
  for (const f of files) {
    if (f.kind === "dir") ensureDir(f.path);
    else {
      const parent = ensureDir(parentOf(f.path));
      parent.children.push({ path: f.path, name: baseName(f.path), kind: f.kind, depth: parent.depth + 1, children: [] });
    }
  }
  const sort = (n: Node) => {
    n.children.sort((a, b) => (a.kind === "dir") !== (b.kind === "dir") ? (a.kind === "dir" ? -1 : 1) : collator.compare(a.name, b.name));
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

export function FileTree({ projectRoot, files, current, main, actions, request }: Props) {
  const storeKey = "neotypst.tree." + projectRoot;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
    return new Set(["out"]);
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [query, setQuery] = useState("");
  const [drag, setDrag] = useState<{ path: string; target: string | null; x: number; y: number } | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const suppressClick = useRef(false);
  /** Set once Enter/Escape handled the edit, so the following blur does nothing. */
  const editDone = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify([...collapsed]));
    } catch {
      /* ignore */
    }
  }, [collapsed, storeKey]);

  const tree = useMemo(() => buildTree(files), [files]);

  useEffect(() => {
    if (request) startNew(request.kind, selectedDir());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.n]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const q = query.trim().toLowerCase();
    if (q) {
      // Matching files with all their folders, everything expanded.
      const walk = (nodes: Node[]): Row[] => {
        const res: Row[] = [];
        for (const n of nodes) {
          if (n.kind === "dir") {
            const inner = walk(n.children);
            const i = n.name.toLowerCase().indexOf(q);
            if (inner.length || i >= 0) res.push({ node: n, match: i >= 0 ? [i, i + q.length] : undefined }, ...inner);
          } else {
            const i = n.name.toLowerCase().indexOf(q);
            if (i >= 0 || n.path.toLowerCase().includes(q)) res.push({ node: n, match: i >= 0 ? [i, i + q.length] : undefined });
          }
        }
        return res;
      };
      return walk(tree);
    }
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        out.push({ node: n });
        if (n.kind === "dir" && !collapsed.has(n.path)) walk(n.children);
      }
    };
    walk(tree);
    return out;
  }, [tree, collapsed, query]);

  const nodeByPath = useMemo(() => {
    const m = new Map<string, Node>();
    const walk = (ns: Node[]) => ns.forEach((n) => (m.set(n.path, n), walk(n.children)));
    walk(tree);
    return m;
  }, [tree]);

  const toggle = (path: string, open?: boolean) =>
    setCollapsed((c) => {
      const n = new Set(c);
      const isOpen = !n.has(path);
      if (open ?? !isOpen) n.delete(path);
      else n.add(path);
      return n;
    });

  const expandTo = (path: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      for (let p = path; p; p = parentOf(p)) n.delete(p);
      return n;
    });

  const focusTree = () => window.setTimeout(() => treeRef.current?.focus(), 0);

  const startNew = (kind: "file" | "dir", parent: string) => {
    setQuery("");
    if (parent) expandTo(parent);
    setEditing({ mode: "new", kind, parent });
  };

  const openNode = (n: Node) => {
    if (n.kind === "dir") toggle(n.path);
    else actions.open(n.path, n.kind);
  };

  const commitEdit = async (value: string) => {
    const e = editing;
    setEditing(null);
    const name = value.trim();
    if (!e || !name) return focusTree();
    if (e.mode === "rename") {
      if (name !== baseName(e.path)) {
        const to = join(parentOf(e.path), name);
        if (await actions.rename(e.path, to)) setSelected(to);
      }
    } else if (e.kind === "dir") {
      const rel = join(e.parent, name);
      if (await actions.createDir(rel)) {
        setSelected(rel);
        expandTo(rel);
      }
    } else {
      const rel = await actions.createFile(join(e.parent, name));
      if (rel) setSelected(rel);
    }
    focusTree();
  };

  const remove = (path: string) => void actions.trash(path).then(focusTree);

  const fileMenu = (e: React.MouseEvent, n: Node) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(n.path);
    const items: MenuItem[] = [];
    if (n.kind === "dir") {
      items.push({ label: "Neue Datei hier …", run: () => startNew("file", n.path) });
      items.push({ label: "Neuer Ordner hier …", run: () => startNew("dir", n.path) });
      items.push("sep");
    } else {
      if (n.kind === "typ" || n.kind === "text") items.push({ label: "Öffnen", run: () => actions.open(n.path, n.kind) });
      if (n.kind === "typ" && n.path !== main) items.push({ label: "Als Hauptdatei festlegen", run: () => actions.setMain(n.path) });
      if (n.kind === "image") items.push({ label: "Als Abbildung einfügen", run: () => actions.insertImage(n.path) });
      if (n.kind !== "typ" && n.kind !== "text") items.push({ label: "Mit Standard-App öffnen", run: () => actions.openExternal(n.path) });
      items.push("sep");
    }
    items.push({ label: "Umbenennen", detail: "F2", run: () => setEditing({ mode: "rename", path: n.path }) });
    items.push({
      label: "Duplizieren",
      detail: "⌘D",
      run: () => void actions.duplicate(n.path).then((p) => p && setSelected(p)),
    });
    items.push({ label: "Pfad kopieren", run: () => actions.copyPath(n.path) });
    items.push({ label: "Im Finder zeigen", run: () => actions.reveal(n.path) });
    items.push("sep");
    items.push({ label: "In den Papierkorb", detail: "⌘⌫", danger: true, run: () => remove(n.path) });
    actions.showMenu(e.clientX, e.clientY, items);
  };

  const backgroundMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    actions.showMenu(e.clientX, e.clientY, [
      { label: "Neue Datei …", run: () => startNew("file", "") },
      { label: "Neuer Ordner …", run: () => startNew("dir", "") },
      "sep",
      { label: "Projektordner im Finder", run: () => actions.reveal("") },
    ]);
  };

  // ---------- Keyboard ----------
  const onTreeKey = (e: React.KeyboardEvent) => {
    if (editing || e.target !== treeRef.current) return;
    const idx = rows.findIndex((r) => r.node.path === selected);
    const sel = idx >= 0 ? rows[idx].node : null;
    const go = (i: number) => {
      const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
      if (r) {
        setSelected(r.node.path);
        treeRef.current?.querySelector(`[data-path="${CSS.escape(r.node.path)}"]`)?.scrollIntoView({ block: "nearest" });
      }
    };
    if (e.key === "ArrowDown") {
      e.preventDefault();
      go(idx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (idx <= 0) searchRef.current?.focus();
      else go(idx - 1);
    } else if (e.key === "ArrowRight" && sel?.kind === "dir") {
      e.preventDefault();
      if (collapsed.has(sel.path)) toggle(sel.path, true);
      else go(idx + 1);
    } else if (e.key === "ArrowLeft" && sel) {
      e.preventDefault();
      if (sel.kind === "dir" && !collapsed.has(sel.path) && !query) toggle(sel.path, false);
      else if (parentOf(sel.path)) setSelected(parentOf(sel.path));
    } else if (e.key === "Enter" && sel) {
      e.preventDefault();
      openNode(sel);
    } else if (e.key === "F2" && sel) {
      e.preventDefault();
      setEditing({ mode: "rename", path: sel.path });
    } else if (e.key === "Backspace" && e.metaKey && sel) {
      e.preventDefault();
      remove(sel.path);
    } else if (e.key === "d" && e.metaKey && sel) {
      e.preventDefault();
      void actions.duplicate(sel.path).then((p) => p && setSelected(p));
    } else if (e.key === "Escape") {
      setSelected(null);
    }
  };

  // ---------- Drag & drop (pointer based, works regardless of the webview's file-drop handling) ----------
  const onPointerDown = (e: React.PointerEvent, n: Node) => {
    if (e.button !== 0 || editing) return;
    const start = { x: e.clientX, y: e.clientY };
    let active = false;
    const targetAt = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el || !treeRef.current?.contains(el)) return null;
      const row = el.closest<HTMLElement>("[data-path]");
      if (!row) return "";
      const p = row.dataset.path!;
      return row.dataset.kind === "dir" ? p : parentOf(p);
    };
    const valid = (t: string | null) => t !== null && t !== parentOf(n.path) && !(n.kind === "dir" && isInside(t, n.path));
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      active = true;
      const t = targetAt(ev.clientX, ev.clientY);
      setDrag({ path: n.path, target: valid(t) ? t : null, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (!active) return;
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 0);
      const t = targetAt(ev.clientX, ev.clientY);
      if (valid(t)) {
        const to = join(t!, baseName(n.path));
        void actions.rename(n.path, to).then((ok) => {
          if (ok) {
            setSelected(to);
            if (t) expandTo(t);
          }
        });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const editRow = (depth: number, kind: "file" | "dir", initial: string, key: string) => (
    <div key={key} className="tree-row editing" style={{ paddingLeft: 8 + depth * 14 }}>
      <span className="twisty" />
      {kind === "dir" ? <Icon.folder /> : fileIcon(initial.endsWith(".typ") || !initial ? "typ" : "other")}
      <input
        autoFocus
        defaultValue={initial}
        placeholder={kind === "dir" ? "Ordnername" : "name.typ"}
        onFocus={(e) => {
          editDone.current = false;
          const dot = e.currentTarget.value.lastIndexOf(".");
          e.currentTarget.setSelectionRange(0, kind === "file" && dot > 0 ? dot : e.currentTarget.value.length);
        }}
        onBlur={(e) => {
          if (editDone.current) {
            editDone.current = false;
            return;
          }
          void commitEdit(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault(); // or the keypress lands in the editor that opens next
            editDone.current = true;
            void commitEdit(e.currentTarget.value);
          }
          if (e.key === "Escape") {
            editDone.current = true;
            setEditing(null);
            focusTree();
          }
        }}
      />
    </div>
  );

  const highlight = (name: string, m?: [number, number]) =>
    m ? (
      <>
        {name.slice(0, m[0])}
        <mark>{name.slice(m[0], m[1])}</mark>
        {name.slice(m[1])}
      </>
    ) : (
      name
    );

  const newHere = (parent: string, depth: number) =>
    editing?.mode === "new" && editing.parent === parent ? editRow(depth, editing.kind, "", "new:" + parent) : null;

  return (
    <div className="file-tree">
      <div className="sidebar-head">
        <span>Dateien</span>
        <div className="head-actions">
          <button className="icon-btn" title="Neue Datei" onClick={() => startNew("file", selectedDir())}>
            <Icon.plus />
          </button>
          <button className="icon-btn" title="Neuer Ordner" onClick={() => startNew("dir", selectedDir())}>
            <FolderPlus />
          </button>
          <button className="icon-btn" title="Alle Ordner zuklappen" onClick={() => setCollapsed(new Set([...nodeByPath.values()].filter((n) => n.kind === "dir").map((n) => n.path)))}>
            <CollapseAll />
          </button>
        </div>
      </div>
      <div className="tree-search">
        <Icon.search />
        <input
          ref={searchRef}
          value={query}
          placeholder="Dateien filtern"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              focusTree();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              const first = rows.find((r) => r.node.kind !== "dir") ?? rows[0];
              if (first) setSelected(first.node.path);
              focusTree();
            } else if (e.key === "Enter") {
              const first = rows.find((r) => r.node.kind !== "dir");
              if (first) {
                actions.open(first.node.path, first.node.kind);
                setQuery("");
                expandTo(parentOf(first.node.path));
                setSelected(first.node.path);
              }
            }
          }}
        />
        {query && (
          <button className="mini" title="Filter löschen" onClick={() => setQuery("")}>
            ×
          </button>
        )}
      </div>
      <div
        ref={treeRef}
        className={"tree" + (drag && drag.target === "" ? " drop-root" : "")}
        tabIndex={0}
        onKeyDown={onTreeKey}
        onContextMenu={backgroundMenu}
        onClick={(e) => e.target === e.currentTarget && setSelected(null)}
      >
        {newHere("", 0)}
        {rows.map(({ node: n, match }) => {
          const isDir = n.kind === "dir";
          const open = isDir && (!!query || !collapsed.has(n.path));
          const depth = query ? n.path.split("/").length - 1 : n.depth;
          if (editing?.mode === "rename" && editing.path === n.path) {
            return editRow(depth, isDir ? "dir" : "file", n.name, "edit:" + n.path);
          }
          const cls = [
            "tree-row",
            n.path === current && "active",
            n.path === selected && "selected",
            drag?.path === n.path && "dragging",
            isDir && drag?.target === n.path && "drop-target",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <Fragment key={n.path}>
              <div
                className={cls}
                data-path={n.path}
                data-kind={n.kind}
                style={{ paddingLeft: 8 + depth * 14 }}
                title={n.path}
                onPointerDown={(e) => onPointerDown(e, n)}
                onClick={() => {
                  if (suppressClick.current) return;
                  setSelected(n.path);
                  treeRef.current?.focus();
                  if (isDir) toggle(n.path);
                  else if (n.kind === "typ" || n.kind === "text") actions.open(n.path, n.kind);
                }}
                onDoubleClick={() => {
                  if (n.kind === "image" || n.kind === "pdf" || n.kind === "other") actions.openExternal(n.path);
                }}
                onContextMenu={(e) => fileMenu(e, n)}
              >
                <span className={"twisty" + (open ? " open" : "")}>{isDir && <Icon.chevron />}</span>
                {isDir ? open ? <Icon.folderOpen /> : <Icon.folder /> : fileIcon(n.kind)}
                <span className="name">{highlight(n.name, match)}</span>
                {n.path === main && <span className="badge">main</span>}
              </div>
              {isDir && open && newHere(n.path, depth + 1)}
            </Fragment>
          );
        })}
        {query && rows.length === 0 && <div className="tree-empty">Keine Datei passt zu „{query}“</div>}
        {!query && rows.length === 0 && !editing && <div className="tree-empty">Noch keine Dateien</div>}
      </div>
      {drag && (
        <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>
          {baseName(drag.path)}
          {drag.target !== null && <span> → {drag.target || "Projekt"}</span>}
        </div>
      )}
    </div>
  );

  /** Folder for "new file/folder": the selected folder, or the selected file's folder. */
  function selectedDir(): string {
    if (!selected) return "";
    const n = nodeByPath.get(selected);
    if (!n) return "";
    return n.kind === "dir" ? n.path : parentOf(n.path);
  }
}

function FolderPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 10.5v5M9.5 13h5" />
    </svg>
  );
}

function CollapseAll() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4l4 4 4-4M8 20l4-4 4 4M4 12h16" />
    </svg>
  );
}
