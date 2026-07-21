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

export async function cacheReadThrough<T>(opts: {
  key: string;
  ttlSeconds: number;
  namespace: CacheNamespace;
  fetch: () => Promise<T>;
}): Promise<T> {
  const redis = getRedisClient();
  if (!redis) {
    recordCacheBypass(opts.namespace);
    recordDbFetch(opts.namespace);
    const data = await opts.fetch();
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
