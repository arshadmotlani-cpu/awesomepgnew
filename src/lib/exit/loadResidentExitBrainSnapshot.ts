/**
 * Resident Exit Brain — read SSOT composing Room, Resident, Deposit, Billing, Electricity brains.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { checkoutSettlements } from '@/src/db/schema';
import { getActiveExitBrainForBooking } from '@/src/lib/exit/activateResidentExitBrain';
import {
  buildExitRefundEstimate,
  mapElectricityInvoiceStatus,
} from '@/src/lib/exit/exitBrainRefundEstimatePure';
import type {
  ExitElectricityEstimated,
  ExitElectricityGenerated,
  ResidentExitBrainSnapshot,
} from '@/src/lib/exit/exitBrainTypes';
import { buildResidentElectricityAccount } from '@/src/lib/residents/residentElectricityAccount';
import { loadVacatingBillingPresentation } from '@/src/lib/vacating/loadVacatingBillingPresentation';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { computeRentDuePaise, projectInvoice } from '@/src/services/rentInvoices';
import { getVacatingForBooking } from '@/src/db/queries/customer';
import { rentInvoices } from '@/src/db/schema';

async function loadCheckoutElectricityEstimate(bookingId: string): Promise<ExitElectricityEstimated> {
  const [settlement] = await db
    .select({
      electricitySharePaise: checkoutSettlements.electricitySharePaise,
      electricityMethod: checkoutSettlements.electricityCalculationMethod,
    })
    .from(checkoutSettlements)
    .where(eq(checkoutSettlements.bookingId, bookingId))
    .limit(1);

  if (settlement?.electricitySharePaise != null && settlement.electricitySharePaise > 0) {
    return {
      amountPaise: settlement.electricitySharePaise,
      residentSharePaise: settlement.electricitySharePaise,
      pending: false,
      label: 'Checkout electricity (meter verified)',
    };
  }

  return {
    amountPaise: null,
    residentSharePaise: null,
    pending: true,
    label: 'Estimated from checkout meter reading',
  };
}

export async function loadResidentExitBrainSnapshot(
  bookingId: string,
): Promise<ResidentExitBrainSnapshot> {
  const [exitRow, vacatingRes, balances, deposit, elecAccount] = await Promise.all([
    getActiveExitBrainForBooking(bookingId),
    getVacatingForBooking(bookingId),
    getBookingMoneyBalances(bookingId),
    getDepositSummaryForBooking(bookingId),
    buildResidentElectricityAccount(bookingId),
  ]);

  const vacating = vacatingRes.ok ? vacatingRes.data : null;
  const isExitMode = exitRow?.status === 'active';
  const depositHeldPaise = Math.max(0, deposit?.refundableBalancePaise ?? 0);

  const rentCaps = exitRow?.frozenRentLateFeesJson ?? {};
  const rentRows = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.bookingId, bookingId));

  let pendingRentPrincipalPaise = 0;
  let liveRentLateFeePaise = 0;

  for (const inv of rentRows) {
    if (inv.status === 'paid' || inv.status === 'cancelled') continue;
    const frozenLate = isExitMode ? rentCaps[inv.id] : undefined;
    const projected = projectInvoice(
      inv,
      undefined,
      frozenLate !== undefined ? { exitModeFrozenLateFeePaise: frozenLate } : undefined,
    );
    const principal = Math.max(
      0,
      computeRentDuePaise(inv.rentPaise, inv.discountPaise) - inv.paidPrincipalPaise,
    );
    pendingRentPrincipalPaise += principal;
    liveRentLateFeePaise += Math.max(0, projected.accruedLateFeePaise - inv.paidLateFeePaise);
  }

  const frozenNoticePenaltyPaise = isExitMode
    ? exitRow!.frozenNoticePenaltyPaise
    : (vacating?.deductionPaise ?? 0);

  const frozenRentLateFeePaise = isExitMode
    ? exitRow!.frozenRentLateFeePaise
    : liveRentLateFeePaise;

  const outstandingInvoice = elecAccount.invoices.find((i) => i.outstandingPaise > 0);
  let electricityGenerated: ExitElectricityGenerated | null = null;

  if (outstandingInvoice) {
    electricityGenerated = {
      amountPaise: outstandingInvoice.amountPaise,
      outstandingPaise: outstandingInvoice.outstandingPaise,
      status: mapElectricityInvoiceStatus({
        outstandingPaise: outstandingInvoice.outstandingPaise,
        paidPaise: outstandingInvoice.paidPaise,
        deductedFromDepositPaise: 0,
      }),
      billingMonth: outstandingInvoice.billingMonth,
    };
  } else if (elecAccount.invoices.length > 0) {
    const latest = elecAccount.invoices[elecAccount.invoices.length - 1]!;
    electricityGenerated = {
      amountPaise: latest.amountPaise,
      outstandingPaise: latest.outstandingPaise,
      status: mapElectricityInvoiceStatus({
        outstandingPaise: latest.outstandingPaise,
        paidPaise: latest.paidPaise,
        deductedFromDepositPaise: elecAccount.electricityDeductedFromDepositPaise,
      }),
      billingMonth: latest.billingMonth,
    };
  }

  const electricityEstimated = await loadCheckoutElectricityEstimate(bookingId);

  const damageChargePaise = 0;
  const cleaningChargePaise = 0;
  const otherChargePaise = 0;

  const refundEstimate = buildExitRefundEstimate({
    depositHeldPaise,
    pendingRentPrincipalPaise,
    frozenRentLateFeePaise,
    frozenNoticePenaltyPaise,
    electricityGenerated:
      electricityGenerated?.outstandingPaise ? electricityGenerated : null,
    electricityEstimated,
    damageChargePaise,
    cleaningChargePaise,
    otherChargePaise,
  });

  const totalOutstanding =
    pendingRentPrincipalPaise +
    frozenRentLateFeePaise +
    (electricityGenerated?.outstandingPaise ?? 0) +
    (electricityEstimated.residentSharePaise ?? 0) +
    frozenNoticePenaltyPaise;

  return {
    apiVersion: 'exit-brain/v1',
    bookingId,
    status: isExitMode ? 'active' : vacating ? 'inactive' : 'inactive',
    isExitMode,
    activatedAt: exitRow?.activatedAt?.toISOString() ?? null,
    noticeGivenDate: exitRow?.noticeGivenDate ?? vacating?.noticeGivenDate ?? null,
    expectedCheckoutDate: exitRow?.expectedCheckoutDate ?? vacating?.vacatingDate ?? null,
    frozen: {
      noticePenaltyPaise: frozenNoticePenaltyPaise,
      rentLateFeePaise: frozenRentLateFeePaise,
    },
    outstanding: {
      rentPrincipalPaise: pendingRentPrincipalPaise,
      rentLateFeePaise: frozenRentLateFeePaise,
      electricityInvoicePaise: electricityGenerated?.outstandingPaise ?? 0,
      penaltiesPaise: frozenNoticePenaltyPaise,
      miscPaise: damageChargePaise + cleaningChargePaise + otherChargePaise,
    },
    electricity: {
      generatedInvoice: electricityGenerated,
      estimatedCheckout: electricityEstimated,
    },
    refundEstimate,
    autoRecoverFromDeposit: isExitMode && totalOutstanding > 0 && depositHeldPaise > 0,
  };
}

export async function loadResidentExitBrainSnapshotForVacating(
  bookingId: string,
): Promise<ResidentExitBrainSnapshot | null> {
  const vacatingRes = await getVacatingForBooking(bookingId);
  if (!vacatingRes.ok || !vacatingRes.data) return null;
  if (!['pending', 'approved'].includes(vacatingRes.data.status)) return null;
  return loadResidentExitBrainSnapshot(bookingId);
}

export async function loadExitBrainBillingPresentation(bookingId: string) {
  const vacatingRes = await getVacatingForBooking(bookingId);
  if (!vacatingRes.ok || !vacatingRes.data) return null;
  const v = vacatingRes.data;
  return loadVacatingBillingPresentation({
    bookingId,
    noticeGivenDate: String(v.noticeGivenDate),
    vacatingDate: String(v.vacatingDate),
    monthlyRentPaiseSnapshot: v.monthlyRentPaiseSnapshot,
    noticeRentCoveredDays: v.noticeRentCoveredDays,
    noticeChargeableDays: v.noticeChargeableDays,
    deductionPaise: v.deductionPaise,
    noticeBreakdownJson: v.noticeBreakdownJson as never,
    treatAsApprovedForTail: v.status === 'approved',
    mode: v.status === 'approved' ? 'baseline' : 'estimate',
  });
}
