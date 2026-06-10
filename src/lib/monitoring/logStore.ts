import type { NewAppLog } from '@/src/db/schema/appLogs';

type PendingLog = Omit<NewAppLog, 'id' | 'createdAt'>;

const FLUSH_INTERVAL_MS = 2_000;
const BATCH_SIZE = 25;

let queue: PendingLog[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let persistenceDisabled = false;

/** Skip tracing inserts into app_logs (avoid infinite loops). */
let suppressPersistence = false;

export function setLogPersistenceEnabled(enabled: boolean): void {
  persistenceDisabled = !enabled;
}

export async function runWithoutLogPersistence<T>(fn: () => Promise<T>): Promise<T> {
  const prev = suppressPersistence;
  suppressPersistence = true;
  try {
    return await fn();
  } finally {
    suppressPersistence = prev;
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushLogQueue();
  }, FLUSH_INTERVAL_MS);
}

export function enqueueLog(entry: PendingLog): void {
  if (process.env.NODE_ENV === 'test' || persistenceDisabled || suppressPersistence) return;

  queue.push(entry);
  if (queue.length >= BATCH_SIZE) {
    void flushLogQueue();
    return;
  }
  scheduleFlush();
}

export async function flushLogQueue(): Promise<void> {
  if (flushing || queue.length === 0 || persistenceDisabled || suppressPersistence) return;

  flushing = true;
  const batch = queue.splice(0, BATCH_SIZE);

  try {
    const { createClient } = await import('@/src/db/client');
    const { appLogs } = await import('@/src/db/schema/appLogs');

    await runWithoutLogPersistence(async () => {
      const { db, close } = createClient({ max: 1 });
      try {
        await db.insert(appLogs).values(batch);
      } finally {
        await close();
      }
    });
  } catch (err) {
    console.error('[logger] failed to persist batch', err instanceof Error ? err.message : err);
  } finally {
    flushing = false;
    if (queue.length > 0) scheduleFlush();
  }
}
