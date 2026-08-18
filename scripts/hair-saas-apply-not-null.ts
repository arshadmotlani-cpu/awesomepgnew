/* eslint-disable no-console */
/**
 * Apply Phase 0B NOT NULL tenant constraints (S9) — staging only after gates green.
 * Not part of automatic hair:db:migrate (destructive).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { requireStagingEnv } from '@/src/lib/db/loadStagingEnv';

requireStagingEnv();

import { createHairClient } from '@/src/hair/db/client';
import { getHairDatabaseHost } from '@/src/hair/lib/db/env';

async function main() {
  const host = getHairDatabaseHost();
  console.log(`Hair DB host: ${host ?? 'unknown'}`);
  console.log('→ Applying 0037_saas_not_null.sql (manual gate S9)…');

  const sqlPath = resolve('src/hair/db/migrations/0037_saas_not_null.sql');
  const body = readFileSync(sqlPath, 'utf8');
  const statements = body
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--'));

  const { db, close } = createHairClient({ max: 1 });
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt));
  }
  await close();
  console.log('✓ NOT NULL tenant constraints applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
