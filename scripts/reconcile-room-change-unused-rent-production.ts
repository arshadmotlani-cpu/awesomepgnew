/* eslint-disable no-console */
/**
 * Preview or apply room-change unused rent surplus reconciliation (production).
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/reconcile-room-change-unused-rent-production.ts
 *   USE_PRODUCTION_DB=1 npx tsx scripts/reconcile-room-change-unused-rent-production.ts --apply
 *   USE_PRODUCTION_DB=1 npx tsx scripts/reconcile-room-change-unused-rent-production.ts --apply APG-2026-0112
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('reconcile-room-change-unused-rent');

import { eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bookings, roomChangeRequests } from '../src/db/schema';
import { paiseToInr } from '../src/lib/format';
import { getDepositRefundCeilingForBooking } from '../src/lib/deposits/depositRefundCeiling';
import { getResidentCreditBalance } from '../src/services/residentCreditLedger';
import {
  applyAllRoomChangeUnusedRentReconciliations,
  applyRoomChangeUnusedRentReconciliation,
  previewRoomChangeUnusedRentReconciliation,
} from '../src/services/roomChangeUnusedRentReconciliation';

const apply = process.argv.includes('--apply');
const bookingCodeArg = process.argv.find((a) => a.startsWith('APG-'));

async function main() {
  let requestId: string | undefined;
  if (bookingCodeArg) {
    const [bk] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.bookingCode, bookingCodeArg))
      .limit(1);
    if (!bk) throw new Error(`Booking ${bookingCodeArg} not found`);
    const [rcr] = await db
      .select({ id: roomChangeRequests.id })
      .from(roomChangeRequests)
      .where(eq(roomChangeRequests.bookingId, bk.id))
      .limit(1);
    requestId = rcr?.id;
  }

  const previews = await previewRoomChangeUnusedRentReconciliation(
    requestId ? { requestId } : undefined,
  );

  console.log('\n=== PREVIEW (read-only) ===');
  for (const row of previews) {
    if (!row.needsCorrection && row.correctionPaise <= 0) continue;
    console.log(
      JSON.stringify(
        {
          bookingCode: row.bookingCode,
          customerName: row.customerName,
          requestId: row.requestId,
          shiftDate: row.shiftDate,
          quoteOldRent: paiseToInr(row.quoteOldRentPaise),
          basisOldRent: paiseToInr(row.basisOldRentPaise),
          basisSource: row.basisSource,
          postedSurplus: paiseToInr(row.postedSurplusPaise),
          correctSurplus: paiseToInr(row.correctSurplusPaise),
          correction: paiseToInr(row.correctionPaise),
        },
        null,
        2,
      ),
    );
  }

  const needing = previews.filter((p) => p.needsCorrection && p.correctionPaise > 0);
  console.log(`\nAffected needing correction: ${needing.length}`);

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to post idempotent corrections.');
    await closeDb();
    return;
  }

  console.log('\n=== APPLY ===');
  const { results } = requestId
    ? {
        results: [
          await applyRoomChangeUnusedRentReconciliation({ requestId, dryRun: false }),
        ],
      }
    : await applyAllRoomChangeUnusedRentReconciliations({ dryRun: false });

  for (const r of results) {
    console.log(r);
  }

  if (bookingCodeArg) {
    const [bk] = await db
      .select({ id: bookings.id, customerId: bookings.customerId })
      .from(bookings)
      .where(eq(bookings.bookingCode, bookingCodeArg))
      .limit(1);
    if (bk) {
      const credit = await getResidentCreditBalance(bk.customerId);
      const ceiling = await getDepositRefundCeilingForBooking(bk.id);
      console.log('\n=== POST-VERIFY', bookingCodeArg, '===');
      console.log('Rent credit balance:', paiseToInr(credit));
      if (ceiling) {
        console.log('Deposit held:', paiseToInr(ceiling.heldPaise));
        console.log('Required deposit:', paiseToInr(ceiling.requiredPaise));
        console.log('Deposit refund ceiling:', paiseToInr(ceiling.availableToRequestPaise));
      }
    }
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
