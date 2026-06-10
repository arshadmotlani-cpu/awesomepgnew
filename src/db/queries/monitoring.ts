import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm';
import { db } from '../client';
import { appLogs, auditLog } from '../schema';
import { runWithoutLogPersistence } from '@/src/lib/monitoring/logStore';

export type MonitoringFilters = {
  level?: string;
  search?: string;
  limit?: number;
};

export type MonitoringSnapshot = {
  logs: Array<{
    id: number;
    level: string;
    message: string;
    route: string | null;
    method: string | null;
    userId: string | null;
    requestId: string | null;
    meta: Record<string, unknown>;
    createdAt: string;
  }>;
  errors: Array<{
    message: string;
    count: number;
    latestStack: string | null;
    lastSeen: string;
  }>;
  slowRequests: Array<{
    route: string | null;
    requestId: string | null;
    latencyMs: number;
    createdAt: string;
  }>;
  slowQueries: Array<{
    query: string;
    durationMs: number;
    route: string | null;
    requestId: string | null;
    createdAt: string;
  }>;
  traffic: {
    requestsLastHour: number;
    successCount: number;
    failureCount: number;
    requestsPerMinute: number;
  };
  auditTrail: Array<{
    id: string;
    actorType: string;
    action: string;
    entity: string;
    entityId: string;
    createdAt: string;
  }>;
};

const DEFAULT_LIMIT = 100;

export async function getMonitoringSnapshot(
  filters: MonitoringFilters = {},
): Promise<MonitoringSnapshot> {
  const limit = filters.limit ?? DEFAULT_LIMIT;
  const since = new Date(Date.now() - 60 * 60 * 1000);

  return runWithoutLogPersistence(async () => {
    const conditions = [gte(appLogs.createdAt, since)];

    if (filters.level && filters.level !== 'all') {
      conditions.push(eq(appLogs.level, filters.level));
    }

    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(appLogs.route, term),
          ilike(appLogs.requestId, term),
          ilike(appLogs.message, term),
        )!,
      );
    }

    const logs = await db
      .select()
      .from(appLogs)
      .where(and(...conditions))
      .orderBy(desc(appLogs.createdAt))
      .limit(limit);

    const errorRows = await db
      .select({
        message: appLogs.message,
        count: sql<number>`count(*)::int`,
        latestStack: sql<string | null>`max(${appLogs.meta}->>'stack')`,
        lastSeen: sql<string>`max(${appLogs.createdAt})::text`,
      })
      .from(appLogs)
      .where(and(gte(appLogs.createdAt, since), eq(appLogs.level, 'error')))
      .groupBy(appLogs.message)
      .orderBy(desc(sql`count(*)`))
      .limit(20);

    const slowRequests = await db
      .select({
        route: appLogs.route,
        requestId: appLogs.requestId,
        latencyMs: sql<number>`(${appLogs.meta}->>'latencyMs')::int`,
        createdAt: appLogs.createdAt,
      })
      .from(appLogs)
      .where(
        and(
          gte(appLogs.createdAt, since),
          eq(appLogs.level, 'api'),
          sql`coalesce((${appLogs.meta}->>'slow')::boolean, false) = true`,
        ),
      )
      .orderBy(desc(appLogs.createdAt))
      .limit(25);

    const slowQueries = await db
      .select({
        query: sql<string>`coalesce(${appLogs.meta}->>'query', ${appLogs.message})`,
        durationMs: sql<number>`coalesce((${appLogs.meta}->>'durationMs')::int, 0)`,
        route: appLogs.route,
        requestId: appLogs.requestId,
        createdAt: appLogs.createdAt,
      })
      .from(appLogs)
      .where(
        and(
          gte(appLogs.createdAt, since),
          eq(appLogs.level, 'db'),
          sql`coalesce((${appLogs.meta}->>'slow')::boolean, false) = true`,
        ),
      )
      .orderBy(desc(appLogs.createdAt))
      .limit(25);

    const [trafficRow] = await db
      .select({
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where coalesce((${appLogs.meta}->>'status')::int, 200) < 400)::int`,
        failure: sql<number>`count(*) filter (where coalesce((${appLogs.meta}->>'status')::int, 200) >= 400)::int`,
      })
      .from(appLogs)
      .where(and(gte(appLogs.createdAt, since), eq(appLogs.level, 'api')));

    const auditTrail = await db
      .select({
        id: auditLog.id,
        actorType: auditLog.actorType,
        action: auditLog.action,
        entity: auditLog.entity,
        entityId: auditLog.entityId,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(25);

    const total = trafficRow?.total ?? 0;

    return {
      logs: logs.map((row) => ({
        id: row.id,
        level: row.level,
        message: row.message,
        route: row.route,
        method: row.method,
        userId: row.userId,
        requestId: row.requestId,
        meta: (row.meta ?? {}) as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      })),
      errors: errorRows.map((row) => ({
        message: row.message,
        count: row.count,
        latestStack: row.latestStack,
        lastSeen: row.lastSeen,
      })),
      slowRequests: slowRequests.map((row) => ({
        route: row.route,
        requestId: row.requestId,
        latencyMs: row.latencyMs,
        createdAt: row.createdAt.toISOString(),
      })),
      slowQueries: slowQueries.map((row) => ({
        query: row.query,
        durationMs: row.durationMs,
        route: row.route,
        requestId: row.requestId,
        createdAt: row.createdAt.toISOString(),
      })),
      traffic: {
        requestsLastHour: total,
        successCount: trafficRow?.success ?? 0,
        failureCount: trafficRow?.failure ?? 0,
        requestsPerMinute: Math.round((total / 60) * 10) / 10,
      },
      auditTrail: auditTrail.map((row) => ({
        id: row.id,
        actorType: row.actorType,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });
}
