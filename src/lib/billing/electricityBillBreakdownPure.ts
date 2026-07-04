/**
 * Client-safe electricity breakdown helpers — no database imports.
 */
import type {
  ElectricityBillCalculationBreakdown,
  ElectricityBreakdownViewerContext,
  ElectricitySettlementDisplayStatus,
  ElectricityTimelineEntry,
  RoomElectricityTimelineRow,
} from '@/src/lib/billing/electricityBillBreakdownTypes';
import { diffDays, formatDate, parseDate } from '@/src/lib/dates';
import { monthBounds, splitElectricityWeighted } from '@/src/services/billing';

function formatStayLabel(stayStart: string, stayEnd: string | null, entireMonth: boolean): string {
  if (entireMonth) return 'Entire month';
  if (!stayEnd) return `${formatDate(parseDate(stayStart))} → ongoing`;
  return `${formatDate(parseDate(stayStart))} → ${formatDate(parseDate(stayEnd))}`;
}

export function stayLabelForTimelineRow(
  row: Pick<RoomElectricityTimelineRow, 'stayStart' | 'stayEnd' | 'activeDays' | 'role'>,
  daysInMonth: number,
): string {
  const entireMonth = row.role === 'active' && row.activeDays >= daysInMonth;
  return formatStayLabel(row.stayStart, row.stayEnd, entireMonth);
}

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
  previousContributions?: Array<{
    customerId: string;
    customerName: string;
    bookingId: string;
    amountPaise: number;
    kind: 'historical' | 'checkout_recovery';
    reason: string | null;
    contributionDate: string;
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

  const previousContributions = input.previousContributions ?? [];
  const contributionsTotal = previousContributions.reduce((sum, row) => sum + row.amountPaise, 0);
  const totalDeducted =
    input.prepaidCreditPaise +
    (previousContributions.length > 0
      ? contributionsTotal
      : input.checkoutCreditAppliedPaise + input.manualCreditPaise);

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
    previousContributions,
    remainingBillPaise: input.remainingBillPaise,
    useProRata: input.useProRata,
    timeline,
    generatedAt: new Date().toISOString(),
  };
}

export function personalizeElectricityBreakdown(
  breakdown: ElectricityBillCalculationBreakdown,
  viewerCustomerId: string,
): {
  breakdown: ElectricityBillCalculationBreakdown;
  viewer: ElectricityBreakdownViewerContext | null;
} {
  const viewerEntry = breakdown.timeline.find((t) => t.customerId === viewerCustomerId);
  if (!viewerEntry) {
    return { breakdown, viewer: null };
  }

  const occupancyLabel =
    viewerEntry.stayLabel && viewerEntry.stayLabel !== 'Entire month'
      ? viewerEntry.stayLabel.replace(' → ', ' → ')
      : viewerEntry.stayLabel;

  const amountPayablePaise =
    viewerEntry.monthlyInvoiceAmountPaise > 0
      ? viewerEntry.monthlyInvoiceAmountPaise
      : viewerEntry.role === 'active'
        ? breakdown.remainingBillPaise
        : 0;

  return {
    breakdown,
    viewer: {
      customerId: viewerCustomerId,
      customerName: viewerEntry.customerName,
      amountPayablePaise,
      occupancyLabel,
    },
  };
}

export function breakdownToInvoiceLines(
  breakdown: ElectricityBillCalculationBreakdown,
  viewerCustomerId?: string,
): Array<{ kind: string; label: string; amountPaise: number }> {
  const lines: Array<{ kind: string; label: string; amountPaise: number }> = [];
  const m = breakdown.meter;

  lines.push({
    kind: 'electricity_meter',
    label: `Room ${breakdown.roomNumber} · ${m.unitsConsumed} units @ ₹${m.ratePerUnitPaise / 100}/unit`,
    amountPaise: m.grossTotalPaise,
  });

  for (const credit of breakdown.adjustments.checkoutCredits ?? []) {
    const parts: string[] = [];
    if (credit.recoveredFromDepositPaise > 0) {
      parts.push(`₹${(credit.recoveredFromDepositPaise / 100).toFixed(0)} from deposit`);
    }
    if (credit.collectedDuringCheckoutPaise > 0) {
      parts.push(`₹${(credit.collectedDuringCheckoutPaise / 100).toFixed(0)} at checkout`);
    }
    lines.push({
      kind: 'electricity_credit',
      label: `${credit.customerName} — already collected${parts.length ? ` (${parts.join(', ')})` : ''}`,
      amountPaise: -credit.amountPaise,
    });
  }

  if (breakdown.adjustments.prepaidCreditPaise > 0) {
    lines.push({
      kind: 'electricity_credit',
      label: breakdown.adjustments.prepaidCreditNote ?? 'Prepaid credit',
      amountPaise: -breakdown.adjustments.prepaidCreditPaise,
    });
  }

  if (breakdown.adjustments.manualCreditPaise > 0) {
    lines.push({
      kind: 'electricity_credit',
      label: 'Manual / offline credit',
      amountPaise: -breakdown.adjustments.manualCreditPaise,
    });
  }

  for (const contribution of breakdown.previousContributions ?? []) {
    const label =
      contribution.kind === 'checkout_recovery'
        ? `${contribution.customerName} — recovered from checkout`
        : `${contribution.customerName} — previous contribution`;
    lines.push({
      kind: 'electricity_credit',
      label,
      amountPaise: -contribution.amountPaise,
    });
  }

  const viewerEntry = viewerCustomerId
    ? breakdown.timeline.find((t) => t.customerId === viewerCustomerId)
    : null;

  if (viewerEntry && viewerEntry.monthlyInvoiceAmountPaise > 0) {
    lines.push({
      kind: 'electricity',
      label: 'Your electricity share',
      amountPaise: viewerEntry.monthlyInvoiceAmountPaise,
    });
  }

  return lines;
}
