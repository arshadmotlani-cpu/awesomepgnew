import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { createCapitalClient } from '@/src/capital/db/client';
import { getInvestDatabaseHost } from '@/src/capital/lib/db/env';

const MIGRATIONS_FOLDER = 'src/capital/db/migrations';
const MIGRATIONS_SCHEMA = 'drizzle_capital';
const MIGRATIONS_TABLE = '__drizzle_migrations';

async function main() {
  const host = getInvestDatabaseHost();
  console.log(`Capital DB host: ${host ?? 'unknown'}`);
  console.log(`→ Running Capital migrations from ${MIGRATIONS_FOLDER} …`);

  const { db, close } = createCapitalClient({ max: 1 });

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

  console.log(applied > 0 ? `✓ Applied ${applied} Capital migration(s)` : '✓ Capital migrations up to date');
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
