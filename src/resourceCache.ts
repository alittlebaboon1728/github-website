import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

export const NAVIGATION_TTL = 5 * 60_000;
type Snapshot<T> = {
  value?: T;
  updatedAt: number;
  loading: boolean;
  error: unknown;
};
type Entry = {
  snapshot: Snapshot<unknown>;
  listeners: Set<() => void>;
  version: number;
  pending?: Promise<unknown>;
  failedAt?: number;
};
const entries = new Map<string, Entry>();
function entryFor(key: string) {
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      snapshot: { updatedAt: 0, loading: false, error: null },
      listeners: new Set(),
      version: 0,
    };
    entries.set(key, entry);
  }
  return entry;
}
function trim() {
  for (const [key, entry] of entries) {
    if (entries.size <= 384) break;
    if (!entry.pending && !entry.listeners.size) entries.delete(key);
  }
}
function publish(entry: Entry, snapshot: Snapshot<unknown>) {
  entry.snapshot = snapshot;
  for (const notify of entry.listeners) notify();
}
export function peekResource<T>(key: string) {
  return entries.get(key)?.snapshot as Snapshot<T> | undefined;
}
export function seedResource<T>(key: string, value: T) {
  const entry = entryFor(key);
  entry.version++;
  publish(entry, {
    value,
    updatedAt: Date.now(),
    loading: false,
    error: null,
  });
}
export function invalidateResources(prefix: string) {
  for (const [key, entry] of entries)
    if (key.startsWith(prefix)) {
      entry.version++;
      publish(entry, { ...entry.snapshot, updatedAt: 0 });
    }
}

/** Consumers share a bounded GET request; leaving one view never cancels another's load. */
export function loadResource<T>(
  key: string,
  loader: (signal: AbortSignal) => Promise<T>,
  { ttl = NAVIGATION_TTL, force = false, speculative = false } = {},
): Promise<T> {
  const entry = entryFor(key);
  if (entry.pending) return entry.pending as Promise<T>;
  if (
    !force &&
    entry.snapshot.value !== undefined &&
    Date.now() - entry.snapshot.updatedAt < ttl
  )
    return Promise.resolve(entry.snapshot.value as T);
  if (speculative && entry.failedAt && Date.now() - entry.failedAt < 30_000)
    return Promise.reject(entry.snapshot.error);
  const controller = new AbortController();
  const version = entry.version;
  const timeout = setTimeout(() => controller.abort(), 25_000);
  publish(entry, { ...entry.snapshot, loading: true, error: null });
  const pending = Promise.resolve()
    .then(() => loader(controller.signal))
    .then(
      (value) => {
        if (entry.version !== version) return value;
        entry.failedAt = undefined;
        publish(entry, {
          value,
          updatedAt: Date.now(),
          loading: false,
          error: null,
        });
        return value;
      },
      (error) => {
        if (entry.version !== version) throw error;
        entry.failedAt = Date.now();
        publish(entry, { ...entry.snapshot, loading: false, error });
        throw error;
      },
    )
    .finally(() => {
      clearTimeout(timeout);
      entry.pending = undefined;
      // A mutation can invalidate an older GET while it is still in flight.
      // Re-read it instead of letting that response overwrite the new state.
      if (entry.version !== version && entry.snapshot.updatedAt === 0)
        void loadResource(key, loader, { ttl, force: true }).catch(() => {});
      trim();
    });
  entry.pending = pending;
  return pending;
}

export function useResource<T>(
  key: string | null,
  loader: (signal: AbortSignal) => Promise<T>,
  ttl = NAVIGATION_TTL,
) {
  const load = useRef(loader);
  load.current = loader;
  const entry = key ? entryFor(key) : emptyEntry;
  const subscribe = useCallback(
    (notify: () => void) => {
      entry.listeners.add(notify);
      return () => {
        entry.listeners.delete(notify);
      };
    },
    [entry],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => entry.snapshot,
  ) as Snapshot<T>;
  useEffect(() => {
    if (key) void loadResource(key, load.current, { ttl }).catch(() => {});
  }, [key, ttl]);
  const retry = () => {
    if (key)
      void loadResource(key, load.current, {
        ttl,
        force: true,
      }).catch(() => {});
  };
  return {
    ...snapshot,
    loading:
      Boolean(key) &&
      (snapshot.loading || (!snapshot.value && !snapshot.error)),
    retry,
  };
}
const emptyEntry: Entry = {
  snapshot: { updatedAt: 0, loading: false, error: null },
  listeners: new Set(),
  version: 0,
};
