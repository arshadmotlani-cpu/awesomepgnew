/**
 * Build and load transparent electricity bill calculation breakdown.
 */
import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills, electricityInvoices, rooms } from '@/src/db/schema';
import type { RoomElectricityOccupantLoadResult } from '@/src/lib/billing/roomElectricityOccupants';
import type {
  ElectricityBillCalculationBreakdown,
  ElectricityBreakdownViewerContext,
  ElectricitySettlementDisplayStatus,
  ElectricityTimelineEntry,
} from '@/src/lib/billing/electricityBillBreakdownTypes';
import {
  loadRoomElectricityTimelineForMonth,
  stayLabelForTimelineRow,
  type RoomElectricityTimelineRow,
} from '@/src/lib/billing/roomElectricityTimeline';
import { splitElectricityWeighted } from '@/src/services/billing';
import { monthBounds } from '@/src/services/billing';
import { diffDays } from '@/src/lib/dates';

export {
  personalizeElectricityBreakdown,
  breakdownToInvoiceLines,
} from '@/src/lib/billing/electricityBillBreakdownPure';

function settlementStatusForRow(
  row: RoomElectricityTimelineRow,
  monthlyInvoiceAmountPaise: number,
): { status: ElectricitySettlementDisplayStatus; label: string } {
  if (row.role === 'active') {
    if (monthlyInvoiceAmountPaise > 0) {
      return { status: 'active_billable', label: 'Your share this month' };
    }
    return { status: 'excluded_zero_balance', label: 'No balance due' };
  }

  const credit = row.settlement?.creditAppliedToRoomBillPaise ?? 0;
  const share = row.settlement?.electricitySharePaise ?? 0;
  if (credit <= 0 && share <= 0) {
    return { status: 'excluded_zero_balance', label: 'No electricity charge' };
  }
  if (row.settlement?.recoveredFromDepositPaise && row.settlement.collectedDuringCheckoutPaise) {
    return { status: 'fully_settled', label: '✓ Fully settled' };
  }
  if (row.settlement?.recoveredFromDepositPaise) {
    return { status: 'recovered_from_deposit', label: '✓ Recovered from deposit' };
  }
  if (credit > 0 || row.settlement?.collectedDuringCheckoutPaise) {
    return { status: 'already_collected_at_checkout', label: '✓ Already collected during checkout' };
  }
  return { status: 'fully_settled', label: '✓ Fully settled' };
}

function proRataSharePaise(
  grossTotalPaise: number,
  weight: number,
  allWeights: number[],
  index: number,
): number {
  if (grossTotalPaise <= 0 || weight <= 0) return 0;
  const shares = splitElectricityWeighted({ totalPaise: grossTotalPaise, weights: allWeights });
  return shares.shares[index] ?? 0;
}

export function buildElectricityBillBreakdownFromContext(input: {
  roomNumber: string;
  billingMonth: string;
  previousReadingUnits: number;
  currentReadingUnits: number;
  ratePerUnitPaise: number;
  grossTotalPaise: number;
  prepaidCreditPaise: number;
  prepaidCreditNote?: string | null;
  manualCreditPaise: number;
  checkoutCreditAppliedPaise: number;
  remainingBillPaise: number;
  useProRata: boolean;
  timelineRows: RoomElectricityTimelineRow[];
  invoiceAmountByBookingId: Map<string, number>;
  checkoutCredits: Array<{
    customerId: string;
    customerName: string;
    amountPaise: number;
    recoveredFromDepositPaise: number;
    collectedDuringCheckoutPaise: number;
  }>;
}): ElectricityBillCalculationBreakdown {
  const unitsConsumed = Math.round((input.currentReadingUnits - input.previousReadingUnits) * 100) / 100;
  const { start: monthStart, end: monthEnd } = monthBounds(input.billingMonth);
  const daysInMonth = diffDays(monthStart, monthEnd);

  const weights = input.timelineRows.map((r) => r.activeDays);
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  const timeline: ElectricityTimelineEntry[] = input.timelineRows.map((row, idx) => {
    const monthlyInvoiceAmountPaise = input.invoiceAmountByBookingId.get(row.bookingId) ?? 0;
    const calculatedFromMeter =
      row.settlement?.electricitySharePaise && row.settlement.electricitySharePaise > 0
        ? row.settlement.electricitySharePaise
        : input.useProRata && totalWeight > 0
          ? proRataSharePaise(input.grossTotalPaise, row.activeDays, weights, idx)
          : Math.floor(input.grossTotalPaise / Math.max(1, input.timelineRows.length));

    const { status, label } = settlementStatusForRow(row, monthlyInvoiceAmountPaise);

    return {
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      role: row.role,
      vacatedOn: row.vacatedOn,
      stayStart: row.stayStart,
      stayEnd: row.stayEnd,
      stayLabel: stayLabelForTimelineRow(row, daysInMonth),
      activeDays: row.activeDays,
      calculatedSharePaise: calculatedFromMeter,
      recoveredFromDepositPaise: row.settlement?.recoveredFromDepositPaise ?? 0,
      collectedDuringCheckoutPaise: row.settlement?.collectedDuringCheckoutPaise ?? 0,
      creditAppliedToRoomBillPaise: row.settlement?.creditAppliedToRoomBillPaise ?? 0,
      monthlyInvoiceAmountPaise,
      settlementStatus: status,
      settlementStatusLabel: label,
    };
  });

  const totalDeducted =
    input.prepaidCreditPaise +
    input.checkoutCreditAppliedPaise +
    input.manualCreditPaise;

  return {
    version: 1,
    roomNumber: input.roomNumber,
    billingMonth: input.billingMonth,
    meter: {
      previousReadingUnits: input.previousReadingUnits,
      currentReadingUnits: input.currentReadingUnits,
      unitsConsumed,
      ratePerUnitPaise: input.ratePerUnitPaise,
      grossTotalPaise: input.grossTotalPaise,
    },
    adjustments: {
      prepaidCreditPaise: input.prepaidCreditPaise,
      prepaidCreditNote: input.prepaidCreditNote ?? null,
      checkoutCredits: input.checkoutCredits,
      manualCreditPaise: input.manualCreditPaise,
      totalDeductedPaise: totalDeducted,
    },
    remainingBillPaise: input.remainingBillPaise,
    useProRata: input.useProRata,
    timeline,
    generatedAt: new Date().toISOString(),
  };
}

export async function composeElectricityBillBreakdown(input: {
  roomId: string;
  roomNumber: string;
  billingMonth: string;
  previousReadingUnits: number;
  currentReadingUnits: number;
  ratePerUnitPaise: number;
  grossTotalPaise: number;
  prepaidCreditPaise: number;
  prepaidCreditNote?: string | null;
  manualCreditPaise: number;
  checkoutCreditAppliedPaise: number;
  remainingBillPaise: number;
  useProRata: boolean;
  occupantLoad: RoomElectricityOccupantLoadResult;
  invoiceAmountByBookingId: Map<string, number>;
}): Promise<ElectricityBillCalculationBreakdown> {
  const timelineRows = await loadRoomElectricityTimelineForMonth({
    roomId: input.roomId,
    billingMonth: input.billingMonth,
  });

  const checkoutCredits: ElectricityBillCalculationBreakdown['adjustments']['checkoutCredits'] = [];
  for (const row of timelineRows) {
    const credit = row.settlement?.creditAppliedToRoomBillPaise ?? 0;
    if (credit <= 0) continue;
    checkoutCredits.push({
      customerId: row.customerId,
      customerName: row.customerName,
      amountPaise: credit,
      recoveredFromDepositPaise: row.settlement?.recoveredFromDepositPaise ?? 0,
      collectedDuringCheckoutPaise: row.settlement?.collectedDuringCheckoutPaise ?? 0,
    });
  }

  // Include ledger-only credits not tied to timeline settlement rows
  for (const [customerId, amount] of input.occupantLoad.checkoutCollectedByCustomerId) {
    if (checkoutCredits.some((c) => c.customerId === customerId)) continue;
    if (amount <= 0) continue;
    const row = timelineRows.find((r) => r.customerId === customerId);
    checkoutCredits.push({
      customerId,
      customerName: row?.customerName ?? 'Former resident',
      amountPaise: amount,
      recoveredFromDepositPaise: amount,
      collectedDuringCheckoutPaise: 0,
    });
  }

  return buildElectricityBillBreakdownFromContext({
    ...input,
    timelineRows,
    checkoutCredits,
  });
}

export async function loadElectricityBillBreakdown(
  billId: string,
): Promise<ElectricityBillCalculationBreakdown | null> {
  const [bill] = await db
    .select({
      id: electricityBills.id,
      roomId: electricityBills.roomId,
      roomNumber: rooms.roomNumber,
      billingMonth: electricityBills.billingMonth,
      previousReadingUnits: electricityBills.previousReadingUnits,
      currentReadingUnits: electricityBills.currentReadingUnits,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
      totalPaise: electricityBills.totalPaise,
      prepaidCreditAppliedPaise: electricityBills.prepaidCreditAppliedPaise,
      prepaidCreditNote: electricityBills.prepaidCreditNote,
      checkoutCreditAppliedPaise: electricityBills.checkoutCreditAppliedPaise,
      calculationBreakdown: electricityBills.calculationBreakdown,
    })
    .from(electricityBills)
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .where(eq(electricityBills.id, billId))
    .limit(1);

  if (!bill) return null;
  if (bill.calculationBreakdown) {
    return bill.calculationBreakdown as ElectricityBillCalculationBreakdown;
  }

  const allInvoices = await db
    .select({
      bookingId: electricityInvoices.bookingId,
      amountPaise: electricityInvoices.amountPaise,
      status: electricityInvoices.status,
    })
    .from(electricityInvoices)
    .where(eq(electricityInvoices.electricityBillId, billId));

  const invoiceAmountByBookingId = new Map<string, number>();
  for (const inv of allInvoices) {
    if (inv.status === 'cancelled') continue;
    invoiceAmountByBookingId.set(inv.bookingId, inv.amountPaise);
  }

  const { sumManualElectricityCreditsForRoomMonth } = await import(
    '@/src/services/electricitySettlementLedgerView'
  );
  const manualCreditPaise = await sumManualElectricityCreditsForRoomMonth(
    bill.roomId,
    bill.billingMonth,
  );

  const grossTotalPaise = bill.totalPaise;
  const remainingBillPaise = Math.max(
    0,
    grossTotalPaise -
      bill.prepaidCreditAppliedPaise -
      bill.checkoutCreditAppliedPaise -
      manualCreditPaise,
  );

  const timelineRows = await loadRoomElectricityTimelineForMonth({
    roomId: bill.roomId,
    billingMonth: bill.billingMonth,
  });

  const checkoutCredits = timelineRows
    .filter((r) => (r.settlement?.creditAppliedToRoomBillPaise ?? 0) > 0)
    .map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName,
      amountPaise: r.settlement!.creditAppliedToRoomBillPaise,
      recoveredFromDepositPaise: r.settlement!.recoveredFromDepositPaise,
      collectedDuringCheckoutPaise: r.settlement!.collectedDuringCheckoutPaise,
    }));

  return buildElectricityBillBreakdownFromContext({
    roomNumber: bill.roomNumber,
    billingMonth: bill.billingMonth,
    previousReadingUnits: Number(bill.previousReadingUnits),
    currentReadingUnits: Number(bill.currentReadingUnits),
    ratePerUnitPaise: bill.ratePerUnitPaise,
    grossTotalPaise,
    prepaidCreditPaise: bill.prepaidCreditAppliedPaise,
    prepaidCreditNote: bill.prepaidCreditNote,
    manualCreditPaise,
    checkoutCreditAppliedPaise: bill.checkoutCreditAppliedPaise,
    remainingBillPaise,
    useProRata: true,
    timelineRows,
    invoiceAmountByBookingId,
    checkoutCredits,
  });
}
