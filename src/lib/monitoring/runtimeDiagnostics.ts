import { isRedisConfigured } from '@/src/lib/cache/client';
import { getCacheStatsSnapshot, type CacheStatsSnapshot } from '@/src/lib/cache/stats';

type AggregatedStat = {
  key: string;
  count: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
};

const queryStats = new Map<string, { count: number; totalMs: number; maxMs: number }>();
const routeStats = new Map<string, { count: number; totalMs: number; maxMs: number }>();

function recordStat(
  map: Map<string, { count: number; totalMs: number; maxMs: number }>,
  key: string,
  durationMs: number,
): void {
  const existing = map.get(key);
  if (existing) {
    existing.count += 1;
    existing.totalMs += durationMs;
    existing.maxMs = Math.max(existing.maxMs, durationMs);
    return;
  }
  map.set(key, { count: 1, totalMs: durationMs, maxMs: durationMs });
}

export function recordQueryStat(queryName: string, durationMs: number): void {
  recordStat(queryStats, queryName, durationMs);
}

export function recordRouteStat(route: string, durationMs: number): void {
  recordStat(routeStats, route, durationMs);
}

function toRankedList(
  map: Map<string, { count: number; totalMs: number; maxMs: number }>,
  sortBy: 'count' | 'maxMs' | 'avgMs',
  limit = 10,
): AggregatedStat[] {
  const rows: AggregatedStat[] = [];
  for (const [key, stat] of map.entries()) {
    rows.push({
      key,
      count: stat.count,
      totalMs: stat.totalMs,
      avgMs: Math.round((stat.totalMs / stat.count) * 10) / 10,
      maxMs: stat.maxMs,
    });
  }

  rows.sort((a, b) => {
    if (sortBy === 'count') return b.count - a.count;
    if (sortBy === 'maxMs') return b.maxMs - a.maxMs;
    return b.avgMs - a.avgMs;
  });

  return rows.slice(0, limit);
}

export type RuntimeDiagnosticsSnapshot = {
  processUptimeSeconds: number;
  redisConfigured: boolean;
  cache: CacheStatsSnapshot & {
    hitRatePercent: number | null;
  };
  queries: {
    totalCount: number;
    avgDurationMs: number | null;
    slowest: AggregatedStat[];
    mostFrequent: AggregatedStat[];
  };
  endpoints: {
    totalCount: number;
    avgDurationMs: number | null;
    slowest: AggregatedStat[];
    mostFrequent: AggregatedStat[];
  };
};

export function getRuntimeDiagnosticsSnapshot(): RuntimeDiagnosticsSnapshot {
  const cache = getCacheStatsSnapshot();
  const hitRatePercent =
    cache.totals.hitRate != null ? Math.round(cache.totals.hitRate * 1000) / 10 : null;

  let queryTotalCount = 0;
  let queryTotalMs = 0;
  for (const stat of queryStats.values()) {
    queryTotalCount += stat.count;
    queryTotalMs += stat.totalMs;
  }

  let routeTotalCount = 0;
  let routeTotalMs = 0;
  for (const stat of routeStats.values()) {
    routeTotalCount += stat.count;
    routeTotalMs += stat.totalMs;
  }

  return {
    processUptimeSeconds: Math.round(process.uptime()),
    redisConfigured: isRedisConfigured(),
    cache: {
      ...cache,
      hitRatePercent,
    },
    queries: {
      totalCount: queryTotalCount,
      avgDurationMs:
        queryTotalCount > 0
          ? Math.round((queryTotalMs / queryTotalCount) * 10) / 10
          : null,
      slowest: toRankedList(queryStats, 'maxMs'),
      mostFrequent: toRankedList(queryStats, 'count'),
    },
    endpoints: {
      totalCount: routeTotalCount,
      avgDurationMs:
        routeTotalCount > 0
          ? Math.round((routeTotalMs / routeTotalCount) * 10) / 10
          : null,
      slowest: toRankedList(routeStats, 'maxMs'),
      mostFrequent: toRankedList(routeStats, 'count'),
    },
  };
}

/** Test helper — reset in-process counters between test cases. */
export function resetRuntimeDiagnosticsForTests(): void {
  queryStats.clear();
  routeStats.clear();
}
