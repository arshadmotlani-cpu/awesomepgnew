import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAppEnv } from '@/src/lib/db/loadEnv';
import { loadProductionCutoverEnv } from '@/src/lib/db/loadProductionCutoverEnv';
import { loadStagingEnv } from '@/src/lib/db/loadStagingEnv';

const hasProductionCutoverEnvFile = existsSync(
  join(process.cwd(), '.env.production-cutover.local'),
);

if (process.env.STAGING_ONLY === '1') {
  loadStagingEnv();
} else if (
  process.env.PRODUCTION_CUTOVER === '1' ||
  process.env.CONFIRM_PRODUCTION_CUTOVER === '1' ||
  hasProductionCutoverEnvFile
) {
  loadProductionCutoverEnv();
} else {
  loadAppEnv();
}

import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { createPlatformClient } from '@/src/platform/db/client';
import { getPlatformDatabaseHost } from '@/src/platform/lib/db/env';

const MIGRATIONS_FOLDER = 'src/platform/db/migrations';
const MIGRATIONS_SCHEMA = 'drizzle_platform';
const MIGRATIONS_TABLE = '__drizzle_migrations';

async function main() {
  const host = getPlatformDatabaseHost();
  console.log(`Platform DB host: ${host ?? 'unknown'}`);
  console.log(`→ Running Platform migrations from ${MIGRATIONS_FOLDER} …`);

  const { db, close } = createPlatformClient({ max: 1 });

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
    sql.raw(`SELECT hash FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`),
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

  console.log(
    applied > 0
      ? `✓ Applied ${applied} Platform migration(s)`
      : '✓ Platform migrations up to date',
  );
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
