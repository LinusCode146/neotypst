import { useCallback, useEffect, useState } from "react";
import { api, type OpenedProject } from "./api";
import { Hub } from "./Hub";
import { Workspace } from "./Workspace";

const LAST = "neotypst.lastProject";

export function App() {
  const [project, setProject] = useState<OpenedProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  const open = useCallback(async (path: string) => {
    try {
      const p = await api.openProject(path);
      setProject(p);
      setError(null);
      localStorage.setItem(LAST, path);
    } catch (e) {
      setError(String(e));
      localStorage.removeItem(LAST);
    }
  }, []);

  // Reopen the last project on launch.
  useEffect(() => {
    const last = localStorage.getItem(LAST);
    if (last) open(last).finally(() => setBooting(false));
    else setBooting(false);
  }, [open]);

  const close = useCallback(async () => {
    localStorage.removeItem(LAST);
    await api.closeProject();
    setProject(null);
  }, []);

  if (booting) return null;
  if (project) return <Workspace key={project.root} project={project} onClose={close} />;
  return (
    <>
      <Hub onOpen={open} />
      {error && (
        <div className="toast error" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </>
  );
}
