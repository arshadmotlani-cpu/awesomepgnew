import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

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

/**
 * Run pending SQL migrations one file at a time, each in its own transaction.
 *
 * Drizzle's default migrator wraps ALL pending migrations in a single
 * transaction, which breaks PostgreSQL enum extensions (new labels must commit
 * before they can be referenced in indexes).
 *
 * Pending detection uses migration content hashes (not folder timestamps) so a
 * journal gap — e.g. 0094 applied before 0093 was registered — still applies
 * the missing file on the next run.
 */
async function main() {
  const connectionInfo = getDatabaseConnectionInfo();
  assertSafeMigrationTarget(connectionInfo);

  const { db, sql: pg, close } = createClient({ max: 1 });
  const statsBefore = await readMigrationStats(pg);
  console.log(formatMigrationConnectionBanner(connectionInfo, statsBefore));
  console.log(`→ Running migrations from ${MIGRATIONS_FOLDER} …`);

  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${MIGRATIONS_SCHEMA}"`));
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `));

  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const appliedRows = await db.execute<{ hash: string }>(
    sql.raw(
      `SELECT hash FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
    ),
  );
  const appliedHashes = new Set(appliedRows.map((row) => row.hash));

  let applied = 0;
  for (const migration of migrations) {
    if (appliedHashes.has(migration.hash)) continue;

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

  console.log(applied > 0 ? `✓ Applied ${applied} migration(s)` : '✓ Migrations up to date');

  const statsAfter = await readMigrationStats(pg);
  console.log(formatMigrationConnectionBanner(connectionInfo, statsAfter));

  const { syncMissingCheckoutSettlements } = await import('@/src/services/checkoutSettlement');
  const backfill = await syncMissingCheckoutSettlements();
  if (backfill.created > 0) {
    console.log(
      `✓ Backfilled ${backfill.created} checkout settlement(s) for legacy vacating approvals`,
    );
  }

  await bootstrapAdminIfNeeded();
  await close();
}

main().catch((err) => {
  console.error('✗ Migration failed:', err);
  process.exit(1);
});
