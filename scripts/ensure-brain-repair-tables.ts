import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('check-brain-tables');

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb, db } from '@/src/db/client';
import { sql } from 'drizzle-orm';

async function main() {
  const apply = process.argv.includes('--apply');
  const check = await db.execute(
    sql`SELECT to_regclass('public.brain_integrity_issues')::text AS t`,
  );
  const rows = Array.isArray(check) ? check : ((check as { rows?: Array<{ t: string | null }> }).rows ?? []);
  const exists = (rows[0] as { t?: string | null } | undefined)?.t;
  console.log(JSON.stringify({ brain_integrity_issues: exists ?? null }));

  if (!exists && apply) {
    const ddl = readFileSync(
      join(process.cwd(), 'src/db/migrations/0140_brain_repair_engine.sql'),
      'utf8',
    );
    await db.execute(sql.raw(ddl));
    console.log('Applied 0140_brain_repair_engine.sql');
  } else if (!exists) {
    console.log('Missing tables — re-run with --apply to create');
    process.exitCode = 2;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
