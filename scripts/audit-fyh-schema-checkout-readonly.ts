/* eslint-disable no-console */
/**
 * Read-only: verify FYH checkout schema + migration 0054 state on production Hair DB.
 * Loads app env (use .env.production.local or HAIR_DATABASE_URL in shell).
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { sql } from 'drizzle-orm';
import { createHairClient } from '@/src/hair/db/client';
import { getHairDatabaseHost } from '@/src/hair/lib/db/env';

async function main() {
  const host = getHairDatabaseHost();
  console.log(`Hair DB host: ${host ?? 'unknown'}`);
  const { db, close } = createHairClient({ max: 1 });

  const cols = await db.execute<{ column_name: string }>(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fyh_invoices'
      AND column_name IN ('checkout_attempt_key')
  `);

  const opsTable = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'fyh_checkout_operations'
    ) AS exists
  `);

  const migrations = await db.execute<{ hash: string; created_at: string }>(sql`
    SELECT hash, created_at::text
    FROM drizzle_hair.__drizzle_migrations
    ORDER BY created_at DESC
    LIMIT 8
  `);

  const migrationFiles = await db.execute<{ tag: string }>(sql`
    SELECT 1 AS tag WHERE false
  `).catch(() => []);

  console.log(
    JSON.stringify(
      {
        checkoutAttemptKeyColumn: cols.map((c) => c.column_name),
        fyhCheckoutOperationsTable: opsTable[0]?.exists ?? false,
        recentMigrationHashes: migrations,
        migrationFilesNote: 'Compare hashes to src/hair/db/migrations/meta/_journal.json',
      },
      null,
      2,
    ),
  );

  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
