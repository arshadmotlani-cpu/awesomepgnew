/**
 * Archive/delete orphan checkout settlement for APG-2026-0045 (Kunal repair).
 *
 * Usage:
 *   npx tsx scripts/repair-orphan-settlement.ts --id 95e93de1-1b6a-40cd-bdfa-6a4b7238dea4
 *   npx tsx scripts/repair-orphan-settlement.ts --id 95e93de1-1b6a-40cd-bdfa-6a4b7238dea4 --dry-run
 */
import { eq } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
import { db } from '../src/db/client';
import { checkoutSettlements } from '../src/db/schema';
import { cleanupCheckoutSettlementForVacating } from '../src/services/checkoutSettlement';

loadProductionAuditEnv();
requireDatabaseUrl('repair-orphan-settlement.ts');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const idArg = process.argv.find((a) => a.startsWith('--id='))?.split('=')[1];
  const settlementId = idArg ?? '95e93de1-1b6a-40cd-bdfa-6a4b7238dea4';

  const [row] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, settlementId))
    .limit(1);

  if (!row) {
    console.log('Settlement not found:', settlementId);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        id: row.id,
        bookingId: row.bookingId,
        status: row.status,
        vacatingRequestId: row.vacatingRequestId,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log('Dry run — no changes.');
    return;
  }

  if (row.status === 'awaiting_resident_details' && !row.amountsLocked) {
    await db.delete(checkoutSettlements).where(eq(checkoutSettlements.id, settlementId));
    console.log('Deleted unlocked awaiting_resident_details settlement.');
    return;
  }

  const result = await cleanupCheckoutSettlementForVacating({
    vacatingRequestId: row.vacatingRequestId,
  });
  console.log('Cleanup result:', result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
