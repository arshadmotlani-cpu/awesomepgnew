/**
 * Lightweight timing logs for admin SSR debugging (production-safe).
 * Enable with ADMIN_PROFILE=1 or NODE_ENV=development.
 */

const ENABLED =
  process.env.ADMIN_PROFILE === '1' ||
  process.env.NODE_ENV === 'development';

export async function profileAdminStep<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!ENABLED) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    console.info(`[admin-profile] ${label} ${ms}ms`);
  }
}

export function profileAdminSyncStep(label: string, startMs: number): void {
  if (!ENABLED) return;
  console.info(`[admin-profile] ${label} ${Math.round(performance.now() - startMs)}ms`);
}
