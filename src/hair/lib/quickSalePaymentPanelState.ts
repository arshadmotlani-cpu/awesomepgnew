import type { BasketFlags, PaymentEntry } from '@/src/hair/domain/basket/types';

export type PaymentPanelSummary = {
  paidPaise: number;
  duePaise: number;
  remainingToAllocatePaise: number;
  overpayPaise: number;
  isDueMarked: boolean;
  isComplete: boolean;
  isZeroTotal: boolean;
};

export function sumPaymentsPaise(payments: PaymentEntry[]): number {
  return payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
}

export function computePaymentPanelSummary(input: {
  grandTotalPaise: number;
  payments: PaymentEntry[];
  flags: BasketFlags;
}): PaymentPanelSummary {
  const grandTotalPaise = Math.max(0, Math.floor(input.grandTotalPaise));
  const paidPaise = sumPaymentsPaise(input.payments);
  const isZeroTotal = grandTotalPaise === 0;
  const isDueMarked = Boolean(input.flags.markDue || input.flags.markFullDue);
  const rawRemaining = Math.max(0, grandTotalPaise - paidPaise);
  const duePaise = isDueMarked ? rawRemaining : 0;
  const remainingToAllocatePaise = isDueMarked || isZeroTotal ? 0 : rawRemaining;
  const overpayPaise = Math.max(0, paidPaise - grandTotalPaise);
  const isComplete =
    isZeroTotal ||
    (isDueMarked && rawRemaining >= 0) ||
    (!isDueMarked && paidPaise >= grandTotalPaise && grandTotalPaise > 0);

  return {
    paidPaise,
    duePaise,
    remainingToAllocatePaise,
    overpayPaise,
    isDueMarked,
    isComplete,
    isZeroTotal,
  };
}

export function parseDraftAmountRupee(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

export function formatDraftAmountFromPaise(paise: number): string {
  if (paise <= 0) return '';
  const rupees = paise / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

export function validateDraftPayment(input: {
  draftPaise: number;
  remainingToAllocatePaise: number;
}): string | null {
  if (input.draftPaise <= 0) return 'Enter an amount greater than zero';
  if (input.draftPaise > input.remainingToAllocatePaise) {
    return `Amount cannot exceed remaining ${(input.remainingToAllocatePaise / 100).toFixed(2)}`;
  }
  return null;
}

export function flagsForMarkRemainingDue(input: {
  paidPaise: number;
  remainingPaise: number;
}): BasketFlags {
  if (input.remainingPaise <= 0) {
    return { markDue: false, markFullDue: false };
  }
  if (input.paidPaise <= 0) {
    return { markDue: false, markFullDue: true };
  }
  return { markDue: true, markFullDue: false };
}

export function clearDueFlagsIfFullyPaid(
  flags: BasketFlags,
  paidPaise: number,
  grandTotalPaise: number,
): BasketFlags {
  if (grandTotalPaise <= 0) return flags;
  if (paidPaise < grandTotalPaise) return flags;
  if (!flags.markDue && !flags.markFullDue) return flags;
  return {
    ...flags,
    markDue: false,
    markFullDue: false,
  };
}

export function mergeDueFlags(flags: BasketFlags, nextDueFlags: BasketFlags): BasketFlags {
  return {
    ...flags,
    markDue: nextDueFlags.markDue ?? false,
    markFullDue: nextDueFlags.markFullDue ?? false,
  };
}
