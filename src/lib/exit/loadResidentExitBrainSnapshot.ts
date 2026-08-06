/**
 * Resident Exit Brain — read SSOT composing Room, Resident, Deposit, Billing, Electricity brains.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { checkoutSettlements } from '@/src/db/schema';
import { getExitBrainForBooking } from '@/src/lib/exit/activateResidentExitBrain';
import { buildExitBrainChecklist } from '@/src/lib/exit/exitBrainChecklist';
import { resolveExitBrainPhase } from '@/src/lib/exit/exitBrainPhase';
import {
  buildExitRefundEstimate,
  mapElectricityInvoiceStatus,
} from '@/src/lib/exit/exitBrainRefundEstimatePure';
import { computeExitRefundConfidence } from '@/src/lib/exit/exitBrainRefundConfidence';
import { buildExitBrainTimeline } from '@/src/lib/exit/exitBrainTimeline';
import {
  buildExitBrainLifecycle,
  projectionInputToStateMachineInput,
} from '@/src/lib/exit/exitBrainStateMachine';
import { canRequestMoveOutRefund } from '@/src/lib/residents/vacatingJourney';
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

type CheckoutSettlementRow = {
  electricitySharePaise: number;
  electricityCalculationMethod: string;
  electricityMeterPhotoUrl: string | null;
  meterPhotoMissing: boolean;
  damageChargePaise: number;
  cleaningChargePaise: number;
  customChargePaise: number;
  status: import('@/src/db/schema/enums').CheckoutSettlementStatus;
  payoutUpiId: string | null;
  payoutQrUrl: string | null;
  refundPaidAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

async function loadCheckoutSettlementRow(bookingId: string): Promise<CheckoutSettlementRow | null> {
  const [settlement] = await db
    .select({
      electricitySharePaise: checkoutSettlements.electricitySharePaise,
      electricityCalculationMethod: checkoutSettlements.electricityCalculationMethod,
      electricityMeterPhotoUrl: checkoutSettlements.electricityMeterPhotoUrl,
      meterPhotoMissing: checkoutSettlements.meterPhotoMissing,
      damageChargePaise: checkoutSettlements.damageChargePaise,
      cleaningChargePaise: checkoutSettlements.cleaningChargePaise,
      customChargePaise: checkoutSettlements.customChargePaise,
      status: checkoutSettlements.status,
      payoutUpiId: checkoutSettlements.payoutUpiId,
      payoutQrUrl: checkoutSettlements.payoutQrUrl,
      refundPaidAt: checkoutSettlements.refundPaidAt,
      approvedAt: checkoutSettlements.approvedAt,
      createdAt: checkoutSettlements.createdAt,
      updatedAt: checkoutSettlements.updatedAt,
    })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.bookingId, bookingId),
        sql`${checkoutSettlements.status} <> 'archived'`,
      ),
    )
    .orderBy(sql`${checkoutSettlements.updatedAt} DESC`)
    .limit(1);

  return settlement ?? null;
}

function buildCheckoutElectricityEstimate(
  settlement: CheckoutSettlementRow | null,
): ExitElectricityEstimated {
  if (settlement?.electricitySharePaise != null && settlement.electricitySharePaise > 0) {
    return {
      amountPaise: settlement.electricitySharePaise,
      residentSharePaise: settlement.electricitySharePaise,
      pending: false,
      label: 'Checkout electricity (meter verified)',
    };
  }

  if (settlement?.electricityMeterPhotoUrl) {
    return {
      amountPaise: settlement.electricitySharePaise > 0 ? settlement.electricitySharePaise : null,
      residentSharePaise:
        settlement.electricitySharePaise > 0 ? settlement.electricitySharePaise : null,
      pending: settlement.electricitySharePaise <= 0,
      label: 'Estimated from checkout meter reading',
    };
  }

  return {
    amountPaise: null,
    residentSharePaise: null,
    pending: true,
    label: 'Estimated from checkout meter reading',
  };
}

function resolveBrainStatus(
  exitRow: Awaited<ReturnType<typeof getExitBrainForBooking>>,
  vacatingStatus: string | null | undefined,
): ResidentExitBrainSnapshot['status'] {
  if (exitRow?.status === 'active') return 'active';
  if (exitRow?.status === 'completed') return 'completed';
  if (vacatingStatus === 'completed') return 'completed';
  return 'inactive';
}

export async function loadResidentExitBrainSnapshot(
  bookingId: string,
): Promise<ResidentExitBrainSnapshot> {
  const [exitRowAny, vacatingRes, balances, deposit, elecAccount, settlement] = await Promise.all([
    getExitBrainForBooking(bookingId),
    getVacatingForBooking(bookingId),
    getBookingMoneyBalances(bookingId),
    getDepositSummaryForBooking(bookingId),
    buildResidentElectricityAccount(bookingId),
    loadCheckoutSettlementRow(bookingId),
  ]);

  const exitRow = exitRowAny?.status === 'active' ? exitRowAny : null;
  const vacating = vacatingRes.ok ? vacatingRes.data : null;
  const brainStatus = resolveBrainStatus(exitRowAny, vacating?.status);
  const isExitMode = exitRowAny?.status === 'active';
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

  const electricityEstimated = buildCheckoutElectricityEstimate(settlement);

  const damageChargePaise = settlement?.damageChargePaise ?? 0;
  const cleaningChargePaise = settlement?.cleaningChargePaise ?? 0;
  const otherChargePaise = settlement?.customChargePaise ?? 0;

  const refundEstimateBase = buildExitRefundEstimate({
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

  const hasMeterPhoto = Boolean(settlement?.electricityMeterPhotoUrl?.trim());
  const hasPayoutDetails = Boolean(
    settlement?.payoutUpiId?.trim() || settlement?.payoutQrUrl?.trim(),
  );

  const confidence = computeExitRefundConfidence({
    hasMeterPhoto,
    meterPhotoMissing: settlement?.meterPhotoMissing ?? false,
    electricityEstimatedPending: electricityEstimated.pending,
    electricitySharePaise: settlement?.electricitySharePaise ?? null,
    settlementStatus: settlement?.status ?? null,
    hasPayoutDetails,
    pendingRentPrincipalPaise,
    outstandingElectricityPaise: electricityGenerated?.outstandingPaise ?? 0,
  });

  const refundEstimate = {
    ...refundEstimateBase,
    confidencePercent: confidence.confidencePercent,
    confidenceReasons: confidence.reasons,
  };

  const projectionInput = {
    vacatingStatus: vacating?.status ?? null,
    exitBrainStatus: exitRowAny?.status ?? null,
    settlementStatus: settlement?.status ?? null,
    hasMeterPhoto,
    meterPhotoMissing: settlement?.meterPhotoMissing ?? false,
    electricitySharePaise: settlement?.electricitySharePaise ?? null,
    electricityEstimatedPending: electricityEstimated.pending,
    refundPaidAt: settlement?.refundPaidAt ?? null,
    hasPayoutDetails,
  };

  const refundGate = canRequestMoveOutRefund({
    vacatingStatus: vacating?.status ?? null,
    vacatingDate: vacating?.vacatingDate ? String(vacating.vacatingDate) : null,
    checkoutStatus: settlement?.status ?? null,
    checkoutSettlementSuppressed: vacating?.checkoutSettlementSuppressed ?? false,
  });

  const lifecycle = buildExitBrainLifecycle(
    projectionInputToStateMachineInput(projectionInput, {
      hasSettlement: settlement != null,
      refundRequestEligible: refundGate.allowed,
    }),
  );

  const phase = resolveExitBrainPhase(projectionInput);
  const timeline = buildExitBrainTimeline({
    ...projectionInput,
    noticeSubmittedAt: vacating?.createdAt ?? null,
    noticeApprovedAt: vacating?.resolvedAt ?? null,
    exitActivatedAt: exitRowAny?.activatedAt ?? null,
    settlementCreatedAt: settlement?.createdAt ?? null,
    settlementUpdatedAt: settlement?.updatedAt ?? null,
    settlementApprovedAt: settlement?.approvedAt ?? null,
    refundPaidAt: settlement?.refundPaidAt ?? null,
  });
  const checklist = buildExitBrainChecklist(projectionInput);

  const totalOutstanding =
    pendingRentPrincipalPaise +
    frozenRentLateFeePaise +
    (electricityGenerated?.outstandingPaise ?? 0) +
    (electricityEstimated.residentSharePaise ?? 0) +
    frozenNoticePenaltyPaise +
    damageChargePaise +
    cleaningChargePaise +
    otherChargePaise;

  return {
    apiVersion: 'exit-brain/v1',
    bookingId,
    status: brainStatus,
    phase,
    lifecycle,
    isExitMode: lifecycle.isExitMode,
    activatedAt: exitRowAny?.activatedAt?.toISOString() ?? null,
    noticeGivenDate: exitRowAny?.noticeGivenDate ?? vacating?.noticeGivenDate ?? null,
    expectedCheckoutDate: exitRowAny?.expectedCheckoutDate ?? vacating?.vacatingDate ?? null,
    timeline,
    checklist,
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
    autoRecoverFromDeposit: lifecycle.isExitMode && totalOutstanding > 0 && depositHeldPaise > 0,
  };
}

export async function loadResidentExitBrainSnapshotForVacating(
  bookingId: string,
): Promise<ResidentExitBrainSnapshot | null> {
  const vacatingRes = await getVacatingForBooking(bookingId);
  if (!vacatingRes.ok || !vacatingRes.data) return null;
  if (!['pending', 'approved', 'completed'].includes(vacatingRes.data.status)) return null;
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
