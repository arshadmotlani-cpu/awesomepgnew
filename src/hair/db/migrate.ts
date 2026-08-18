import { loadAppEnv } from '@/src/lib/db/loadEnv';
import { loadStagingEnv } from '@/src/lib/db/loadStagingEnv';

if (process.env.STAGING_ONLY === '1') {
  loadStagingEnv();
} else {
  loadAppEnv();
}

import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { createHairClient } from '@/src/hair/db/client';
import { getHairDatabaseHost } from '@/src/hair/lib/db/env';

const MIGRATIONS_FOLDER = 'src/hair/db/migrations';
const MIGRATIONS_SCHEMA = 'drizzle_hair';
const MIGRATIONS_TABLE = '__drizzle_migrations';

async function main() {
  const host = getHairDatabaseHost();
  console.log(`Hair DB host: ${host ?? 'unknown'}`);
  console.log(`→ Running For Your Hair migrations from ${MIGRATIONS_FOLDER} …`);

  const { db, close } = createHairClient({ max: 1 });

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
      ? `✓ Applied ${applied} For Your Hair migration(s)`
      : '✓ For Your Hair migrations up to date',
  );
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
