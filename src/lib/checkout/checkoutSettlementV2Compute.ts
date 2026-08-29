/**
 * Load booking context and compute Checkout Settlement V2 waterfall.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedReservations, rentInvoices, type CheckoutSettlement } from '@/src/db/schema';
import { noticeDeductionAppliesToBooking } from '@/src/lib/checkout/noticeDeductionPolicy';
import {
  checkoutSettlementV2ColumnPatch,
  computeCheckoutSettlementV2,
  type CheckoutSettlementWaterfall,
} from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { resolveCheckoutElectricitySharePaise } from '@/src/lib/checkout/electricitySettlementCalc';
import { dailyRateFromBillingPeriod } from '@/src/lib/billing/billingCoverageModel';
import { formatDate, parseDate } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export type FinalPeriodRentInvoiceOutstanding = {
  outstandingPaise: number;
  invoiceId: string | null;
  rentPaise: number;
  paidPrincipalPaise: number;
};

/** @deprecated Invoice-based move-out never uses deposit tail — use resolveFinalPeriodRentInvoiceOutstandingForBooking. */
export async function resolveCheckoutTailRentPaiseForBooking(args: {
  bookingId: string;
  vacatingDate: string;
  monthlyRentPaise: number;
  treatAsApprovedForTail?: boolean;
}): Promise<number> {
  void args;
  return 0;
}

/** SSOT — final-period rent invoice outstanding via projectInvoice (not BCM tail, not deposit). */
export async function resolveFinalPeriodRentInvoiceOutstandingForBooking(args: {
  bookingId: string;
  vacatingDate: string;
}): Promise<FinalPeriodRentInvoiceOutstanding> {
  const vacatingDate = formatDate(parseDate(args.vacatingDate));
  const checkoutMonth = firstOfMonth(vacatingDate);

  const [invoice] = await db
    .select()
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, args.bookingId),
        eq(rentInvoices.billingMonth, checkoutMonth),
        eq(rentInvoices.isAdhoc, false),
        inArray(rentInvoices.status, [
          'pending',
          'overdue',
          'payment_in_progress',
          'paid',
        ]),
      ),
    )
    .limit(1);

  if (!invoice) {
    return {
      outstandingPaise: 0,
      invoiceId: null,
      rentPaise: 0,
      paidPrincipalPaise: 0,
    };
  }

  const { projectInvoice } = await import('@/src/services/rentInvoices');
  const projected = projectInvoice(invoice);
  return {
    outstandingPaise: projected.outstandingPaise,
    invoiceId: invoice.id,
    rentPaise: invoice.rentPaise,
    paidPrincipalPaise: invoice.paidPrincipalPaise ?? 0,
  };
}

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

export function computeWaterfallWithApprovalBaseline(args: {
  baseline: CheckoutSettlementWaterfall;
  settlement: CheckoutSettlement;
  depositHeldPaise: number;
  stayType?: string | null;
  durationMode?: string | null;
}): CheckoutSettlementWaterfall {
  const electricityShare = resolveCheckoutElectricitySharePaise(args.settlement);
  const legacyTail = args.baseline.depositBucket.tailRentPaise ?? 0;
  return computeCheckoutSettlementV2({
    stayCheckInDate: args.baseline.stay.checkInDate,
    stayCheckoutDate: args.baseline.stay.checkoutDate,
    rentPaidPaise: args.baseline.rentBucket.paidPaise,
    monthlyRentPaise: args.settlement.monthlyRentPaiseSnapshot,
    depositCollectedPaise: args.depositHeldPaise,
    missingNoticeDays: args.baseline.notice.missingNoticeDays,
    electricityPaise: electricityShare,
    electricityDeductFromDeposit: args.settlement.electricityDeductFromDeposit !== false,
    damageChargePaise: args.settlement.damageChargePaise,
    cleaningChargePaise: args.settlement.cleaningChargePaise,
    customChargePaise: args.settlement.customChargePaise,
    noticeApplies: noticeDeductionAppliesToBooking({
      stayType: args.stayType,
      durationMode: args.durationMode,
    }),
    checkoutTailRentPaise: legacyTail,
    outstandingRentInvoicePaise: args.baseline.outstandingRentInvoicePaise ?? 0,
    prepaidAfterVacatingPaise: args.baseline.rentBucket.unusedPaise,
    periodDailyRentPaise: args.baseline.rentBucket.dailyRentPaise,
  });
}

export async function computeWaterfallForSettlement(
  args: ComputeWaterfallForSettlementArgs,
): Promise<CheckoutSettlementWaterfall | null> {
  const version = args.settlement.settlementEngineVersion ?? 1;
  const usesV2 = version >= 2 || !args.settlement.amountsLocked;
  if (!usesV2) return null;

  if (args.settlement.amountsLocked && args.settlement.settlementWaterfallJson) {
    return args.settlement.settlementWaterfallJson;
  }

  const checkout = args.stayCheckoutDate ?? args.settlement.stayCheckoutDate;
  if (!checkout) return null;

  const [money, wallet] = await Promise.all([
    getBookingMoneyBalances(args.settlement.bookingId),
    getDepositSummaryForBooking(args.settlement.bookingId),
  ]);

  const depositHeld =
    args.depositHeldPaise ?? wallet?.refundableBalancePaise ?? args.settlement.depositReceivedPaise;

  const baseline = args.settlement.settlementWaterfallJson;
  if (args.settlement.approvalBaselineLocked && baseline) {
    return computeWaterfallWithApprovalBaseline({
      baseline,
      settlement: args.settlement,
      depositHeldPaise: depositHeld,
      stayType: args.stayType,
      durationMode: args.durationMode,
    });
  }

  const checkIn =
    args.stayCheckInDate ??
    args.settlement.stayCheckInDate ??
    (await resolveStayCheckInDate(args.settlement.bookingId));
  if (!checkIn) return null;

  const electricityShare = resolveCheckoutElectricitySharePaise(args.settlement);

  const finalPeriodInvoice = await resolveFinalPeriodRentInvoiceOutstandingForBooking({
    bookingId: args.settlement.bookingId,
    vacatingDate: checkout,
  });

  const { loadBillingCoverageModel } = await import('@/src/services/billingCoverage');
  const { vacatingRequests } = await import('@/src/db/schema');
  const [vacatingRow] = await db
    .select({ noticeGivenDate: vacatingRequests.noticeGivenDate })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, args.settlement.vacatingRequestId))
    .limit(1);

  const coverage = await loadBillingCoverageModel({
    bookingId: args.settlement.bookingId,
    vacatingDate: checkout,
    noticeGivenDate: vacatingRow?.noticeGivenDate ?? undefined,
    monthlyRentPaise: args.settlement.monthlyRentPaiseSnapshot,
    treatAsApprovedForTail: true,
  });

  const periodDailyRentPaise = (() => {
    if (!coverage) return undefined;
    const period =
      coverage.periodUsedForPrepaid ??
      coverage.paidInvoiceCoverage.find(
        (p) =>
          (p.paidPrincipalPaise ?? 0) > 0 &&
          p.periodStart <= checkout &&
          p.periodEnd >= checkout,
      );
    if (!period?.paidPrincipalPaise || !period.periodStart || !period.periodEnd) {
      return coverage.noticeBreakdown?.dailyRentPaise;
    }
    return dailyRateFromBillingPeriod(
      period.paidPrincipalPaise,
      period.periodStart,
      period.periodEnd,
    );
  })();

  return computeCheckoutSettlementV2({
    stayCheckInDate: checkIn,
    stayCheckoutDate: checkout,
    rentPaidPaise: money?.rent.receivedPaise ?? 0,
    monthlyRentPaise: args.settlement.monthlyRentPaiseSnapshot,
    depositCollectedPaise: depositHeld,
    missingNoticeDays:
      coverage?.noticeBreakdown?.missingNoticeDays ?? args.settlement.noticeShortfallDays,
    electricityPaise: electricityShare,
    electricityDeductFromDeposit: args.settlement.electricityDeductFromDeposit !== false,
    damageChargePaise: args.settlement.damageChargePaise,
    cleaningChargePaise: args.settlement.cleaningChargePaise,
    customChargePaise: args.settlement.customChargePaise,
    noticeApplies: noticeDeductionAppliesToBooking({
      stayType: args.stayType,
      durationMode: args.durationMode,
    }),
    checkoutTailRentPaise: 0,
    outstandingRentInvoicePaise: finalPeriodInvoice.outstandingPaise,
    prepaidAfterVacatingPaise: coverage?.prepaidAfterVacatingPaise ?? 0,
    periodDailyRentPaise,
  });
}

export async function persistWaterfallForSettlement(
  settlementId: string,
  waterfall: CheckoutSettlementWaterfall,
  opts?: { lockApprovalBaseline?: boolean },
): Promise<void> {
  const { checkoutSettlements } = await import('@/src/db/schema');
  const { db: database } = await import('@/src/db/client');
  await database
    .update(checkoutSettlements)
    .set({
      ...checkoutSettlementV2ColumnPatch(waterfall),
      ...(opts?.lockApprovalBaseline ? { approvalBaselineLocked: true } : {}),
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
  const outstandingRentDeductionPaise =
    waterfall.outstandingRentInvoicePaise ?? waterfall.depositBucket.tailRentPaise;
  return {
    depositHeldPaise,
    noticeDeductionPaise: waterfall.notice.fromDepositPaise,
    electricityDeductionPaise: waterfall.depositBucket.electricityPaise,
    electricitySharePaise: waterfall.depositBucket.electricityPaise,
    electricityDeductFromDeposit: row?.electricityDeductFromDeposit !== false,
    outstandingRentDeductionPaise,
    damageChargePaise,
    cleaningChargePaise,
    penaltyChargePaise: waterfall.notice.fromDepositPaise,
    customChargePaise,
    customChargeLabel: row?.customChargeLabel ?? undefined,
    totalDeductionsPaise:
      waterfall.notice.fromDepositPaise +
      outstandingRentDeductionPaise +
      waterfall.depositBucket.electricityPaise +
      waterfall.depositBucket.otherPaise,
    finalRefundPaise: waterfall.refund.totalPaise,
    totalRefundPaise: waterfall.refund.totalPaise,
    depositRefundablePaise: waterfall.depositBucket.refundablePaise,
    unusedRentRefundPaise: waterfall.refund.unusedRentPortionPaise,
  };
}
