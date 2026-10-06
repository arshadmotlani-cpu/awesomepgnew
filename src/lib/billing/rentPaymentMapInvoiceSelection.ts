/**
 * Rent Payment Map — which rent invoice row to attach per booking/month.
 * Uses projectInvoice (canonical) for pick priority; never payment created_at.
 */

import type { RentInvoiceProjectInput } from '@/src/lib/billing/rentInvoiceProjectInput';
import { projectInvoice } from '@/src/services/rentInvoices';

/** DB statuses loaded for map classification (includes fully paid). */
export const RENT_PAYMENT_MAP_RENT_INVOICE_DB_STATUSES = [
  'pending',
  'overdue',
  'payment_in_progress',
  'paid',
] as const;

/**
 * Pick the single invoice that drives map status for a billing month.
 * Open / in-review invoices win over paid when both exist (data anomaly visibility).
 * Otherwise a paid October invoice yields PAID on the map.
 */
export function pickRentInvoiceForPaymentMap(
  candidates: RentInvoiceProjectInput[],
): RentInvoiceProjectInput | undefined {
  if (candidates.length === 0) return undefined;

  let paidBest: RentInvoiceProjectInput | undefined;
  let openBest: { input: RentInvoiceProjectInput; score: number } | undefined;

  for (const input of candidates) {
    const projected = projectInvoice(input);
    if (
      projected.effectiveStatus === 'cancelled' ||
      projected.effectiveStatus === 'expired'
    ) {
      continue;
    }

    if (
      projected.effectiveStatus === 'paid' ||
      (projected.outstandingPaise <= 0 &&
        projected.effectiveStatus !== 'payment_in_progress')
    ) {
      if (!paidBest) paidBest = input;
      continue;
    }

    const score =
      projected.effectiveStatus === 'payment_in_progress'
        ? 1_000_000_000 + projected.outstandingPaise
        : projected.outstandingPaise;
    if (!openBest || score > openBest.score) {
      openBest = { input, score };
    }
  }

  return openBest?.input ?? paidBest;
}
