/**
 * Read-only diagnostic: compare legacy preview vs V2 waterfall for checkout settlements.
 *
 * Usage:
 *   npx tsx scripts/verify-checkout-settlement-v2.ts
 *   npx tsx scripts/verify-checkout-settlement-v2.ts --booking BOOKING_UUID
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { checkoutSettlements, vacatingRequests } from '../src/db/schema';
import { computeCheckoutRefundPreview } from '../src/lib/billing/checkoutRefundPreview';
import { resolveCheckoutElectricitySharePaise } from '../src/lib/checkout/electricitySettlementCalc';
import { computeWaterfallForSettlement } from '../src/lib/checkout/checkoutSettlementV2Compute';
import { getDepositSummaryForBooking } from '../src/services/deposits';
import { formatDate } from '../src/lib/dates';

async function main() {
  const bookingArg = process.argv.find((a) => a.startsWith('--booking='))?.split('=')[1];

  const rows = bookingArg
    ? await db
        .select()
        .from(checkoutSettlements)
        .where(eq(checkoutSettlements.bookingId, bookingArg))
        .limit(5)
    : await db.execute(sql`
        SELECT cs.*
        FROM checkout_settlements cs
        WHERE cs.amounts_locked = false
          AND cs.status IN ('awaiting_resident_details', 'awaiting_admin_review')
        ORDER BY cs.updated_at DESC
        LIMIT 20
      `);

  const settlements = Array.isArray(rows) ? rows : [rows].flat();
  if (settlements.length === 0) {
    console.log('No matching checkout settlements.');
    return;
  }

  for (const settlement of settlements) {
    const [vr] = await db
      .select({ vacatingDate: vacatingRequests.vacatingDate })
      .from(vacatingRequests)
      .where(eq(vacatingRequests.id, settlement.vacatingRequestId))
      .limit(1);
    if (!vr?.vacatingDate) continue;

    const wallet = await getDepositSummaryForBooking(settlement.bookingId);
    const depositHeld = wallet?.refundableBalancePaise ?? 0;
    const legacy = computeCheckoutRefundPreview({
      depositHeldPaise: depositHeld,
      noticeDeductionPaise: settlement.noticeDeductionPaise,
      electricitySharePaise: resolveCheckoutElectricitySharePaise(settlement),
      electricityDeductFromDeposit: settlement.electricityDeductFromDeposit !== false,
      damageChargePaise: settlement.damageChargePaise,
      cleaningChargePaise: settlement.cleaningChargePaise,
      customChargePaise: settlement.customChargePaise,
    });

    const waterfall = await computeWaterfallForSettlement({
      settlement,
      stayCheckoutDate: formatDate(vr.vacatingDate),
      depositHeldPaise: depositHeld,
    });

    const v2Total = waterfall?.refund.totalPaise ?? null;
    const delta = v2Total != null ? v2Total - legacy.finalRefundPaise : null;

    console.log('---');
    console.log(`Settlement ${settlement.id} · booking ${settlement.bookingId}`);
    console.log(`  status=${settlement.status} engine=v${settlement.settlementEngineVersion ?? 1}`);
    console.log(`  legacy refund=₹${(legacy.finalRefundPaise / 100).toFixed(2)}`);
    console.log(
      `  v2 total=${v2Total != null ? `₹${(v2Total / 100).toFixed(2)}` : 'n/a (flag off or missing stay dates)'}`,
    );
    if (delta != null && delta !== 0) {
      console.log(`  delta v2−legacy=₹${(delta / 100).toFixed(2)} (unused rent credit)`);
    }
    if (waterfall) {
      console.log(
        `  rent unused=₹${(waterfall.rentBucket.unusedPaise / 100).toFixed(2)} noticeFromRent=₹${(waterfall.notice.fromUnusedRentPaise / 100).toFixed(2)}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
