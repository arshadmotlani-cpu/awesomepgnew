import type { Logger } from 'drizzle-orm/logger';
import { recordAdminDbQuery } from '@/src/lib/admin/adminDbProfile';
import { logger } from '@/src/lib/logger';
import { getMonitoringContext } from '@/src/lib/monitoring/requestContext';

const ADMIN_DB_PROFILE = process.env.ADMIN_DB_PROFILE === '1';

/** Prevent logging the batched app_logs INSERT itself. */
export function shouldSkipDrizzleLog(query: string): boolean {
  return /insert\s+into\s+"?app_logs"?/i.test(query);
}

export const monitoringDrizzleLogger: Logger = {
  logQuery(query: string, params: unknown[]) {
    if (shouldSkipDrizzleLog(query)) {
      return;
    }

    if (ADMIN_DB_PROFILE) {
      recordAdminDbQuery(query);
    }

    // Production: never persist every SQL statement — app_logs grew to 469MB+ and
    // blocked all INSERTs (audit_log, payments). Opt in with MONITORING_LOG_ALL_DB_QUERIES=1.
    if (
      !ADMIN_DB_PROFILE &&
      process.env.NODE_ENV === 'production' &&
      process.env.MONITORING_LOG_ALL_DB_QUERIES !== '1'
    ) {
      return;
    }

    if (ADMIN_DB_PROFILE) {
      return;
    }

    const ctx = getMonitoringContext();
    logger.db('sql', {
      query: query.slice(0, 2000),
      paramCount: params.length,
      route: ctx?.route,
      requestId: ctx?.requestId,
    });
  },
};
