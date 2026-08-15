/**
 * Deposit refund submission requirements — meter proof + payout QR image.
 */

export const DEPOSIT_REFUND_MISSING_DETAILS_MESSAGE =
  'Please upload your meter photo and QR image to continue.';

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

/** Refund payout requires QR image upload (UPI ID text is no longer accepted). */
export function hasPayoutQr(fields: DepositRefundSubmissionFields): boolean {
  return Boolean(fields.payoutQrUrl?.trim());
}

/** @deprecated Use hasPayoutQr — UPI ID alone is no longer accepted. */
export function hasPayoutMethod(fields: DepositRefundSubmissionFields): boolean {
  return hasPayoutQr(fields);
}

/** When final refund is zero, payout QR is not required. */
export function checkoutRequiresPayout(expectedRefundPaise: number): boolean {
  return expectedRefundPaise > 0;
}

export function getDepositRefundValidationMessage(
  fields: DepositRefundSubmissionFields,
  options?: { expectedRefundPaise?: number },
): string | null {
  const needsPayout = checkoutRequiresPayout(options?.expectedRefundPaise ?? 1);
  const hasMeter = hasMeterEvidence(fields);
  const hasQr = hasPayoutQr(fields);

  if (!hasMeter && needsPayout && !hasQr) {
    return 'Please upload your meter photo and QR image to continue.';
  }
  if (!hasMeter) {
    return 'Meter photo is required.';
  }
  if (needsPayout && !hasQr) {
    return 'QR image is required.';
  }
  return null;
}

export function validateDepositRefundSubmission(
  fields: DepositRefundSubmissionFields,
  options?: { expectedRefundPaise?: number },
): DepositRefundValidationResult {
  const needsPayout = checkoutRequiresPayout(options?.expectedRefundPaise ?? 1);
  const missing: string[] = [];

  if (!hasMeterEvidence(fields)) {
    missing.push('meter_reading_photo');
  }
  if (needsPayout && !hasPayoutQr(fields)) {
    missing.push('payout_qr');
  }

  const error = getDepositRefundValidationMessage(fields, options);
  if (error) {
    return { ok: false, error, missing };
  }

  return { ok: true };
}
