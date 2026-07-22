/**
 * SSOT — amount for the ONE payment proof under review (not lifetime account totals).
 */

import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

/** Immutable proof row amount — pg_payment_records.amount_paise or invoice proof amount. */
export function proofAmountPaiseFromReviewItem(item: PendingPaymentReviewItem): number {
  if (item.amountPaise > 0) return item.amountPaise;
  return item.submittedAmountPaise ?? item.receivedPaise ?? 0;
}

/**
 * Detect corrupted proof amounts where rent was added on top of full checkout expected.
 * Example: rent ₹4,120 + expected ₹8,242 = stored ₹12,362 while screenshot shows ₹6,180.
 */
export function detectProofAmountCorruption(input: {
  proofAmountPaise: number;
  rentDuePaise: number;
  depositDuePaise: number;
  expectedCheckoutPaise: number;
}): string | null {
  const { proofAmountPaise, rentDuePaise, expectedCheckoutPaise } = input;
  if (proofAmountPaise <= 0 || expectedCheckoutPaise <= 0) return null;

  const rentPlusExpected = rentDuePaise + expectedCheckoutPaise;
  if (Math.abs(proofAmountPaise - rentPlusExpected) <= 100) {
    return `Stored proof amount matches rent + expected checkout (₹${(rentDuePaise / 100).toFixed(0)} + ₹${(expectedCheckoutPaise / 100).toFixed(0)}). Rent was likely double-counted at submit — use the screenshot amount in allocation.`;
  }

  const excess = proofAmountPaise - expectedCheckoutPaise;
  if (excess > 100 && Math.abs(excess - rentDuePaise) <= 100) {
    return `Stored proof amount is expected checkout plus rent again. Enter the screenshot amount under allocation before approving.`;
  }

  return null;
}
