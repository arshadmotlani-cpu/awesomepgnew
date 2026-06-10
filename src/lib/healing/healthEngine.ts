import { testDatabaseConnection } from '@/src/lib/db/db-safe';
import { checkRequiredEnv } from '@/src/lib/healing/envHealer';
import {
  getSystemState,
  patchSystemState,
  type HealthStatus,
} from '@/src/lib/healing/systemState';
import { logger } from '@/src/lib/logger';
import { runWithoutLogPersistence } from '@/src/lib/monitoring/logStore';

const RECOVERY_INTERVAL_MS = 45_000;
const GLOBAL_KEY = '__awesomepgLastRecovery' as const;

function lastRecoveryAt(): number {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: number };
  return g[GLOBAL_KEY] ?? 0;
}

function setLastRecoveryAt(ms: number): void {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: number };
  g[GLOBAL_KEY] = ms;
}

function computeStatus(
  envOk: boolean,
  dbOk: boolean,
  consecutiveFailures: number,
): HealthStatus {
  if (!envOk && !dbOk) return 'CRITICAL';
  if (!dbOk || consecutiveFailures >= 3) return 'CRITICAL';
  if (!envOk) return 'DEGRADED';
  return 'HEALTHY';
}

async function persistHealthSnapshot(): Promise<void> {
  const state = getSystemState();
  try {
    await runWithoutLogPersistence(async () => {
      const { createClient } = await import('@/src/db/client');
      const { systemHealth } = await import('@/src/db/schema/systemHealth');
      const { db, close } = createClient({ max: 1 });
      try {
        await db.insert(systemHealth).values({
          status: state.status,
          dbStatus: state.dbStatus,
          envStatus: state.envStatus,
          lastError: state.lastError,
        });
      } finally {
        await close();
      }
    });
  } catch {
    // Persistence is best-effort — in-memory state remains authoritative.
  }
}

/** Lightweight per-request / periodic diagnosis. */
export async function runHealthDiagnosis(): Promise<ReturnType<typeof getSystemState>> {
  const env = checkRequiredEnv();
  const db = await testDatabaseConnection();

  const prev = getSystemState();
  const consecutiveFailures = db.ok ? 0 : prev.consecutiveFailures + 1;
  const status = computeStatus(env.ok, db.ok, consecutiveFailures);
  const safeMode = !db.ok && (!env.ok || consecutiveFailures >= 3);

  const next = patchSystemState({
    status,
    dbStatus: db.ok ? 'ok' : 'down',
    envStatus: env.ok ? 'ok' : 'degraded',
    degradedMode: status !== 'HEALTHY',
    dbDegradedMode: !db.ok,
    safeMode,
    consecutiveFailures,
    ...(db.ok && status === 'HEALTHY'
      ? { lastRecoveredAt: new Date().toISOString(), lastError: null }
      : {}),
    ...(!db.ok && db.error ? { lastError: db.error } : {}),
  });

  if (status !== 'HEALTHY') {
    logger.warn('health diagnosis', {
      status,
      envMissing: env.missing,
      dbError: db.error ?? null,
      safeMode,
    });
  }

  void persistHealthSnapshot();
  return next;
}

/** Throttled recovery loop — safe on Vercel serverless. */
export async function maybeRunRecoveryCheck(): Promise<void> {
  const now = Date.now();
  if (now - lastRecoveryAt() < RECOVERY_INTERVAL_MS) return;
  setLastRecoveryAt(now);
  await runHealthDiagnosis();
}

export async function getLatestPersistedHealth() {
  try {
    return await runWithoutLogPersistence(async () => {
      const { createClient } = await import('@/src/db/client');
      const { systemHealth } = await import('@/src/db/schema/systemHealth');
      const { desc } = await import('drizzle-orm');
      const { db, close } = createClient({ max: 1 });
      try {
        const [row] = await db
          .select()
          .from(systemHealth)
          .orderBy(desc(systemHealth.updatedAt))
          .limit(1);
        return row ?? null;
      } finally {
        await close();
      }
    });
  } catch {
    return null;
  }
}
