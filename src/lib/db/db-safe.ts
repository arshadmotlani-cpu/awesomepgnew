import postgres, { type Sql } from 'postgres';
import { parseDatabaseUrl } from '@/src/lib/db/connectionOptions';
import { getDatabaseUrl, hasDatabaseUrl } from '@/src/lib/db/env';
import { logger } from '@/src/lib/logger';
import { getSystemState, patchSystemState, recordRetry } from '@/src/lib/healing/systemState';

const BACKOFF_MS = [500, 1000, 2000] as const;
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isDbConnectionError(message: string): boolean {
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|Connection terminated|password authentication failed|28P01|DATABASE URL missing/i.test(
    message,
  );
}

/** Probe Neon/Postgres with exponential backoff — never throws. */
export async function testDatabaseConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!hasDatabaseUrl()) {
    const error = 'DATABASE URL missing in environment variables';
    patchSystemState({
      dbStatus: 'down',
      dbDegradedMode: true,
      degradedMode: true,
      lastError: error,
    });
    return { ok: false, error };
  }

  let lastError = 'unknown connection error';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const label = `db-connect-attempt-${attempt + 1}`;
    let client: Sql | null = null;

    try {
      const url = getDatabaseUrl();
      const parsed = parseDatabaseUrl(url);
      client = postgres(parsed.connectionString, {
        ...parsed.options,
        max: 1,
        connection: { application_name: 'awesomepg-heal-probe' },
      });
      await client`SELECT 1 AS ok`;
      await client.end({ timeout: 3 });

      recordRetry(label, true);
      patchSystemState({
        dbStatus: 'ok',
        dbDegradedMode: false,
        lastRecoveredAt: new Date().toISOString(),
        consecutiveFailures: 0,
      });

      return { ok: true };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      recordRetry(label, false, lastError);
      if (client) {
        try {
          await client.end({ timeout: 2 });
        } catch {
          // ignore
        }
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(BACKOFF_MS[attempt] ?? 2000);
      }
    }
  }

  const failures = getSystemState().consecutiveFailures + 1;
  patchSystemState({
    dbStatus: 'down',
    dbDegradedMode: true,
    degradedMode: true,
    lastError,
    consecutiveFailures: failures,
  });

  try {
    logger.error('db self-heal: connection failed after retries', {
      attempts: MAX_ATTEMPTS,
      message: lastError,
    });
  } catch {
    // ignore
  }

  return { ok: false, error: lastError };
}

/** Create a short-lived client with retry — returns null on failure. */
export async function connectWithRetry(): Promise<Sql | null> {
  const probe = await testDatabaseConnection();
  if (!probe.ok) return null;

  try {
    const url = getDatabaseUrl();
    const parsed = parseDatabaseUrl(url);
    return postgres(parsed.connectionString, {
      ...parsed.options,
      max: 1,
      connection: { application_name: 'awesomepg-safe' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchSystemState({ dbDegradedMode: true, dbStatus: 'down', lastError: message });
    return null;
  }
}
