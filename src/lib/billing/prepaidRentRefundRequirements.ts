/**
 * Payout evidence for prepaid-rent / mid-stay excess refunds (QR image only).
 */

export function validatePayoutQrRefundSubmission(fields: {
  payoutQrUrl?: string | null;
}): { ok: true } | { ok: false; error: string } {
  if (!fields.payoutQrUrl?.trim()) {
    return { ok: false, error: 'QR image is required for refund payout.' };
  }
  return { ok: true };
}
