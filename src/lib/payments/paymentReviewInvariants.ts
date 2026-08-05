/**
 * Payment Review invariants — a pending Operations review must never exist
 * unless structural facts are real (resident, invoice, payable amount,
 * uploaded screenshot, valid billing month).
 *
 * Reviews are derived from proof URLs on invoices; there is no separate
 * review table. Rejecting proof attach = never creating a pending review.
 */

import { isDataProofUrl } from '@/src/lib/payments/proofResponse';
import { isPrivateBlobUrl } from '@/src/lib/storage/blob';

export type PaymentReviewKind = 'rent' | 'electricity' | 'extension' | 'deposit_link' | 'qr';

export type PaymentReviewInvariantCode =
  | 'MISSING_RESIDENT'
  | 'MISSING_INVOICE'
  | 'MISSING_BOOKING'
  | 'INVALID_BILLING_MONTH'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_MISMATCH'
  | 'MISSING_SCREENSHOT'
  | 'INVALID_SCREENSHOT'
  | 'NOT_AWAITING_PAYMENT'
  | 'DUPLICATE_SCREENSHOT'
  | 'ORPHAN_PROOF';

export type PaymentReviewInvariantViolation = {
  code: PaymentReviewInvariantCode;
  message: string;
  field?: string;
};

export type PaymentReviewInvariantInput = {
  kind: PaymentReviewKind;
  invoiceId: string | null | undefined;
  customerId: string | null | undefined;
  bookingId?: string | null | undefined;
  billingMonth: string | null | undefined;
  /** Invoice due / expected amount in paise. */
  expectedAmountPaise: number | null | undefined;
  /** Frozen proof snapshot amount when present. */
  proofAmountPaise?: number | null | undefined;
  paymentProofUrl: string | null | undefined;
  status?: string | null | undefined;
  /** Booking lifecycle status — cancelled bookings cannot host a live review. */
  bookingStatus?: string | null | undefined;
  /**
   * When true, another pending same-PG review already uses this screenshot URL.
   * Callers resolve this via `hasDuplicatePendingPaymentProofUrl` (or equivalent).
   */
  duplicatePendingScreenshot?: boolean;
  /** When true, status must be in awaiting set. */
  requireAwaitingStatus?: boolean;
  now?: Date;
};

export type PaymentReviewInvariantResult =
  | { ok: true }
  | { ok: false; violations: PaymentReviewInvariantViolation[] };

/** Sentinel / test years used by verification scripts (e.g. 2099). */
export const PAYMENT_REVIEW_SENTINEL_YEAR_MIN = 2090;

const AWAITING_STATUSES = new Set([
  'pending',
  'overdue',
  'payment_in_progress',
  'active', // deposit links
]);

const CANCELLED_BOOKING_STATUSES = new Set([
  'cancelled',
  'canceled',
  'expired',
  'rejected',
]);

const TERMINAL_INVOICE_STATUSES = new Set([
  'paid',
  'cancelled',
  'canceled',
  'void',
  'refunded',
  'waived',
]);

function parseBillingMonthYear(billingMonth: string): number | null {
  const trimmed = billingMonth.trim();
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(trimmed);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return year;
}

/**
 * Billing month must be a real calendar month near "now".
 * Rejects far-future sentinels (2099) and unparseable values.
 */
export function isValidPaymentReviewBillingMonth(
  billingMonth: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!billingMonth?.trim()) return false;
  const year = parseBillingMonthYear(billingMonth);
  if (year == null) return false;
  if (year >= PAYMENT_REVIEW_SENTINEL_YEAR_MIN) return false;
  const currentYear = now.getUTCFullYear();
  if (year < currentYear - 2 || year > currentYear + 1) return false;
  return true;
}

/**
 * Screenshot must be a completed private Blob upload or inline data URL.
 * Placeholder hosts (example.com) and empty values fail.
 */
export function isValidPaymentReviewScreenshotUrl(
  paymentProofUrl: string | null | undefined,
): boolean {
  const trimmed = paymentProofUrl?.trim();
  if (!trimmed) return false;
  if (isDataProofUrl(trimmed)) {
    const comma = trimmed.indexOf(',');
    return comma > 5 && trimmed.length > comma + 1;
  }
  if (isPrivateBlobUrl(trimmed)) return true;
  return false;
}

export function evaluatePaymentReviewInvariants(
  input: PaymentReviewInvariantInput,
): PaymentReviewInvariantResult {
  const violations: PaymentReviewInvariantViolation[] = [];
  const now = input.now ?? new Date();

  if (!input.invoiceId?.trim()) {
    violations.push({
      code: 'MISSING_INVOICE',
      message: 'Payment review requires a valid invoice id.',
      field: 'invoiceId',
    });
  }

  if (!input.customerId?.trim()) {
    violations.push({
      code: 'MISSING_RESIDENT',
      message: 'Payment review requires a valid resident (customer).',
      field: 'customerId',
    });
  }

  if (input.kind === 'rent' || input.kind === 'electricity' || input.kind === 'extension') {
    if (!input.bookingId?.trim()) {
      violations.push({
        code: 'MISSING_BOOKING',
        message: 'Payment review requires a valid booking.',
        field: 'bookingId',
      });
    }
  }

  if (input.bookingStatus?.trim()) {
    const bookingStatus = input.bookingStatus.trim().toLowerCase();
    if (CANCELLED_BOOKING_STATUSES.has(bookingStatus)) {
      violations.push({
        code: 'ORPHAN_PROOF',
        message: `Proof URL is set on a ${bookingStatus} booking — not a live payment review.`,
        field: 'bookingStatus',
      });
    }
  }

  const requiresBillingMonth =
    input.kind === 'rent' || input.kind === 'electricity' || input.billingMonth != null;
  if (requiresBillingMonth && !isValidPaymentReviewBillingMonth(input.billingMonth, now)) {
    violations.push({
      code: 'INVALID_BILLING_MONTH',
      message: `Billing month is invalid or sentinel: ${input.billingMonth ?? 'null'}`,
      field: 'billingMonth',
    });
  }

  const expected = input.expectedAmountPaise;
  if (expected == null || !Number.isFinite(expected) || expected <= 0) {
    violations.push({
      code: 'INVALID_AMOUNT',
      message: 'Expected amount must be a positive paise value.',
      field: 'expectedAmountPaise',
    });
  }

  const proofAmount = input.proofAmountPaise;
  if (
    proofAmount != null &&
    expected != null &&
    Number.isFinite(proofAmount) &&
    Number.isFinite(expected) &&
    proofAmount !== expected
  ) {
    violations.push({
      code: 'AMOUNT_MISMATCH',
      message: `Proof amount ${proofAmount} does not match expected ${expected}.`,
      field: 'proofAmountPaise',
    });
  }

  if (!input.paymentProofUrl?.trim()) {
    violations.push({
      code: 'MISSING_SCREENSHOT',
      message: 'Payment review requires an uploaded screenshot.',
      field: 'paymentProofUrl',
    });
  } else if (!isValidPaymentReviewScreenshotUrl(input.paymentProofUrl)) {
    violations.push({
      code: 'INVALID_SCREENSHOT',
      message:
        'Screenshot URL is not a completed private Blob upload (placeholder/unreachable URLs are rejected).',
      field: 'paymentProofUrl',
    });
  }

  if (input.duplicatePendingScreenshot) {
    violations.push({
      code: 'DUPLICATE_SCREENSHOT',
      message:
        'Screenshot URL is already attached to another pending payment review in this PG.',
      field: 'paymentProofUrl',
    });
  }

  if (input.status) {
    const status = input.status.trim().toLowerCase();
    if (TERMINAL_INVOICE_STATUSES.has(status) && input.paymentProofUrl?.trim()) {
      violations.push({
        code: 'ORPHAN_PROOF',
        message: `Proof URL remains on terminal status ${input.status} — not awaiting review.`,
        field: 'status',
      });
    } else if (input.requireAwaitingStatus !== false && !AWAITING_STATUSES.has(status)) {
      violations.push({
        code: 'NOT_AWAITING_PAYMENT',
        message: `Invoice status ${input.status} is not awaiting payment review.`,
        field: 'status',
      });
    }
  }

  if (violations.length > 0) return { ok: false, violations };
  return { ok: true };
}

export function paymentReviewInvariantErrorMessage(
  result: Extract<PaymentReviewInvariantResult, { ok: false }>,
): string {
  return result.violations.map((v) => v.message).join(' ');
}
