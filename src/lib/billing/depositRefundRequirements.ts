/**
 * Deposit refund submission requirements — meter proof + payout method.
 */

export type DepositRefundSubmissionFields = {
  meterReadingPhotoUrl?: string | null;
  useAverageBillingFallback?: boolean;
  payoutUpiId?: string | null;
  payoutQrUrl?: string | null;
};

export type DepositRefundValidationResult =
  | { ok: true }
  | { ok: false; error: string; missing: string[] };

export function hasMeterEvidence(fields: DepositRefundSubmissionFields): boolean {
  return Boolean(fields.useAverageBillingFallback || fields.meterReadingPhotoUrl?.trim());
}

export function hasPayoutMethod(fields: DepositRefundSubmissionFields): boolean {
  const upi = fields.payoutUpiId?.trim();
  const qr = fields.payoutQrUrl?.trim();
  return Boolean(upi || qr);
}

/** When final refund is zero, payout details are not required. */
export function checkoutRequiresPayout(expectedRefundPaise: number): boolean {
  return expectedRefundPaise > 0;
}

export function validateDepositRefundSubmission(
  fields: DepositRefundSubmissionFields,
  options?: { expectedRefundPaise?: number },
): DepositRefundValidationResult {
  const missing: string[] = [];
  const needsPayout = checkoutRequiresPayout(options?.expectedRefundPaise ?? 1);

  if (!hasMeterEvidence(fields)) {
    missing.push('meter_reading_photo_or_average_fallback');
  }
  if (needsPayout && !hasPayoutMethod(fields)) {
    missing.push('payout_upi_or_qr');
  }

  if (missing.length > 0) {
    const payoutHint = needsPayout
      ? ' and a UPI ID or QR code for payout'
      : '';
    return {
      ok: false,
      error:
        `Deposit refund requires a final electricity meter photo (or average billing fallback)${payoutHint}.`,
      missing,
    };
  }

  return { ok: true };
}

export const DEPOSIT_REFUND_MISSING_DETAILS_MESSAGE =
  'Your deposit refund cannot be processed right now because required details are missing. ' +
  'Please submit the refund request again with: (1) final electricity meter reading photo ' +
  'OR average billing fallback, and (2) your UPI ID OR QR code for refund transfer.';
