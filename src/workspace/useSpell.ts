// Rechtschreibprüfung der offenen Datei: plant Prüfungen nach dem Tippen,
// verwaltet die Projekt-Wörterliste und die ignorierten Wörter.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { api } from "../api";
import type { EditorHandle } from "../editor/Editor";
import { getSettings, useSettings } from "../settings";
import type { Toast } from "./types";

export function useSpell({
  editor,
  currentRef,
  current,
  root,
  showToast,
}: {
  editor: RefObject<EditorHandle | null>;
  currentRef: RefObject<string | null>;
  current: string | null;
  root: string;
  showToast(t: Toast, ms?: number): void;
}) {
  const settings = useSettings();

  const projectWords = useRef<string[]>([]);
  const ignoredWords = useRef(new Set<string>());
  const [spellInfo, setSpellInfo] = useState<{ count: number; dominant: string | null }>({ count: 0, dominant: null });
  const spellTimer = useRef<number | undefined>(undefined);
  const spellRun = useRef(0);

  useEffect(() => {
    api
      .readFile(".neotypst-woerter.txt")
      .then((t) => (projectWords.current = t.split("\n").map((w) => w.trim()).filter(Boolean)))
      .catch(() => (projectWords.current = []));
  }, [root]);

  const runSpell = useCallback(() => {
    const ed = editor.current;
    const rel = currentRef.current;
    if (!ed || !rel) return;
    const mode = getSettings().spell;
    if (mode === "off" || !rel.endsWith(".typ")) {
      ed.setSpelling([]);
      setSpellInfo({ count: 0, dominant: null });
      return;
    }
    const text = ed.getText();
    const run = ++spellRun.current;
    api
      .spellcheck(text, mode, projectWords.current)
      .then((r) => {
        // Drop stale results: a newer check is coming.
        if (run !== spellRun.current || editor.current?.getText() !== text) return;
        const issues = r.issues.filter((i) => !ignoredWords.current.has(i.word.toLowerCase()));
        editor.current?.setSpelling(issues);
        setSpellInfo({ count: issues.length, dominant: r.dominant });
      })
      .catch(() => {});
  }, []);

  const scheduleSpell = useCallback(
    (delay = 600) => {
      window.clearTimeout(spellTimer.current);
      spellTimer.current = window.setTimeout(runSpell, delay);
    },
    [runSpell],
  );

  useEffect(() => {
    scheduleSpell(50);
  }, [settings.spell, current, scheduleSpell]);

  const onSpellAction = useCallback(
    async (action: "learn" | "project" | "ignore", word: string) => {
      if (action === "learn") {
        await api.learnWord(word).catch(() => {});
        showToast({ text: `„${word}“ wurde zum macOS-Wörterbuch hinzugefügt` });
      } else if (action === "project") {
        projectWords.current = [...new Set([...projectWords.current, word])].sort((a, b) => a.localeCompare(b));
        await api.writeFile(".neotypst-woerter.txt", projectWords.current.join("\n") + "\n").catch(() => {});
        showToast({ text: `„${word}“ ist in diesem Projekt erlaubt` });
      } else {
        ignoredWords.current.add(word.toLowerCase());
      }
      runSpell();
    },
    [runSpell, showToast],
  );

  return { spellInfo, scheduleSpell, onSpellAction };
}
