/**
 * Phase 1 electricity recovery — deduct from deposit at checkout/refund
 * and persist as room contribution (SSOT for month-end billing).
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  checkoutSettlements,
  depositLedger,
  electricityRoomContributions,
  vacatingRequests,
} from '@/src/db/schema';
import { resolveCheckoutElectricityDeductionPaise } from '@/src/lib/checkout/electricitySettlementCalc';
import { formatDate } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import { applyDepositDeductionsInTx } from '@/src/services/depositSettlement';
import { buildRoomElectricityCheckoutAllocation } from '@/src/services/roomElectricityCheckout';
import { recordCheckoutElectricityCollectionFromSettlementId } from '@/src/services/roomElectricityLedger';
import { getCheckoutSettlementDetailForBooking } from '@/src/services/checkoutSettlement';

const ELECTRICITY_DEDUCTION_REASON = 'Electricity share at checkout';

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function electricityDeductionAlreadyApplied(
  bookingId: string,
  vacatingRequestId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: depositLedger.id })
    .from(depositLedger)
    .where(
      and(
        eq(depositLedger.bookingId, bookingId),
        eq(depositLedger.entryKind, 'deducted'),
        eq(depositLedger.relatedVacatingId, vacatingRequestId),
        eq(depositLedger.reason, ELECTRICITY_DEDUCTION_REASON),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function contributionAlreadyRecorded(settlementId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: electricityRoomContributions.id })
    .from(electricityRoomContributions)
    .where(eq(electricityRoomContributions.checkoutSettlementId, settlementId))
    .limit(1);
  return Boolean(row);
}

export async function applyCheckoutElectricityRecoveryFromDeposit(input: {
  settlementId: string;
  adminId: string;
  roomId: string;
  totalBillPaise?: number;
}): Promise<
  | { ok: true; amountPaise: number; alreadyApplied: boolean }
  | { ok: false; error: string }
> {
  const [settlement] = await db
    .select()
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.id, input.settlementId))
    .limit(1);
  if (!settlement) return { ok: false, error: 'Checkout settlement not found.' };

  const amountPaise = resolveCheckoutElectricityDeductionPaise(settlement);
  if (amountPaise <= 0) {
    return { ok: false, error: 'Electricity share is zero — enter meter readings and save first.' };
  }
  if (settlement.electricityDeductFromDeposit === false) {
    return { ok: false, error: 'Electricity is not marked to deduct from deposit.' };
  }

  const [vacating] = await db
    .select({ vacatingDate: vacatingRequests.vacatingDate })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, settlement.vacatingRequestId))
    .limit(1);
  if (!vacating) return { ok: false, error: 'Vacating request not found.' };

  const billingMonth = firstOfMonth(String(vacating.vacatingDate));
  const alreadyContributed = await contributionAlreadyRecorded(settlement.id);
  const alreadyDeducted = await electricityDeductionAlreadyApplied(
    settlement.bookingId,
    settlement.vacatingRequestId,
  );

  let occupancyStart: string | null = null;
  let occupancyEnd: string | null = null;
  try {
    const allocation = await buildRoomElectricityCheckoutAllocation({
      roomId: input.roomId,
      customerId: settlement.customerId,
      vacatingDate: String(vacating.vacatingDate),
      totalBillPaise: input.totalBillPaise ?? amountPaise,
      excludeCheckoutSettlementId: settlement.id,
    });
    occupancyStart = allocation.periodStart;
    occupancyEnd = formatDate(
      new Date(new Date(allocation.periodEndExclusive).getTime() - 86_400_000),
    );
  } catch {
    occupancyStart = billingMonth;
    occupancyEnd = String(vacating.vacatingDate);
  }

  if (alreadyContributed && alreadyDeducted) {
    return { ok: true, amountPaise, alreadyApplied: true };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM bookings WHERE id = ${settlement.bookingId} FOR UPDATE`,
      );

      if (!alreadyDeducted) {
        await applyDepositDeductionsInTx(tx, {
          bookingId: settlement.bookingId,
          customerId: settlement.customerId,
          adminId: input.adminId,
          relatedVacatingId: settlement.vacatingRequestId,
          deductions: [
            {
              amountPaise,
              reason: ELECTRICITY_DEDUCTION_REASON,
              deductionCategory: 'electricity',
            },
          ],
        });
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not apply electricity recovery.',
    };
  }

  if (!alreadyContributed) {
    await recordCheckoutElectricityCollectionFromSettlementId(settlement.id, {
      totalBillPaise: input.totalBillPaise,
      occupancyStart,
      occupancyEnd,
    });
  }

  return { ok: true, amountPaise, alreadyApplied: false };
}

export async function loadRefundElectricitySettlementDetail(
  bookingId: string,
) {
  return getCheckoutSettlementDetailForBooking(bookingId);
}
