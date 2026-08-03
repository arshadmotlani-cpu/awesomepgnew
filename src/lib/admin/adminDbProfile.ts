/**
 * Admin SSR DB query profiler — enable with ADMIN_DB_PROFILE=1.
 * Used by profile scripts and drizzleLogger; zero overhead when unset.
 */

export type AdminDbProfileSnapshot = {
  queryCount: number;
  totalDbMs: number;
  uniqueFingerprints: number;
  duplicateQueryCount: number;
  duplicates: Array<{ fingerprint: string; count: number; sample: string }>;
  slowestQueries: Array<{ fingerprint: string; durationMs: number; sample: string }>;
};

type QueryStat = {
  count: number;
  totalMs: number;
  maxMs: number;
  sample: string;
};

let queryCount = 0;
let totalDbMs = 0;
let lastQueryEndedAt = 0;
const byFingerprint = new Map<string, QueryStat>();

function normalizeSqlFingerprint(query: string): string {
  return query
    .toLowerCase()
    .replace(/\$\d+/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export function resetAdminDbProfile(): void {
  queryCount = 0;
  totalDbMs = 0;
  lastQueryEndedAt = 0;
  byFingerprint.clear();
}

/** Called from drizzleLogger after query completes. */
export function recordAdminDbQuery(query: string): void {
  const now = performance.now();
  const ms = lastQueryEndedAt > 0 ? Math.max(0, now - lastQueryEndedAt) : 0;
  lastQueryEndedAt = now;

  queryCount += 1;
  totalDbMs += ms;

  const fingerprint = normalizeSqlFingerprint(query);
  const existing = byFingerprint.get(fingerprint);
  if (existing) {
    existing.count += 1;
    existing.totalMs += ms;
    existing.maxMs = Math.max(existing.maxMs, ms);
  } else {
    byFingerprint.set(fingerprint, {
      count: 1,
      totalMs: ms,
      maxMs: ms,
      sample: query.slice(0, 200),
    });
  }
}

export function getAdminDbProfile(): AdminDbProfileSnapshot {
  const duplicates: AdminDbProfileSnapshot['duplicates'] = [];
  let duplicateQueryCount = 0;

  for (const [fingerprint, stat] of byFingerprint) {
    if (stat.count > 1) {
      duplicateQueryCount += stat.count - 1;
      duplicates.push({
        fingerprint,
        count: stat.count,
        sample: stat.sample,
      });
    }
  }

  duplicates.sort((a, b) => b.count - a.count);

  const slowestQueries = [...byFingerprint.entries()]
    .map(([fingerprint, stat]) => ({
      fingerprint,
      durationMs: Math.round(stat.maxMs),
      sample: stat.sample,
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5);

  return {
    queryCount,
    totalDbMs: Math.round(totalDbMs),
    uniqueFingerprints: byFingerprint.size,
    duplicateQueryCount,
    duplicates: duplicates.slice(0, 15),
    slowestQueries,
  };
}

export function snapshotAdminDbProfile(): AdminDbProfileSnapshot {
  return getAdminDbProfile();
}
