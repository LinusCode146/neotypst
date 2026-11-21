import { useSyncExternalStore } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * In-app updates from GitHub Releases (latest.json, signed with the project's key).
 * Checked quietly a few seconds after launch and on request from the palette.
 */
type UpdateState =
  | { phase: "idle" }
  | { phase: "checking"; manual: boolean }
  | { phase: "none"; manual: boolean }
  | { phase: "available"; update: Update }
  | { phase: "downloading"; update: Update; done: number; total: number | null }
  | { phase: "ready"; update: Update }
  | { phase: "error"; message: string; manual: boolean };

let state: UpdateState = { phase: "idle" };
let dismissed = false;
const listeners = new Set<() => void>();
const set = (s: UpdateState) => {
  state = s;
  listeners.forEach((l) => l());
};

/** Hooks run before restarting (e.g. saving open files). */
export const beforeRestart = new Set<() => Promise<void> | void>();

export function useUpdate() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export async function checkForUpdate(manual: boolean) {
  if (state.phase === "checking" || state.phase === "downloading") return;
  if (manual) dismissed = false;
  set({ phase: "checking", manual });
  try {
    const update = await check();
    if (update) set({ phase: "available", update });
    else set({ phase: "none", manual });
  } catch (e) {
    set({ phase: "error", message: String(e), manual });
  }
}

async function install(update: Update) {
  let done = 0;
  let total: number | null = null;
  set({ phase: "downloading", update, done, total });
  try {
    await update.downloadAndInstall((ev) => {
      if (ev.event === "Started") total = ev.data.contentLength ?? null;
      else if (ev.event === "Progress") done += ev.data.chunkLength;
      set({ phase: "downloading", update, done, total });
    });
    set({ phase: "ready", update });
  } catch (e) {
    set({ phase: "error", message: String(e), manual: true });
  }
}

async function restart() {
  for (const hook of beforeRestart) await hook();
  await relaunch();
}

/** Quiet check shortly after launch (not in development). */
export function scheduleUpdateCheck() {
  if (import.meta.env.DEV) return;
  window.setTimeout(() => void checkForUpdate(false), 4000);
}

const close = () => {
  dismissed = true;
  set({ phase: "idle" });
};

export function UpdateCard() {
  const s = useUpdate();
  if (s.phase === "idle" || s.phase === "checking" && !s.manual) return null;
  if ((s.phase === "none" || s.phase === "error") && !s.manual) return null;
  if (dismissed && s.phase === "available") return null;

  let body: React.ReactNode;
  if (s.phase === "checking") body = <div className="update-title">Suche nach Updates …</div>;
  else if (s.phase === "none")
    body = (
      <>
        <div className="update-title">NeoTypst ist aktuell</div>
        <div className="update-actions">
          <button className="btn" onClick={close}>OK</button>
        </div>
      </>
    );
  else if (s.phase === "error")
    body = (
      <>
        <div className="update-title">Update fehlgeschlagen</div>
        <div className="update-note">{s.message}</div>
        <div className="update-actions">
          <button className="btn" onClick={close}>Schließen</button>
        </div>
      </>
    );
  else if (s.phase === "available")
    body = (
      <>
        <div className="update-title">NeoTypst {s.update.version} ist verfügbar</div>
        <div className="update-note">Du hast {s.update.currentVersion}.{s.update.body ? " " + firstLine(s.update.body) : ""}</div>
        <div className="update-actions">
          <button className="btn" onClick={close}>Später</button>
          <button className="btn primary" onClick={() => void install(s.update)}>Installieren</button>
        </div>
      </>
    );
  else if (s.phase === "downloading") {
    const pct = s.total ? Math.min(100, Math.round((s.done / s.total) * 100)) : null;
    body = (
      <>
        <div className="update-title">Lade NeoTypst {s.update.version} …</div>
        <div className="update-bar">
          <span style={{ width: pct != null ? pct + "%" : "40%" }} className={pct == null ? "indeterminate" : undefined} />
        </div>
      </>
    );
  } else
    body = (
      <>
        <div className="update-title">NeoTypst {s.update.version} ist installiert</div>
        <div className="update-note">Offene Dateien werden vor dem Neustart gespeichert.</div>
        <div className="update-actions">
          <button className="btn" onClick={close}>Später</button>
          <button className="btn primary" onClick={() => void restart()}>Jetzt neu starten</button>
        </div>
      </>
    );
  return <div className="update-card">{body}</div>;
}

function firstLine(s: string) {
  const l = s.split("\n").map((x) => x.replace(/^[#*\-\s]+/, "").trim()).find(Boolean) ?? "";
  return l.length > 120 ? l.slice(0, 117) + "…" : l;
}
