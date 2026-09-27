/**
 * Operator-facing checkout electricity audit — historical bill + persisted invoice/collections.
 * Does not mutate billing data; presentation and deposit-deduction SSOT for checkout UI.
 */
import { resolveCheckoutElectricityDeductionPaise } from '@/src/lib/checkout/electricitySettlementCalc';
import type { CheckoutRoomElectricityBillSource } from '@/src/lib/checkout/roomElectricityCheckoutBill';

export type CheckoutResidentElectricityInvoiceSnapshot = {
  billingMonth: string;
  amountPaise: number;
  paidPaise: number;
  status: string;
  invoiceNumber?: string | null;
};

export type CheckoutElectricityOperatorAudit = {
  billingMonth: string;
  historicalBillPaise: number;
  billSource: CheckoutRoomElectricityBillSource | 'unset';
  hasFinalizedHistoricalBill: boolean;
  /** Stale settlement meter math (diagnostic only). */
  staleMeterDerivedBillPaise: number | null;
  residentInvoice: CheckoutResidentElectricityInvoiceSnapshot | null;
  /** Invoice face amount when invoice exists; else null. */
  residentBilledPaise: number | null;
  alreadyCollectedPaise: number;
  electricityRemainingPaise: number;
  /** Amount deducted from security deposit (persisted settlement SSOT). */
  depositDeductionPaise: number;
  usesPersistedInvoiceForDisplay: boolean;
};

export type BuildCheckoutElectricityOperatorAuditInput = {
  billingMonth: string;
  authoritativeBillPaise: number;
  billSource: CheckoutRoomElectricityBillSource | null;
  staleMeterDerivedBillPaise?: number | null;
  residentInvoice: CheckoutResidentElectricityInvoiceSnapshot | null;
  /** Collections map entry for resident when no invoice row. */
  fallbackCollectedPaise?: number;
  electricityCalculationMethod: string;
  electricitySharePaise: number;
  manualChargePaise?: number | null;
  electricityDeductFromDeposit: boolean;
};

/** Remaining electricity due for this resident (invoice SSOT when present). */
export function resolveResidentElectricityRemainingPaise(input: {
  residentInvoice: CheckoutResidentElectricityInvoiceSnapshot | null;
  fallbackCollectedPaise: number;
  fallbackBilledPaise?: number | null;
}): {
  billedPaise: number | null;
  collectedPaise: number;
  remainingPaise: number;
  usesPersistedInvoice: boolean;
} {
  if (input.residentInvoice) {
    const billedPaise = Math.max(0, input.residentInvoice.amountPaise);
    const collectedPaise = Math.max(0, input.residentInvoice.paidPaise);
    const remainingPaise = Math.max(0, billedPaise - collectedPaise);
    return { billedPaise, collectedPaise, remainingPaise, usesPersistedInvoice: true };
  }
  const billedPaise =
    input.fallbackBilledPaise != null && input.fallbackBilledPaise > 0
      ? input.fallbackBilledPaise
      : null;
  const collectedPaise = Math.max(0, input.fallbackCollectedPaise);
  const remainingPaise =
    billedPaise != null ? Math.max(0, billedPaise - collectedPaise) : Math.max(0, 0);
  return { billedPaise, collectedPaise, remainingPaise, usesPersistedInvoice: false };
}

/** Deposit deduction for checkout — outstanding invoice balance, capped by persisted share when set. */
export function resolveCheckoutElectricityDepositDeductionForSave(input: {
  residentInvoice: CheckoutResidentElectricityInvoiceSnapshot | null;
  timelineSharePaise: number;
  meterSharePaise: number;
  electricityDeductFromDeposit: boolean;
}): number {
  if (!input.electricityDeductFromDeposit) return 0;
  if (input.residentInvoice) {
    const remaining = Math.max(
      0,
      input.residentInvoice.amountPaise - input.residentInvoice.paidPaise,
    );
    return remaining;
  }
  return input.timelineSharePaise ?? input.meterSharePaise;
}

export function buildCheckoutElectricityOperatorAudit(
  input: BuildCheckoutElectricityOperatorAuditInput,
): CheckoutElectricityOperatorAudit {
  const hasFinalizedHistoricalBill =
    input.billSource === 'electricity_bill' && input.authoritativeBillPaise > 0;

  const historicalBillPaise = hasFinalizedHistoricalBill
    ? input.authoritativeBillPaise
    : input.authoritativeBillPaise > 0
      ? input.authoritativeBillPaise
      : input.staleMeterDerivedBillPaise ?? 0;

  const invoiceRemaining = resolveResidentElectricityRemainingPaise({
    residentInvoice: input.residentInvoice,
    fallbackCollectedPaise: input.fallbackCollectedPaise ?? 0,
    fallbackBilledPaise: null,
  });

  const depositDeductionPaise = resolveCheckoutElectricityDeductionPaise({
    electricityCalculationMethod: input.electricityCalculationMethod,
    electricitySharePaise: input.electricitySharePaise,
    manualChargePaise: input.manualChargePaise ?? null,
    electricityDeductFromDeposit: input.electricityDeductFromDeposit,
  });

  return {
    billingMonth: input.billingMonth,
    historicalBillPaise,
    billSource: input.billSource ?? 'unset',
    hasFinalizedHistoricalBill,
    staleMeterDerivedBillPaise: input.staleMeterDerivedBillPaise ?? null,
    residentInvoice: input.residentInvoice,
    residentBilledPaise: invoiceRemaining.billedPaise,
    alreadyCollectedPaise: invoiceRemaining.collectedPaise,
    electricityRemainingPaise: invoiceRemaining.remainingPaise,
    depositDeductionPaise,
    usesPersistedInvoiceForDisplay: invoiceRemaining.usesPersistedInvoice,
  };
}

/** Authoritative room bill for operator UI — finalized bill wins over stale meter math. */
export function operatorDisplayRoomBillPaise(audit: CheckoutElectricityOperatorAudit): number {
  if (audit.hasFinalizedHistoricalBill) return audit.historicalBillPaise;
  return audit.historicalBillPaise;
}
