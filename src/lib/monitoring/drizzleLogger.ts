import type { Logger } from 'drizzle-orm/logger';
import { logger } from '@/src/lib/logger';
import { getMonitoringContext } from '@/src/lib/monitoring/requestContext';

/** Prevent logging the batched app_logs INSERT itself. */
export function shouldSkipDrizzleLog(query: string): boolean {
  return /insert\s+into\s+"?app_logs"?/i.test(query);
}

export const monitoringDrizzleLogger: Logger = {
  logQuery(query: string, params: unknown[]) {
    if (shouldSkipDrizzleLog(query)) {
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
