/**
 * Pure presentation layer — merges calculation breakdown, ledger, and invoice rows
 * into a single admin audit table. No new billing math; validation only.
 */
import type { ElectricityBillCalculationBreakdown } from '@/src/lib/billing/electricityBillBreakdownTypes';
import {
  buildElectricityResidentTimeline,
  type ElectricityResidentTimelineEvent,
} from '@/src/lib/billing/buildElectricityResidentTimeline';
import { computeElectricitySettlementLedgerReconciliation } from '@/src/lib/billing/electricitySettlementLedgerReconciliation';
import { diffDays } from '@/src/lib/dates';
import { monthBounds } from '@/src/services/billing';
import type { ElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';

export type RoomElectricityAuditInvoiceRow = {
  invoiceId: string | null;
  invoiceNumber: string | null;
  bookingId: string;
  customerId: string;
  customerName: string;
  bedCode: string | null;
  checkIn: string;
  checkOut: string | null;
  daysCharged: number;
  billingCycleDays: number;
  occupancyPct: number;
  unitsAllocated: number | null;
  amountAllocatedPaise: number;
  previousOutstandingPaise: number;
  previousCollectedPaise: number;
  currentPaidPaise: number;
  currentOutstandingPaise: number;
  amountPaidPaise: number;
  status: string;
  paymentStatus: string;
  role: 'active' | 'departed';
  excludedBecauseCheckoutPaid: boolean;
  financialInvoiceId?: string | null;
  timeline: ElectricityResidentTimelineEvent[];
};

export type RoomElectricityAuditRoomSummary = {
  roomNumber: string;
  pgName: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  meterStartUnits: number;
  meterEndUnits: number;
  unitsConsumed: number;
  ratePerUnitPaise: number;
  grossTotalPaise: number;
  residentCount: number;
  generatedAt: string | null;
  collectionStatus: 'fully_collected' | 'partial' | 'none';
  collectedPaise: number;
  outstandingPaise: number;
  collectionPercentage: number;
};

export type RoomElectricityAuditView = {
  roomSummary: RoomElectricityAuditRoomSummary;
  roomNumber: string;
  billingMonth: string;
  grossTotalPaise: number;
  prepaidCreditPaise: number;
  checkoutCreditsPaise: number;
  manualCreditsPaise: number;
  splittablePaise: number;
  roundingRemainderPaise: number;
  residentRows: RoomElectricityAuditInvoiceRow[];
  sumAllocatedPaise: number;
  sumCreditsPaise: number;
  reconciliationGapPaise: number;
  isBalanced: boolean;
  collectedPaise: number;
  outstandingPaise: number;
  collectionPercentage: number;
};

export type RoomElectricityAuditInvoiceProjection = {
  outstandingPaise: number;
  effectiveStatus: string;
  paidPaise: number;
  paidAt: string | null;
};

export type BuildRoomElectricityAuditInput = {
  breakdown: ElectricityBillCalculationBreakdown;
  ledger: ElectricitySettlementLedgerView;
  distribution: Array<{
    invoiceId: string;
    invoiceNumber: string;
    bookingId: string;
    customerFullName: string;
    bedCode?: string | null;
    amountPaise: number;
    status: string;
    paidPaise?: number;
    paidAt?: string | Date | null;
    unitsShare?: number | null;
    activeDays?: number | null;
  }>;
  financialInvoiceIdByElectricityInvoiceId?: Map<string, string>;
  pgName: string;
  priorOutstandingByBookingId?: Map<string, number>;
  billGeneratedAt?: string | null;
  invoiceProjectionByBookingId?: Map<string, RoomElectricityAuditInvoiceProjection>;
};

function invoiceByBooking(
  distribution: BuildRoomElectricityAuditInput['distribution'],
): Map<string, BuildRoomElectricityAuditInput['distribution'][number]> {
  const map = new Map<string, BuildRoomElectricityAuditInput['distribution'][number]>();
  for (const row of distribution) {
    map.set(row.bookingId, row);
  }
  return map;
}

function allocationByBooking(
  ledger: ElectricitySettlementLedgerView,
): Map<string, (typeof ledger.residentAllocations)[number]> {
  const map = new Map<string, (typeof ledger.residentAllocations)[number]>();
  for (const row of ledger.residentAllocations) {
    if (row.bookingId) map.set(row.bookingId, row);
  }
  return map;
}

function collectionStatus(
  collectedPaise: number,
  outstandingPaise: number,
): RoomElectricityAuditRoomSummary['collectionStatus'] {
  if (outstandingPaise <= 0 && collectedPaise > 0) return 'fully_collected';
  if (collectedPaise > 0) return 'partial';
  return 'none';
}

export function buildRoomElectricityAuditView(
  input: BuildRoomElectricityAuditInput,
): RoomElectricityAuditView {
  const {
    breakdown,
    ledger,
    distribution,
    financialInvoiceIdByElectricityInvoiceId,
    pgName,
    priorOutstandingByBookingId,
    billGeneratedAt,
    invoiceProjectionByBookingId,
  } = input;
  const invMap = invoiceByBooking(distribution);
  const allocMap = allocationByBooking(ledger);

  const { start, end } = monthBounds(breakdown.billingMonth);
  const billingPeriodStart = start.toISOString().slice(0, 10);
  const billingPeriodEnd = end.toISOString().slice(0, 10);
  const billingCycleDays = diffDays(start, end);

  const generatedAt = billGeneratedAt ?? breakdown.generatedAt ?? null;

  const residentRows: RoomElectricityAuditInvoiceRow[] = breakdown.timeline.map((entry) => {
    const inv = invMap.get(entry.bookingId);
    const alloc = allocMap.get(entry.bookingId);
    const projection = invoiceProjectionByBookingId?.get(entry.bookingId);

    const previousCollectedPaise = entry.creditAppliedToRoomBillPaise;
    const previousOutstandingPaise = priorOutstandingByBookingId?.get(entry.bookingId) ?? 0;

    const amountAllocatedPaise = inv?.amountPaise ?? entry.monthlyInvoiceAmountPaise;
    const currentPaidPaise = projection?.paidPaise ?? alloc?.paidPaise ?? inv?.paidPaise ?? 0;
    const currentOutstandingPaise =
      projection?.outstandingPaise ??
      Math.max(0, amountAllocatedPaise - currentPaidPaise);

    const paymentStatus = projection?.effectiveStatus ?? inv?.status ?? entry.settlementStatusLabel;

    let status = inv?.status ?? entry.settlementStatusLabel;
    if (alloc?.excludedBecauseCheckoutPaid) status = 'excluded_checkout_paid';
    else if (entry.role === 'departed' && amountAllocatedPaise === 0 && previousCollectedPaise > 0) {
      status = 'settled_at_checkout';
    }

    const financialInvoiceId =
      inv?.invoiceId != null
        ? (financialInvoiceIdByElectricityInvoiceId?.get(`electricity_invoices:${inv.invoiceId}`) ??
          null)
        : alloc?.invoiceId != null
          ? (financialInvoiceIdByElectricityInvoiceId?.get(
              `electricity_invoices:${alloc.invoiceId}`,
            ) ?? null)
          : null;

    const paidAt =
      projection?.paidAt ??
      (inv?.paidAt instanceof Date
        ? inv.paidAt.toISOString()
        : typeof inv?.paidAt === 'string'
          ? inv.paidAt
          : null);

    const timeline = buildElectricityResidentTimeline({
      bookingId: entry.bookingId,
      checkIn: entry.stayStart,
      billGeneratedAt: generatedAt,
      invoiceId: inv?.invoiceId ?? alloc?.invoiceId ?? null,
      financialInvoiceId,
      creditAppliedPaise: previousCollectedPaise,
      amountAllocatedPaise,
      amountPaidPaise: currentPaidPaise,
      currentOutstandingPaise,
      paidAt,
      invoiceStatus: paymentStatus,
    });

    const occupancyPct =
      billingCycleDays > 0
        ? Math.round((entry.activeDays / billingCycleDays) * 100)
        : 0;

    return {
      invoiceId: inv?.invoiceId ?? alloc?.invoiceId ?? null,
      invoiceNumber: inv?.invoiceNumber ?? alloc?.invoiceNumber ?? null,
      bookingId: entry.bookingId,
      customerId: entry.customerId,
      customerName: entry.customerName,
      bedCode: inv?.bedCode ?? null,
      checkIn: entry.stayStart,
      checkOut: entry.stayEnd,
      daysCharged: entry.activeDays,
      billingCycleDays,
      occupancyPct,
      unitsAllocated:
        inv?.unitsShare != null
          ? Number(inv.unitsShare)
          : breakdown.meter.unitsConsumed > 0 && breakdown.useProRata
            ? Math.round(
                ((breakdown.meter.unitsConsumed * entry.activeDays) /
                  Math.max(
                    1,
                    breakdown.timeline.reduce((s, t) => s + t.activeDays, 0),
                  )) *
                  100,
              ) / 100
            : null,
      amountAllocatedPaise,
      previousOutstandingPaise,
      previousCollectedPaise,
      currentPaidPaise,
      currentOutstandingPaise,
      amountPaidPaise: currentPaidPaise,
      status,
      paymentStatus,
      role: entry.role,
      excludedBecauseCheckoutPaid: alloc?.excludedBecauseCheckoutPaid ?? false,
      financialInvoiceId,
      timeline,
    };
  });

  const sumAllocatedPaise = residentRows.reduce((s, r) => s + r.amountAllocatedPaise, 0);
  const prepaidCreditPaise = ledger.prepaidCreditAppliedPaise;
  const checkoutCreditsPaise = ledger.checkoutSettlementTotalPaise;
  const manualCreditsPaise = ledger.manualCreditsTotalPaise;
  const sumCreditsPaise = prepaidCreditPaise + checkoutCreditsPaise + manualCreditsPaise;
  const roundingRemainderPaise = ledger.roundingRemainderPaise;

  const reconciliation = computeElectricitySettlementLedgerReconciliation({
    totalRoomBillPaise: ledger.totalRoomBillPaise,
    prepaidCreditAppliedPaise: prepaidCreditPaise,
    checkoutSettlementCreditsPaise: checkoutCreditsPaise,
    manualCreditsPaise,
    residentAllocationsPaise: sumAllocatedPaise,
    roundingRemainderPaise,
  });

  const roomSummary: RoomElectricityAuditRoomSummary = {
    roomNumber: breakdown.roomNumber,
    pgName,
    billingPeriodStart,
    billingPeriodEnd,
    meterStartUnits: breakdown.meter.previousReadingUnits,
    meterEndUnits: breakdown.meter.currentReadingUnits,
    unitsConsumed: breakdown.meter.unitsConsumed,
    ratePerUnitPaise: breakdown.meter.ratePerUnitPaise,
    grossTotalPaise: breakdown.meter.grossTotalPaise,
    residentCount: residentRows.length,
    generatedAt,
    collectionStatus: collectionStatus(ledger.collectedPaise, ledger.outstandingPaise),
    collectedPaise: ledger.collectedPaise,
    outstandingPaise: ledger.outstandingPaise,
    collectionPercentage: ledger.collectionPercentage,
  };

  return {
    roomSummary,
    roomNumber: breakdown.roomNumber,
    billingMonth: breakdown.billingMonth,
    grossTotalPaise: breakdown.meter.grossTotalPaise,
    prepaidCreditPaise,
    checkoutCreditsPaise,
    manualCreditsPaise,
    splittablePaise: breakdown.remainingBillPaise,
    roundingRemainderPaise,
    residentRows,
    sumAllocatedPaise,
    sumCreditsPaise,
    reconciliationGapPaise: reconciliation.reconciliationGapPaise,
    isBalanced: reconciliation.isBalanced,
    collectedPaise: ledger.collectedPaise,
    outstandingPaise: ledger.outstandingPaise,
    collectionPercentage: ledger.collectionPercentage,
  };
}
