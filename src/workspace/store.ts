import { useSyncExternalStore } from "react";

/** Kleiner Wert mit Abonnenten: nur wer ihn anzeigt, rendert bei Änderungen neu. */
export type Store<T> = { get(): T; set(v: T): void; subscribe(fn: () => void): () => void };

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => {
      value = v;
      subs.forEach((f) => f());
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
  };
}

export const useStore = <T,>(s: Store<T>) => useSyncExternalStore(s.subscribe, s.get);
