/**
 * Recalculate deal profits for all sold/settled vehicles after migration 0010.
 *
 * Usage (with INVEST_DATABASE_URL set):
 *   npx tsx scripts/capital-recalc-deal-profits.ts
 *
 * Safe to re-run — uses recalculateAsset which redistributes from profit_distribution_mode.
 */
import { eq, sql } from 'drizzle-orm';
import { capitalDb } from '../src/capital/db/client';
import { acAssets } from '../src/capital/db/schema';
import { recalculateAsset } from '../src/capital/services/assets';

async function main() {
  const rows = await capitalDb
    .select({ id: acAssets.id, displayName: acAssets.displayName })
    .from(acAssets)
    .where(sql`${acAssets.actualSalePricePaise} IS NOT NULL AND ${acAssets.status} <> 'cancelled'`);

  console.log(`Recalculating ${rows.length} sold/settled vehicles…`);
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await recalculateAsset(row.id);
      ok += 1;
      console.log(`  ✓ ${row.displayName} (${row.id})`);
    } catch (e) {
      failed += 1;
      console.error(`  ✗ ${row.displayName}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`Done. ok=${ok} failed=${failed}`);
  await capitalDb
    .select({ c: sql<number>`1` })
    .from(acAssets)
    .where(eq(acAssets.id, rows[0]?.id ?? '00000000-0000-0000-0000-000000000000'))
    .catch(() => null);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
