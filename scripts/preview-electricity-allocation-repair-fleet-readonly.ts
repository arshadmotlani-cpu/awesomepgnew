#!/usr/bin/env npx tsx
/**
 * READ-ONLY fleet preview: electricity bills needing allocation repair
 * (contributor with non-zero unpaid invoice, etc.)
 *
 * Usage: npx tsx scripts/preview-electricity-allocation-repair-fleet-readonly.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('preview-electricity-allocation-repair');

import { closeDb, db } from '@/src/db/client';
import { electricityBills } from '@/src/db/schema';
import { sql } from 'drizzle-orm';
import { previewElectricityBillAllocation } from '@/src/services/repairElectricityBillAllocation';

async function main(): Promise<void> {
  const billIds = await db
    .select({ id: electricityBills.id })
    .from(electricityBills)
    .where(sql`${electricityBills.isPipelineTest} = false`)
    .orderBy(electricityBills.billingMonth);

  let needsRepair = 0;
  for (const { id } of billIds) {
    const preview = await previewElectricityBillAllocation(id);
    if (!preview || preview.plan.kind === 'noop') continue;
    needsRepair += 1;
    if (needsRepair <= 15) {
      console.log(
        `REPAIR ${preview.pgName} room ${preview.roomNumber} ${preview.billingMonth}: ${preview.plan.kind}`,
      );
    }
  }

  console.log(`\nBills scanned: ${billIds.length}`);
  console.log(`Bills needing allocation repair: ${needsRepair}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
