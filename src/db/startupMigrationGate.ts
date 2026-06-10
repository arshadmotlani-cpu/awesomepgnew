import {
  checkMigrationHealth,
  formatMigrationHealthError,
} from './migrationHealth';

/**
 * Blocks dev server startup when the database is behind the repository.
 * Used by `npm run dev` (CLI) and Next.js instrumentation (Node runtime only).
 *
 * Must NOT import `dotenv/config` at module scope — Next.js loads instrumentation
 * in the Edge runtime where `process.argv` is undefined and dotenv crashes.
 */
export async function assertMigrationsAppliedForDev(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.SKIP_MIGRATION_CHECK === 'true') return;
  // Instrumentation also runs in the Edge runtime — filesystem/DB checks belong on Node.
  if (process.env.NEXT_RUNTIME === 'edge') return;

  let health;
  try {
    health = await checkMigrationHealth();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[db] Migration health check failed (non-fatal): ${message}`);
    return;
  }

  if (health.ok) {
    console.info(
      `[db] Migrations up to date (${health.appliedCount}/${health.codeCount} · ${health.latestCodeVersion})`,
    );
    return;
  }

  // Metadata unreadable — warn but do not block dev (degraded mode).
  if (health.codeCount === 0 && health.error?.includes('migration metadata')) {
    console.warn(`[db] Migration metadata unavailable: ${health.error}`);
    return;
  }

  console.error(formatMigrationHealthError(health));
  process.exit(1);
}

// CLI entry when run via `tsx src/db/startupMigrationGate.ts`
const cliScript = process.argv?.[1];
const isDirectRun =
  typeof cliScript === 'string' && cliScript.endsWith('startupMigrationGate.ts');
if (isDirectRun) {
  void import('dotenv/config').then(() => assertMigrationsAppliedForDev());
}
