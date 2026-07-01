/**
 * Client-safe electricity breakdown helpers — no database imports.
 */
import type {
  ElectricityBillCalculationBreakdown,
  ElectricityBreakdownViewerContext,
} from '@/src/lib/billing/electricityBillBreakdownTypes';

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

  for (const credit of breakdown.adjustments.checkoutCredits) {
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
