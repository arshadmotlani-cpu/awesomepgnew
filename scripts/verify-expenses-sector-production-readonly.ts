/* eslint-disable no-console */
/**
 * READ-ONLY production verification for FYH expenses sector (migration 0052).
 */
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { sql } from 'drizzle-orm';
import { requireProductionHairReadOnlyEnv } from '@/src/lib/db/loadProductionCutoverEnv';
import { createHairClient } from '@/src/hair/db/client';
import { getResolvedProductionHairHost } from '@/src/lib/db/loadProductionCutoverEnv';

const MIGRATIONS_FOLDER = 'src/hair/db/migrations';
const MIGRATIONS_SCHEMA = 'drizzle_hair';
const MIGRATIONS_TABLE = '__drizzle_migrations';

const EXPECTED_COLUMNS = [
  'expense_for',
  'paid_by',
  'staff_employee_id',
  'bill_number',
  'company_name',
  'reference_id',
  'source',
  'status',
  'attachment_content_type',
  'created_by_employee_id',
  'updated_by_employee_id',
  'cancelled_at',
  'cancelled_by_employee_id',
  'cancellation_reason',
];

async function main() {
  requireProductionHairReadOnlyEnv();
  console.log(`Production Hair host: ${getResolvedProductionHairHost()}\n`);

  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  const m0052 = migrations.find((m) => m.folderMillis === 1759600000000);
  if (!m0052) throw new Error('Could not locate 0052_expenses_sector migration hash');

  const { db, close } = createHairClient({ max: 1 });

  const applied = await db.execute<{ hash: string; created_at: string }>(
    sql.raw(
      `SELECT hash, created_at FROM "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ORDER BY created_at DESC LIMIT 20`,
    ),
  );
  const appliedList = Array.isArray(applied) ? applied : [applied];
  const has0052 = appliedList.some((r) => r.hash === m0052.hash);
  console.log(`Migration 0052_expenses_sector applied: ${has0052 ? 'YES' : 'NO'}`);
  console.log(`  expected hash: ${m0052.hash.slice(0, 16)}…`);

  const cols = await db.execute<{ column_name: string }>(sql.raw(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fyh_expenses'
    ORDER BY column_name
  `));
  const colSet = new Set((Array.isArray(cols) ? cols : [cols]).map((c) => c.column_name));
  const missingCols = EXPECTED_COLUMNS.filter((c) => !colSet.has(c));
  console.log(`\nSchema columns missing (${missingCols.length}): ${missingCols.join(', ') || 'none'}`);

  const indexes = await db.execute<{ indexname: string }>(sql.raw(`
    SELECT indexname FROM pg_indexes WHERE tablename = 'fyh_expenses'
  `));
  const indexNames = (Array.isArray(indexes) ? indexes : [indexes]).map((i) => i.indexname);
  console.log(`\nIndexes on fyh_expenses: ${indexNames.join(', ')}`);
  console.log(`  purchase_id unique partial: ${indexNames.some((n) => n.includes('purchase_id_uidx')) ? 'YES' : 'NO'}`);

  const dupes = await db.execute<{ purchase_id: string; cnt: number }>(sql.raw(`
    SELECT purchase_id::text, COUNT(*)::int AS cnt
    FROM fyh_expenses
    WHERE purchase_id IS NOT NULL
    GROUP BY purchase_id
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `));
  const dupeList = Array.isArray(dupes) ? dupes : dupes ? [dupes] : [];
  console.log(`\nDuplicate purchase_id groups: ${dupeList.length}`);
  for (const d of dupeList) console.log(`  purchase_id=${d.purchase_id} count=${d.cnt}`);

  const stats = await db.execute<{
    total: number;
    active: number;
    cancelled: number;
    purchase_source: number;
    manual_source: number;
    salary_category: number;
    purchase_linked: number;
    purchase_source_mismatch: number;
  }>(sql.raw(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      COUNT(*) FILTER (WHERE source = 'purchase')::int AS purchase_source,
      COUNT(*) FILTER (WHERE source = 'manual')::int AS manual_source,
      COUNT(*) FILTER (WHERE category = 'salary')::int AS salary_category,
      COUNT(*) FILTER (WHERE purchase_id IS NOT NULL)::int AS purchase_linked,
      COUNT(*) FILTER (WHERE purchase_id IS NOT NULL AND source <> 'purchase')::int AS purchase_source_mismatch
    FROM fyh_expenses
  `));
  const s = (Array.isArray(stats) ? stats[0] : stats) as Record<string, number>;
  console.log('\nfyh_expenses row safety:');
  console.log(`  total rows: ${s.total}`);
  console.log(`  active: ${s.active}, cancelled: ${s.cancelled}`);
  console.log(`  source=purchase: ${s.purchase_source}, source=manual: ${s.manual_source}`);
  console.log(`  category=salary (legacy): ${s.salary_category}`);
  console.log(`  purchase_id set: ${s.purchase_linked}`);
  console.log(`  purchase_id but source!=purchase: ${s.purchase_source_mismatch}`);

  const agg = await db.execute<{ general_active: number; salary_active: number }>(sql.raw(`
    SELECT
      COALESCE(SUM(amount_paise) FILTER (
        WHERE status = 'active' AND category <> 'salary'
      ), 0)::bigint AS general_active,
      COALESCE(SUM(amount_paise) FILTER (
        WHERE status = 'active' AND category = 'salary'
      ), 0)::bigint AS salary_active
    FROM fyh_expenses
  `));
  const a = (Array.isArray(agg) ? agg[0] : agg) as { general_active: number; salary_active: number };
  console.log('\nAggregation checksum (all locations/orgs):');
  console.log(`  general active excl salary (paise): ${a.general_active}`);
  console.log(`  legacy salary category active (paise): ${a.salary_active}`);

  const samplePurchase = await db.execute(sql.raw(`
    SELECT e.id, e.purchase_id, e.source, e.status, e.amount_paise, p.purchase_number
    FROM fyh_expenses e
    INNER JOIN fyh_purchases p ON p.id = e.purchase_id
    WHERE e.purchase_id IS NOT NULL
    ORDER BY e.created_at DESC
    LIMIT 3
  `));
  console.log('\nSample purchase-linked expenses (latest 3):');
  console.log(JSON.stringify(samplePurchase, null, 2));

  await close();

  if (!has0052 || missingCols.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
