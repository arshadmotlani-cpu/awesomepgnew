import { desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { appLogs } from '@/src/db/schema/appLogs';

function startOfDayUtc(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfWeekUtc(date = new Date()): Date {
  const d = startOfDayUtc(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

export type SystemHealthSnapshot = {
  errorsToday: number;
  errorsThisWeek: number;
  lastCriticalError: { message: string; createdAt: string; route: string | null } | null;
  uptimeStatus: 'healthy' | 'degraded' | 'critical';
};

export function getSentryDashboardUrl(): string | null {
  const org = process.env.SENTRY_ORG?.trim();
  const project = process.env.SENTRY_PROJECT?.trim();
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  const regionBase = dsn?.includes('ingest.de.sentry.io')
    ? 'https://de.sentry.io'
    : 'https://sentry.io';

  if (org && project) {
    return `${regionBase}/organizations/${encodeURIComponent(org)}/issues/?project=${encodeURIComponent(project)}`;
  }

  if (!dsn) return null;

  try {
    const parsed = new URL(dsn);
    const projectId = parsed.pathname.replace(/^\//, '');
    if (projectId) {
      return `${regionBase}/issues/?project=${encodeURIComponent(projectId)}`;
    }
    return regionBase;
  } catch {
    return null;
  }
}

/** Query app_logs for error counts and last critical failure. */
export async function getSystemHealthSnapshot(): Promise<SystemHealthSnapshot> {
  const now = new Date();
  const todayStart = startOfDayUtc(now);
  const weekStart = startOfWeekUtc(now);
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  try {
    const [counts] = await db
      .select({
        errorsToday: sql<number>`count(*) filter (where ${appLogs.level} = 'error' and ${appLogs.createdAt} >= ${todayStart})::int`,
        errorsThisWeek: sql<number>`count(*) filter (where ${appLogs.level} = 'error' and ${appLogs.createdAt} >= ${weekStart})::int`,
        errorsLastHour: sql<number>`count(*) filter (where ${appLogs.level} = 'error' and ${appLogs.createdAt} >= ${hourAgo})::int`,
      })
      .from(appLogs);

    const [lastError] = await db
      .select({
        message: appLogs.message,
        createdAt: appLogs.createdAt,
        route: appLogs.route,
      })
      .from(appLogs)
      .where(eq(appLogs.level, 'error'))
      .orderBy(desc(appLogs.createdAt))
      .limit(1);

    const errorsToday = counts?.errorsToday ?? 0;
    const errorsThisWeek = counts?.errorsThisWeek ?? 0;
    const errorsLastHour = counts?.errorsLastHour ?? 0;

    let uptimeStatus: SystemHealthSnapshot['uptimeStatus'] = 'healthy';
    if (errorsLastHour >= 10 || errorsToday >= 50) {
      uptimeStatus = 'critical';
    } else if (errorsLastHour >= 3 || errorsToday >= 10) {
      uptimeStatus = 'degraded';
    }

    return {
      errorsToday,
      errorsThisWeek,
      lastCriticalError: lastError
        ? {
            message: lastError.message,
            createdAt: lastError.createdAt.toISOString(),
            route: lastError.route,
          }
        : null,
      uptimeStatus,
    };
  } catch {
    return {
      errorsToday: 0,
      errorsThisWeek: 0,
      lastCriticalError: null,
      uptimeStatus: 'healthy',
    };
  }
}
