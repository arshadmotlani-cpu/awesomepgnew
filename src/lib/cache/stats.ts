/**
 * In-process cache hit/miss counters — logged periodically for observability.
 * Safe when Redis is disabled (records bypass as miss-equivalent).
 */

export type CacheNamespace =
  | 'public.pg_list'
  | 'public.pg_detail'
  | 'public.rooms'
  | 'public.room_detail'
  | 'admin.dashboard_stats'
  | 'admin.business_metrics'
  | 'admin.pg_business_metrics'
  | 'admin.visitor_summary';

type Bucket = {
  hits: number;
  misses: number;
  bypass: number;
  errors: number;
  dbFetches: number;
};

const buckets = new Map<CacheNamespace, Bucket>();

function bucket(ns: CacheNamespace): Bucket {
  let b = buckets.get(ns);
  if (!b) {
    b = { hits: 0, misses: 0, bypass: 0, errors: 0, dbFetches: 0 };
    buckets.set(ns, b);
  }
  return b;
}

export function recordCacheHit(ns: CacheNamespace): void {
  bucket(ns).hits += 1;
}

export function recordCacheMiss(ns: CacheNamespace): void {
  bucket(ns).misses += 1;
}

export function recordCacheBypass(ns: CacheNamespace): void {
  bucket(ns).bypass += 1;
}

export function recordCacheError(ns: CacheNamespace): void {
  bucket(ns).errors += 1;
}

export function recordDbFetch(ns: CacheNamespace): void {
  bucket(ns).dbFetches += 1;
}

export type CacheStatsSnapshot = {
  totals: {
    hits: number;
    misses: number;
    bypass: number;
    errors: number;
    dbFetches: number;
    hitRate: number | null;
  };
  byNamespace: Record<
    CacheNamespace,
    Bucket & { hitRate: number | null }
  >;
};

export function getCacheStatsSnapshot(): CacheStatsSnapshot {
  const byNamespace = {} as CacheStatsSnapshot['byNamespace'];
  let hits = 0;
  let misses = 0;
  let bypass = 0;
  let errors = 0;
  let dbFetches = 0;

  for (const [ns, b] of buckets.entries()) {
    hits += b.hits;
    misses += b.misses;
    bypass += b.bypass;
    errors += b.errors;
    dbFetches += b.dbFetches;
    const attempts = b.hits + b.misses;
    byNamespace[ns] = {
      ...b,
      hitRate: attempts > 0 ? Math.round((b.hits / attempts) * 1000) / 1000 : null,
    };
  }

  const attempts = hits + misses;
  return {
    totals: {
      hits,
      misses,
      bypass,
      errors,
      dbFetches,
      hitRate: attempts > 0 ? Math.round((hits / attempts) * 1000) / 1000 : null,
    },
    byNamespace,
  };
}

let lastLoggedAt = 0;

/** Log aggregate stats at most once per minute when there was activity. */
export function maybeLogCacheStats(): void {
  const snap = getCacheStatsSnapshot();
  const activity = snap.totals.hits + snap.totals.misses + snap.totals.bypass;
  if (activity === 0) return;
  const now = Date.now();
  if (now - lastLoggedAt < 60_000) return;
  lastLoggedAt = now;
  console.info('[cache] stats', {
    hitRate: snap.totals.hitRate,
    hits: snap.totals.hits,
    misses: snap.totals.misses,
    bypass: snap.totals.bypass,
    dbFetchesAvoided: snap.totals.hits,
    dbFetches: snap.totals.dbFetches,
    errors: snap.totals.errors,
  });
}
