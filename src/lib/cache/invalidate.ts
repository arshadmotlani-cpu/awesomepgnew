import { getRedisClient } from '@/src/lib/cache/client';
import {
  adminKpiCachePattern,
  cacheKeys,
  publicCachePattern,
  publicRoomDetailPatternForSlug,
  publicRoomsPatternForPg,
} from '@/src/lib/cache/keys';

async function deleteKeys(keys: string[]): Promise<number> {
  const redis = getRedisClient();
  if (!redis || keys.length === 0) return 0;
  try {
    await redis.del(...keys);
    return keys.length;
  } catch (err) {
    console.warn('[cache] invalidate del failed', {
      count: keys.length,
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

async function deleteByPattern(pattern: string): Promise<number> {
  const redis = getRedisClient();
  if (!redis) return 0;
  try {
    const keys = await redis.keys(pattern);
    if (!keys.length) return 0;
    await redis.del(...keys);
    return keys.length;
  } catch (err) {
    console.warn('[cache] invalidate pattern failed', {
      pattern,
      err: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/**
 * Invalidate public browse caches after PG listing / room / pricing / inventory edits.
 */
export async function invalidatePublicPgCache(input?: {
  pgSlug?: string | null;
  pgId?: string | null;
  billingMonth?: string | null;
}): Promise<void> {
  const keys: string[] = [cacheKeys.publicPgList()];
  if (input?.pgSlug) {
    keys.push(cacheKeys.publicPgBySlug(input.pgSlug));
  }
  const deleted = await deleteKeys(keys);

  let patternDeleted = 0;
  if (input?.pgId) {
    patternDeleted += await deleteByPattern(publicRoomsPatternForPg(input.pgId));
  }
  if (input?.pgSlug) {
    patternDeleted += await deleteByPattern(publicRoomDetailPatternForSlug(input.pgSlug));
  }
  if (!input?.pgSlug && !input?.pgId) {
    patternDeleted += await deleteByPattern(publicCachePattern());
  }

  if (deleted + patternDeleted > 0) {
    console.info('[cache] invalidated public PG caches', {
      keys: deleted,
      pattern: patternDeleted,
      pgSlug: input?.pgSlug ?? null,
      pgId: input?.pgId ?? null,
    });
  }

  void input?.billingMonth;
}

/** Invalidate admin KPI aggregates (overview / revenue dashboards). */
export async function invalidateAdminKpiCache(billingMonth?: string | null): Promise<void> {
  if (billingMonth) {
    await deleteKeys([
      cacheKeys.adminDashboardStats(),
      cacheKeys.adminBusinessMetrics(billingMonth),
      cacheKeys.adminPgBusinessMetrics(billingMonth),
      cacheKeys.adminVisitorSummary(),
    ]);
    return;
  }
  const n = await deleteByPattern(adminKpiCachePattern());
  if (n > 0) {
    console.info('[cache] invalidated admin KPI caches', { keys: n });
  }
}

export async function invalidateAllAwesomePgCaches(opts?: {
  pgSlug?: string | null;
  pgId?: string | null;
  billingMonth?: string | null;
}): Promise<void> {
  await invalidatePublicPgCache(opts);
  await invalidateAdminKpiCache(opts?.billingMonth);
}
