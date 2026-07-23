/**
 * Deposit refund submission requirements — meter proof + payout method.
 */

export const DEPOSIT_REFUND_MISSING_DETAILS_MESSAGE =
  'Upload your final AC meter photo and a UPI ID or QR code for payout before submitting.';

export type DepositRefundSubmissionFields = {
  meterReadingPhotoUrl?: string | null;
  payoutUpiId?: string | null;
  payoutQrUrl?: string | null;
};

export type DepositRefundValidationResult =
  | { ok: true }
  | { ok: false; error: string; missing: string[] };

export function hasMeterEvidence(fields: DepositRefundSubmissionFields): boolean {
  return Boolean(fields.meterReadingPhotoUrl?.trim());
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
    missing.push('meter_reading_photo');
  }
  if (needsPayout && !hasPayoutMethod(fields)) {
    missing.push('payout_upi_or_qr');
  }

  if (missing.length > 0) {
    const payoutHint = needsPayout ? ' and a UPI ID or QR code for payout' : '';
    return {
      ok: false,
      error: `Upload your final AC meter photo${payoutHint} before submitting.`,
      missing,
    };
  }

  return { ok: true };
}
