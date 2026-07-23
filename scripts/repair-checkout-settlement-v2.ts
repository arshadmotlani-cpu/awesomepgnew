/**
 * Recompute V2 waterfall snapshots for in-flight (unlocked) checkout settlements.
 *
 * Usage:
 *   CHECKOUT_SETTLEMENT_V2=1 npx tsx scripts/repair-checkout-settlement-v2.ts
 *   CHECKOUT_SETTLEMENT_V2=1 npx tsx scripts/repair-checkout-settlement-v2.ts --dry-run
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { vacatingRequests } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import {
  computeWaterfallForSettlement,
  persistWaterfallForSettlement,
} from '../src/lib/checkout/checkoutSettlementV2Compute';
import { isCheckoutSettlementV2Enabled } from '../src/lib/checkout/checkoutSettlementV2Flag';
import { formatDate } from '../src/lib/dates';
import { getDepositSummaryForBooking } from '../src/services/deposits';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!isCheckoutSettlementV2Enabled()) {
    console.error('Set CHECKOUT_SETTLEMENT_V2=1 before running repair.');
    process.exit(1);
  }

  const rows = await db.execute(sql`
    SELECT cs.*
    FROM checkout_settlements cs
    WHERE cs.amounts_locked = false
      AND cs.status IN ('awaiting_resident_details', 'awaiting_admin_review', 'refund_pending')
    ORDER BY cs.updated_at DESC
  `);

  let updated = 0;
  for (const settlement of rows) {
    const [vr] = await db
      .select({ vacatingDate: vacatingRequests.vacatingDate })
      .from(vacatingRequests)
      .where(eq(vacatingRequests.id, settlement.vacatingRequestId))
      .limit(1);
    if (!vr?.vacatingDate) continue;

    const wallet = await getDepositSummaryForBooking(settlement.bookingId);
    const waterfall = await computeWaterfallForSettlement({
      settlement,
      stayCheckoutDate: formatDate(vr.vacatingDate),
      depositHeldPaise: wallet?.refundableBalancePaise ?? 0,
    });
    if (!waterfall) continue;

    console.log(
      `${dryRun ? '[dry-run] ' : ''}${settlement.id} → total refund ₹${(waterfall.refund.totalPaise / 100).toFixed(2)}`,
    );
    if (!dryRun) {
      await persistWaterfallForSettlement(settlement.id, waterfall);
      updated += 1;
    }
  }

  console.log(`${dryRun ? 'Would update' : 'Updated'} ${updated} settlement(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
