/**
 * In-memory admin panel fetch cache + in-flight deduplication.
 * Client-only — survives re-clicks within the same browser session.
 */

type CacheEntry<T> = { data: T; expiresAt: number };

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 60_000;

export function getPanelCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setPanelCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidatePanelCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    inflight.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}

/** Deduplicate concurrent fetches; optionally serve from cache. */
export async function fetchPanelData<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number; force?: boolean },
): Promise<T> {
  if (!opts?.force) {
    const cached = getPanelCache<T>(key);
    if (cached != null) return cached;
  }

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher()
    .then((data) => {
      if (data != null) {
        setPanelCache(key, data, opts?.ttlMs ?? DEFAULT_TTL_MS);
      }
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** Ignore stale async results when a newer request superseded this one. */
export function createStaleGuard() {
  let version = 0;
  return {
    next: () => {
      version += 1;
      return version;
    },
    isStale: (v: number) => v !== version,
  };
}
