/**
 * Load booking context and compute Checkout Settlement V2 waterfall.
 */
import { and, desc, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, type CheckoutSettlement } from '@/src/db/schema';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import {
  checkoutSettlementV2ColumnPatch,
  computeCheckoutSettlementV2,
  type CheckoutSettlementWaterfall,
} from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { resolveCheckoutElectricitySharePaise } from '@/src/lib/checkout/electricitySettlementCalc';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export async function resolveStayCheckInDate(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({
      moveInDate: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bedReservations)
    .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')))
    .orderBy(desc(bedReservations.createdAt))
    .limit(1);
  return row?.moveInDate ?? null;
}

export type ComputeWaterfallForSettlementArgs = {
  settlement: CheckoutSettlement;
  stayCheckInDate?: string | null;
  stayCheckoutDate: string;
  stayType?: string | null;
  durationMode?: string | null;
  depositHeldPaise?: number;
};

export async function computeWaterfallForSettlement(
  args: ComputeWaterfallForSettlementArgs,
): Promise<CheckoutSettlementWaterfall | null> {
  const version = args.settlement.settlementEngineVersion ?? 1;
  const usesV2 = version >= 2 || !args.settlement.amountsLocked;
  if (!usesV2) return null;

  if (args.settlement.amountsLocked && args.settlement.settlementWaterfallJson) {
    return args.settlement.settlementWaterfallJson;
  }

  const checkIn =
    args.stayCheckInDate ??
    args.settlement.stayCheckInDate ??
    (await resolveStayCheckInDate(args.settlement.bookingId));
  if (!checkIn) return null;

  const checkout = args.stayCheckoutDate ?? args.settlement.stayCheckoutDate;
  if (!checkout) return null;

  const [money, wallet] = await Promise.all([
    getBookingMoneyBalances(args.settlement.bookingId),
    getDepositSummaryForBooking(args.settlement.bookingId),
  ]);

  const electricityShare = resolveCheckoutElectricitySharePaise(args.settlement);

  return computeCheckoutSettlementV2({
    stayCheckInDate: checkIn,
    stayCheckoutDate: checkout,
    rentPaidPaise: money?.rent.receivedPaise ?? 0,
    monthlyRentPaise: args.settlement.monthlyRentPaiseSnapshot,
    depositCollectedPaise:
      args.depositHeldPaise ?? wallet?.refundableBalancePaise ?? args.settlement.depositReceivedPaise,
    missingNoticeDays: args.settlement.noticeShortfallDays,
    electricityPaise: electricityShare,
    electricityDeductFromDeposit: args.settlement.electricityDeductFromDeposit !== false,
    damageChargePaise: args.settlement.damageChargePaise,
    cleaningChargePaise: args.settlement.cleaningChargePaise,
    customChargePaise: args.settlement.customChargePaise,
    noticeApplies: noticeDeductionAppliesToBooking({
      stayType: args.stayType,
      durationMode: args.durationMode,
    }),
  });
}

export async function persistWaterfallForSettlement(
  settlementId: string,
  waterfall: CheckoutSettlementWaterfall,
): Promise<void> {
  const { checkoutSettlements } = await import('@/src/db/schema');
  const { db: database } = await import('@/src/db/client');
  await database
    .update(checkoutSettlements)
    .set({
      ...checkoutSettlementV2ColumnPatch(waterfall),
      updatedAt: new Date(),
    })
    .where(eq(checkoutSettlements.id, settlementId));
}

export function waterfallToLegacyPreview(
  waterfall: CheckoutSettlementWaterfall,
  depositHeldPaise: number,
  row?: {
    damageChargePaise?: number;
    cleaningChargePaise?: number;
    customChargePaise?: number;
    customChargeLabel?: string | null;
    electricityDeductFromDeposit?: boolean;
  },
) {
  const damageChargePaise = row?.damageChargePaise ?? 0;
  const cleaningChargePaise = row?.cleaningChargePaise ?? 0;
  const customChargePaise = row?.customChargePaise ?? 0;
  return {
    depositHeldPaise,
    noticeDeductionPaise: waterfall.notice.fromDepositPaise,
    electricityDeductionPaise: waterfall.depositBucket.electricityPaise,
    electricitySharePaise: waterfall.depositBucket.electricityPaise,
    electricityDeductFromDeposit: row?.electricityDeductFromDeposit !== false,
    outstandingRentDeductionPaise: 0,
    damageChargePaise,
    cleaningChargePaise,
    penaltyChargePaise: waterfall.notice.fromDepositPaise,
    customChargePaise,
    customChargeLabel: row?.customChargeLabel ?? undefined,
    totalDeductionsPaise:
      waterfall.notice.fromDepositPaise +
      waterfall.depositBucket.electricityPaise +
      waterfall.depositBucket.otherPaise,
    finalRefundPaise: waterfall.refund.totalPaise,
    totalRefundPaise: waterfall.refund.totalPaise,
    depositRefundablePaise: waterfall.depositBucket.refundablePaise,
    unusedRentRefundPaise: waterfall.refund.unusedRentPortionPaise,
  };
}
