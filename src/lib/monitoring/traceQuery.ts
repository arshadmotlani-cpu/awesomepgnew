import { logger } from '@/src/lib/logger';
import { recordQueryStat } from '@/src/lib/monitoring/runtimeDiagnostics';
import { getMonitoringContext } from '@/src/lib/monitoring/requestContext';

const SLOW_QUERY_MS = 200;

export async function traceQuery<T>(queryName: string, fn: () => Promise<T>): Promise<T> {
  const ctx = getMonitoringContext();
  const startedAt = Date.now();

  try {
    const result = await fn();
    const durationMs = Date.now() - startedAt;
    recordQueryStat(queryName, durationMs);

    logger.db('query completed', {
      query: queryName,
      durationMs,
      route: ctx?.route,
      requestId: ctx?.requestId,
      slow: durationMs > SLOW_QUERY_MS,
    });

    if (durationMs > SLOW_QUERY_MS) {
      logger.warn('slow db query', {
        query: queryName,
        durationMs,
        route: ctx?.route,
        requestId: ctx?.requestId,
      });
    }

    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    recordQueryStat(queryName, durationMs);
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    logger.error('query failed', {
      query: queryName,
      durationMs,
      route: ctx?.route,
      requestId: ctx?.requestId,
      message,
      stack,
    });

    throw error;
  }
}
