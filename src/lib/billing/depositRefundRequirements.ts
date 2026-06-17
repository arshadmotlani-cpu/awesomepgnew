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

export function validateDepositRefundSubmission(
  fields: DepositRefundSubmissionFields,
): DepositRefundValidationResult {
  const missing: string[] = [];

  if (!hasMeterEvidence(fields)) {
    missing.push('meter_reading_photo_or_average_fallback');
  }
  if (!hasPayoutMethod(fields)) {
    missing.push('payout_upi_or_qr');
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error:
        'Deposit refund requires a final electricity meter photo (or average billing fallback) and a UPI ID or QR code for payout.',
      missing,
    };
  }

  return { ok: true };
}

export const DEPOSIT_REFUND_MISSING_DETAILS_MESSAGE =
  'Your deposit refund cannot be processed right now because required details are missing. ' +
  'Please submit the refund request again with: (1) final electricity meter reading photo ' +
  'OR average billing fallback, and (2) your UPI ID OR QR code for refund transfer.';
