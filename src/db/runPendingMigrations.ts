import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { createClient } from '@/src/db/client';
import { bootstrapAdminIfNeeded } from '@/src/lib/auth/bootstrapAdmin';
import { getDatabaseConnectionInfo } from '@/src/lib/db/env';
import {
  assertSafeMigrationTarget,
  formatMigrationConnectionBanner,
  readMigrationStats,
} from '@/src/lib/db/migrationSafety';

const MIGRATIONS_FOLDER = 'src/db/migrations';
const MIGRATIONS_SCHEMA = 'drizzle';
const MIGRATIONS_TABLE = '__drizzle_migrations';

export type MigrationLogFn = (line: string) => void;

/**
 * Run pending SQL migrations one file at a time (same logic as src/db/migrate.ts).
 */
export async function runPendingMigrations(onLog: MigrationLogFn = console.log): Promise<void> {
  const connectionInfo = getDatabaseConnectionInfo();
  assertSafeMigrationTarget(connectionInfo);

  const { db, sql: pg, close } = createClient({ max: 1 });
  const statsBefore = await readMigrationStats(pg);
  onLog(formatMigrationConnectionBanner(connectionInfo, statsBefore));
  onLog(`→ Running migrations from ${MIGRATIONS_FOLDER} …`);

  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `));

  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const lastRows = await db.execute<{ created_at: number | string }>(
    sql.raw(
      `SELECT created_at FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ORDER BY created_at DESC LIMIT 1`,
    ),
  );
  const lastMillis = lastRows[0] ? Number(lastRows[0].created_at) : 0;

  let applied = 0;
  for (const migration of migrations) {
    if (migration.folderMillis <= lastMillis) continue;

    await db.transaction(async (tx) => {
      for (const stmt of migration.sql) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;
        await tx.execute(sql.raw(trimmed));
      }
      await tx.execute(
        sql`INSERT INTO ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} (hash, created_at) VALUES (${migration.hash}, ${migration.folderMillis})`,
      );
    });
    applied += 1;
  }

  onLog(applied > 0 ? `✓ Applied ${applied} migration(s)` : '✓ Migrations up to date');

  const statsAfter = await readMigrationStats(pg);
  onLog(formatMigrationConnectionBanner(connectionInfo, statsAfter));

  const { syncMissingCheckoutSettlements } = await import('@/src/services/checkoutSettlement');
  const backfill = await syncMissingCheckoutSettlements();
  if (backfill.created > 0) {
    onLog(
      `✓ Backfilled ${backfill.created} checkout settlement(s) for legacy vacating approvals`,
    );
  }

  await bootstrapAdminIfNeeded();
  await close();
}
