import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();
import { sql } from 'drizzle-orm';
import { createClient } from '@/src/db/client';

async function main() {
  const { db, close } = createClient({ max: 1 });
  const cols = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pg_approved_transaction_refs'
    ORDER BY 1
  `);
  console.log(
    'pg_approved_transaction_refs columns:',
    cols.map((c: { column_name: string }) => c.column_name).join(', '),
  );
  const cnt = await db.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
  console.log('drizzle migration rows:', (cnt[0] as { n: number }).n);
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
