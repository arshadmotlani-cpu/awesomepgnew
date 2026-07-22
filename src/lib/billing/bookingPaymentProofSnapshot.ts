/**
 * Booking checkout proof snapshot — frozen at submit, used for admin review.
 * Mirrors rent_invoices proof_snapshot_* pattern for pg_payment_records.
 */

import type { PriorOutstandingItem } from '@/src/lib/billing/bookingCheckoutTotals';
import { isRentDoubleCountCorruption } from '@/src/lib/operations/paymentReviewProofAmount';

export type BookingPaymentProofSnapshot = {
  checkoutTotalPaise: number;
  rentDuePaise: number;
  depositDuePaise: number;
  priorOutstandingPaise: number;
  priorOutstandingItems: PriorOutstandingItem[];
};

export type PgPaymentRecordProofSnapshotFields = {
  proofSnapshotCheckoutTotalPaise?: number | null;
  proofSnapshotRentDuePaise?: number | null;
  proofSnapshotDepositDuePaise?: number | null;
  proofSnapshotPriorOutstandingPaise?: number | null;
  proofSnapshotPriorOutstandingJson?: PriorOutstandingItem[] | null;
  proofSnapshotSubmittedPaise?: number | null;
  status?: string;
};

const PROOF_AMOUNT_TOLERANCE_PAISE = 100;

export function buildBookingPaymentProofSnapshot(input: {
  rentDuePaise: number;
  depositCashDuePaise: number;
  priorOutstandingPaise: number;
  priorOutstandingItems: PriorOutstandingItem[];
}): BookingPaymentProofSnapshot {
  const rentDuePaise = Math.max(0, input.rentDuePaise);
  const depositDuePaise = Math.max(0, input.depositCashDuePaise);
  const priorOutstandingPaise = Math.max(0, input.priorOutstandingPaise);
  return {
    checkoutTotalPaise: rentDuePaise + depositDuePaise + priorOutstandingPaise,
    rentDuePaise,
    depositDuePaise,
    priorOutstandingPaise,
    priorOutstandingItems: input.priorOutstandingItems,
  };
}

export function proofSnapshotRowValues(
  snapshot: BookingPaymentProofSnapshot,
  submittedPaise: number,
) {
  return {
    proofSnapshotCheckoutTotalPaise: snapshot.checkoutTotalPaise,
    proofSnapshotRentDuePaise: snapshot.rentDuePaise,
    proofSnapshotDepositDuePaise: snapshot.depositDuePaise,
    proofSnapshotPriorOutstandingPaise: snapshot.priorOutstandingPaise,
    proofSnapshotPriorOutstandingJson:
      snapshot.priorOutstandingItems.length > 0 ? snapshot.priorOutstandingItems : null,
    proofSnapshotSubmittedPaise: submittedPaise,
  };
}

function frozenSnapshotFromRecord(
  record: PgPaymentRecordProofSnapshotFields,
): BookingPaymentProofSnapshot | null {
  if (record.proofSnapshotCheckoutTotalPaise == null || record.proofSnapshotCheckoutTotalPaise < 0) {
    return null;
  }
  return {
    checkoutTotalPaise: record.proofSnapshotCheckoutTotalPaise,
    rentDuePaise: Math.max(0, record.proofSnapshotRentDuePaise ?? 0),
    depositDuePaise: Math.max(0, record.proofSnapshotDepositDuePaise ?? 0),
    priorOutstandingPaise: Math.max(0, record.proofSnapshotPriorOutstandingPaise ?? 0),
    priorOutstandingItems: Array.isArray(record.proofSnapshotPriorOutstandingJson)
      ? record.proofSnapshotPriorOutstandingJson
      : [],
  };
}

/** True when a frozen expected snapshot was derived from a corrupt proof amount, not booking data. */
export function isProofContaminatedExpectedSnapshot(input: {
  frozen: BookingPaymentProofSnapshot;
  live: BookingPaymentProofSnapshot;
  storedProofAmountPaise?: number | null;
}): boolean {
  const { frozen, live, storedProofAmountPaise } = input;
  const componentSum =
    frozen.rentDuePaise + frozen.depositDuePaise + frozen.priorOutstandingPaise;

  if (Math.abs(componentSum - frozen.checkoutTotalPaise) > PROOF_AMOUNT_TOLERANCE_PAISE) {
    return true;
  }

  if (
    storedProofAmountPaise != null &&
    storedProofAmountPaise > 0 &&
    Math.abs(frozen.checkoutTotalPaise - storedProofAmountPaise) <= PROOF_AMOUNT_TOLERANCE_PAISE &&
    Math.abs(live.checkoutTotalPaise - storedProofAmountPaise) > PROOF_AMOUNT_TOLERANCE_PAISE
  ) {
    return true;
  }

  if (
    isRentDoubleCountCorruption({
      storedAmountPaise: frozen.checkoutTotalPaise,
      rentDuePaise: live.rentDuePaise,
      expectedCheckoutPaise: live.checkoutTotalPaise,
    })
  ) {
    return true;
  }

  if (
    storedProofAmountPaise != null &&
    storedProofAmountPaise > 0 &&
    Math.abs(frozen.rentDuePaise - storedProofAmountPaise) <= PROOF_AMOUNT_TOLERANCE_PAISE &&
    live.rentDuePaise > 0 &&
    Math.abs(frozen.rentDuePaise - live.rentDuePaise) > PROOF_AMOUNT_TOLERANCE_PAISE
  ) {
    return true;
  }

  if (
    frozen.rentDuePaise > 0 &&
    frozen.depositDuePaise === 0 &&
    frozen.priorOutstandingPaise === 0 &&
    Math.abs(frozen.rentDuePaise - frozen.checkoutTotalPaise) <= PROOF_AMOUNT_TOLERANCE_PAISE &&
    live.depositDuePaise > 0 &&
    Math.abs(frozen.checkoutTotalPaise - live.checkoutTotalPaise) > PROOF_AMOUNT_TOLERANCE_PAISE
  ) {
    return true;
  }

  return false;
}

/**
 * Pending proofs: prefer frozen snapshot over live recomputation when trustworthy.
 * Falls back to live booking financial data when the snapshot was proof-contaminated.
 */
export function resolveBookingProofExpectedCheckout(
  record: PgPaymentRecordProofSnapshotFields,
  liveFallback: BookingPaymentProofSnapshot,
  options?: { storedProofAmountPaise?: number | null },
): BookingPaymentProofSnapshot {
  if (record.status !== 'pending') {
    return liveFallback;
  }

  const frozen = frozenSnapshotFromRecord(record);
  if (!frozen) {
    return liveFallback;
  }

  if (
    isProofContaminatedExpectedSnapshot({
      frozen,
      live: liveFallback,
      storedProofAmountPaise: options?.storedProofAmountPaise,
    })
  ) {
    return liveFallback;
  }

  return frozen;
}

export function validateSubmittedAmountAgainstProofSnapshot(
  submittedPaise: number,
  snapshot: BookingPaymentProofSnapshot,
): { ok: true } | { ok: false; message: string } {
  if (submittedPaise <= 0) {
    return { ok: false, message: 'Payment amount must be greater than zero.' };
  }
  if (submittedPaise > snapshot.checkoutTotalPaise + PROOF_AMOUNT_TOLERANCE_PAISE) {
    const expectedInr = (snapshot.checkoutTotalPaise / 100).toFixed(0);
    const submittedInr = (submittedPaise / 100).toFixed(0);
    return {
      ok: false,
      message: `Payment amount ₹${submittedInr} exceeds expected checkout ₹${expectedInr}.`,
    };
  }
  const rentPlusExpected =
    snapshot.rentDuePaise + snapshot.checkoutTotalPaise;
  if (Math.abs(submittedPaise - rentPlusExpected) <= PROOF_AMOUNT_TOLERANCE_PAISE) {
    return {
      ok: false,
      message:
        'Payment amount looks like rent plus checkout total — rent was counted twice. Enter the screenshot amount only.',
    };
  }
  return { ok: true };
}

/**
 * Backfill helper — infer proof snapshot from immutable amount_paise + booking rent/deposit.
 * Used when historical proofs were submitted before snapshot columns existed.
 */
export function inferProofSnapshotFromPaidAmount(input: {
  amountPaise: number;
  rentDuePaise: number;
  depositDuePaise: number;
  priorOutstandingItems?: PriorOutstandingItem[];
}): BookingPaymentProofSnapshot {
  const rentDuePaise = Math.max(0, input.rentDuePaise);
  const depositDuePaise = Math.max(0, input.depositDuePaise);
  const impliedPriorPaise = Math.max(0, input.amountPaise - rentDuePaise - depositDuePaise);
  const storedItems = input.priorOutstandingItems ?? [];
  const storedTotal = storedItems.reduce((sum, item) => sum + item.amountPaise, 0);

  let priorOutstandingItems: PriorOutstandingItem[] = [];
  if (impliedPriorPaise <= 0) {
    priorOutstandingItems = [];
  } else if (storedTotal > 0 && Math.abs(storedTotal - impliedPriorPaise) <= 100) {
    priorOutstandingItems = storedItems;
  } else {
    priorOutstandingItems = [
      {
        label: 'Prior outstanding',
        amountPaise: impliedPriorPaise,
        kind: 'other',
      },
    ];
  }

  return buildBookingPaymentProofSnapshot({
    rentDuePaise,
    depositCashDuePaise: depositDuePaise,
    priorOutstandingPaise: impliedPriorPaise,
    priorOutstandingItems,
  });
}

/** Detect rows where live prior dropped but paid amount still includes prior slice. */
export function detectStalePriorOutstandingMismatch(input: {
  amountPaise: number;
  rentDuePaise: number;
  depositDuePaise: number;
  livePriorOutstandingPaise: number;
  storedPriorOutstandingPaise?: number | null;
}): boolean {
  const coreDue = input.rentDuePaise + input.depositDuePaise;
  const impliedPrior = Math.max(0, input.amountPaise - coreDue);
  if (impliedPrior <= 100) return false;
  if (input.livePriorOutstandingPaise > 100) return false;
  if (input.storedPriorOutstandingPaise != null && input.storedPriorOutstandingPaise > 100) {
    return false;
  }
  return true;
}
