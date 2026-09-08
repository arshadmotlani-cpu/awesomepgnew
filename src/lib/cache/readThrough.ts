import { getRedisClient } from '@/src/lib/cache/client';
import {
  maybeLogCacheStats,
  recordCacheBypass,
  recordCacheError,
  recordCacheHit,
  recordCacheMiss,
  recordDbFetch,
  type CacheNamespace,
} from '@/src/lib/cache/stats';

type MemoryEntry = { expiresAt: number; payload: string };

const memoryCache = new Map<string, MemoryEntry>();

function memoryGet(key: string): string | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.payload;
}

function memorySet(key: string, payload: string, ttlSeconds: number): void {
  memoryCache.set(key, { payload, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** Drop an in-process cache key (used when Redis is not configured). */
export function invalidateMemoryKey(key: string): void {
  memoryCache.delete(key);
}

/** Drop in-process keys matching a Redis-style glob (e.g. `apg:v1:public:*`). */
export function invalidateMemoryPattern(pattern: string): number {
  const re = globToRegExp(pattern);
  let n = 0;
  for (const key of [...memoryCache.keys()]) {
    if (re.test(key)) {
      memoryCache.delete(key);
      n += 1;
    }
  }
  return n;
}

export async function cacheReadThrough<T>(opts: {
  key: string;
  ttlSeconds: number;
  namespace: CacheNamespace;
  fetch: () => Promise<T>;
}): Promise<T> {
  const redis = getRedisClient();

  if (!redis) {
    const local = memoryGet(opts.key);
    if (local != null) {
      recordCacheHit(opts.namespace);
      maybeLogCacheStats();
      return JSON.parse(local) as T;
    }
    recordCacheMiss(opts.namespace);
    recordDbFetch(opts.namespace);
    const data = await opts.fetch();
    try {
      memorySet(opts.key, JSON.stringify(data), opts.ttlSeconds);
    } catch {
      recordCacheBypass(opts.namespace);
    }
    maybeLogCacheStats();
    return data;
  }

  try {
    const cached = await redis.get<string>(opts.key);
    if (cached != null) {
      recordCacheHit(opts.namespace);
      maybeLogCacheStats();
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    recordCacheError(opts.namespace);
    console.warn('[cache] read failed, falling back to DB', {
      key: opts.key,
      namespace: opts.namespace,
      err: err instanceof Error ? err.message : String(err),
    });
    recordDbFetch(opts.namespace);
    const data = await opts.fetch();
    maybeLogCacheStats();
    return data;
  }

  recordCacheMiss(opts.namespace);
  recordDbFetch(opts.namespace);
  const data = await opts.fetch();

  try {
    await redis.set(opts.key, JSON.stringify(data), { ex: opts.ttlSeconds });
  } catch (err) {
    recordCacheError(opts.namespace);
    console.warn('[cache] write failed', {
      key: opts.key,
      namespace: opts.namespace,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  maybeLogCacheStats();
  return data;
}
