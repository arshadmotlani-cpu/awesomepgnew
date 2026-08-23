/**
 * Read-only audit: count non-null payment screenshot URLs across PG proof tables.
 * Does NOT drop or mutate columns. Run before any future DROP decision.
 *
 * Usage: npx tsx scripts/audit-payment-screenshots-readonly.ts
 */
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

type CountRow = { table: string; column: string; nonNull: number; total: number };

async function countNonNull(table: string, column: string): Promise<CountRow> {
  const result = await db.execute(sql.raw(`
    SELECT
      count(*)::int AS total,
      count(${column})::int AS non_null
    FROM ${table}
  `));
  const row = (result as unknown as { rows?: Array<{ total: number; non_null: number }> }).rows?.[0]
    ?? (Array.isArray(result) ? (result as Array<{ total: number; non_null: number }>)[0] : null);
  return {
    table,
    column,
    total: Number(row?.total ?? 0),
    nonNull: Number(row?.non_null ?? 0),
  };
}

async function main() {
  const targets: Array<[string, string]> = [
    ['pg_payment_records', 'payment_screenshot_url'],
    ['rent_invoices', 'payment_proof_url'],
    ['electricity_invoices', 'payment_proof_url'],
    ['stay_extensions', 'payment_proof_url'],
    ['payment_links', 'payment_proof_url'],
    ['playstation_memberships', 'payment_proof_url'],
  ];

  console.log('Read-only payment screenshot audit (no DROP)\\n');
  const rows: CountRow[] = [];
  for (const [table, column] of targets) {
    try {
      const row = await countNonNull(table, column);
      rows.push(row);
      console.log(
        `${table}.${column}: ${row.nonNull} non-null / ${row.total} total`,
      );
    } catch (err) {
      console.log(`${table}.${column}: ERROR ${err instanceof Error ? err.message : err}`);
    }
  }

  const anyScreenshots = rows.some((r) => r.nonNull > 0);
  console.log(
    anyScreenshots
      ? '\\nScreenshots still present — do NOT drop columns without explicit sign-off.'
      : '\\nNo non-null screenshots found in audited tables (still prefer keep columns until signed off).',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
