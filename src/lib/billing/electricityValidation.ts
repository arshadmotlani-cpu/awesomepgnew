/**
 * Electricity module validation guards — prevent double-charge, over-collection, and ledger mismatch.
 */
import type { ElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';

export type ElectricityValidationIssue = {
  code:
    | 'reconciliation_gap'
    | 'over_collection'
    | 'negative_balance'
    | 'duplicate_invoice_risk'
    | 'unbalanced_room';
  severity: 'error' | 'warning';
  message: string;
};

export type ElectricityRoomValidation = {
  roomId: string;
  roomNumber: string;
  billingMonth: string;
  issues: ElectricityValidationIssue[];
  isValid: boolean;
};

export function validateElectricityLedgerView(
  ledger: ElectricitySettlementLedgerView,
): ElectricityRoomValidation {
  const issues: ElectricityValidationIssue[] = [];

  if (!ledger.isBalanced) {
    issues.push({
      code: 'reconciliation_gap',
      severity: 'error',
      message: `Room bill does not match credits + resident shares. Gap: ₹${(Math.abs(ledger.reconciliationGapPaise) / 100).toFixed(2)}`,
    });
  }

  if (ledger.overCollectionPaise > 0) {
    issues.push({
      code: 'over_collection',
      severity: 'error',
      message: `Room collected ₹${(ledger.overCollectionPaise / 100).toFixed(2)} more than the bill allows.`,
    });
  }

  if (ledger.outstandingPaise < 0) {
    issues.push({
      code: 'negative_balance',
      severity: 'error',
      message: 'Outstanding balance is negative — collection exceeds room bill.',
    });
  }

  const pendingDuplicates = ledger.residentAllocations.filter(
    (a) => a.status === 'pending' && a.amountPaise > 0 && a.excludedBecauseCheckoutPaid,
  );
  if (pendingDuplicates.length > 0) {
    issues.push({
      code: 'duplicate_invoice_risk',
      severity: 'warning',
      message: `${pendingDuplicates.length} resident(s) have pending invoices but already paid at checkout.`,
    });
  }

  return {
    roomId: ledger.roomId,
    roomNumber: ledger.roomNumber,
    billingMonth: ledger.billingMonth,
    issues,
    isValid: issues.every((i) => i.severity !== 'error'),
  };
}

export function collectionPercentage(collectedPaise: number, totalBillPaise: number): number {
  if (totalBillPaise <= 0) return collectedPaise > 0 ? 100 : 0;
  return Math.min(100, Math.round((collectedPaise / totalBillPaise) * 100));
}

export function assertBillGenerationSafe(input: {
  reconciliationGapPaise: number;
  overCollectionPaise: number;
}): { ok: true } | { ok: false; error: string } {
  if (input.overCollectionPaise > 0) {
    return {
      ok: false,
      error: `Cannot generate bill — room already over-collected by ₹${(input.overCollectionPaise / 100).toFixed(2)}.`,
    };
  }
  if (input.reconciliationGapPaise !== 0) {
    return {
      ok: false,
      error: `Cannot generate bill — reconciliation gap ₹${(Math.abs(input.reconciliationGapPaise) / 100).toFixed(2)}.`,
    };
  }
  return { ok: true };
}
