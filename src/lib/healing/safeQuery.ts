import { logger } from '@/src/lib/logger';
import { isDbConnectionError } from '@/src/lib/db/db-safe';
import { getSystemState, patchSystemState, recordRetry } from '@/src/lib/healing/systemState';

export type SafeQueryResult<T> = {
  data: T;
  recovered: boolean;
  degraded: boolean;
  error?: string;
};

/**
 * Self-healing query wrapper — retry once, return fallback instead of throwing.
 */
export async function safeQuery<T>(
  queryName: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<SafeQueryResult<T>> {
  const run = async (attempt: number): Promise<T> => {
    const start = Date.now();
    try {
      const data = await fn();
      const durationMs = Date.now() - start;
      if (durationMs > 500) {
        logger.warn('slow query in safeQuery', { queryName, durationMs, attempt });
      }
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      recordRetry(`query:${queryName}:attempt-${attempt}`, false, message);
      logger.error('safeQuery failure', { queryName, attempt, message, stack });
      throw err;
    }
  };

  try {
    const data = await run(1);
    recordRetry(`query:${queryName}`, true);
    return { data, recovered: false, degraded: false };
  } catch (firstErr) {
    const firstMessage = firstErr instanceof Error ? firstErr.message : String(firstErr);

    try {
      const data = await run(2);
      recordRetry(`query:${queryName}:recovery`, true);
      patchSystemState({ lastRecoveredAt: new Date().toISOString() });
      logger.info('safeQuery recovered on retry', { queryName });
      return { data, recovered: true, degraded: false };
    } catch (secondErr) {
      const message = secondErr instanceof Error ? secondErr.message : String(secondErr);
      const failures = getSystemState().consecutiveFailures + 1;

      patchSystemState({
        dbDegradedMode: true,
        dbStatus: isDbConnectionError(message) ? 'down' : 'degraded',
        degradedMode: true,
        lastError: message,
        consecutiveFailures: failures,
      });

      if (isDbConnectionError(message) || isDbConnectionError(firstMessage)) {
        patchSystemState({ safeMode: failures >= 3 });
      }

      return {
        data: fallback,
        recovered: false,
        degraded: true,
        error: message,
      };
    }
  }
}
