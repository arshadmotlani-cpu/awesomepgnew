import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

function reviewTimestamp(item: PendingPaymentReviewItem): number {
  if (!item.proofSubmittedAt) return 0;
  const parsed = Date.parse(item.proofSubmittedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isNewerReview(
  candidate: PendingPaymentReviewItem,
  existing: PendingPaymentReviewItem,
): boolean {
  const candidateTs = reviewTimestamp(candidate);
  const existingTs = reviewTimestamp(existing);
  if (candidateTs !== existingTs) return candidateTs > existingTs;
  return candidate.key.localeCompare(existing.key) > 0;
}

/** One actionable approval per domain entity (and per booking checkout). */
export function dedupePendingPaymentReviews(
  items: PendingPaymentReviewItem[],
): PendingPaymentReviewItem[] {
  const byEntity = new Map<string, PendingPaymentReviewItem>();

  for (const item of items) {
    const entityKey = `${item.kind}:${item.entityId}`;
    const existing = byEntity.get(entityKey);
    if (!existing || isNewerReview(item, existing)) {
      byEntity.set(entityKey, item);
    }
  }

  const deduped = [...byEntity.values()];
  const byBookingCheckout = new Map<string, PendingPaymentReviewItem>();
  const rest: PendingPaymentReviewItem[] = [];

  for (const item of deduped) {
    if (item.kind === 'qr' && item.bookingId) {
      const existing = byBookingCheckout.get(item.bookingId);
      if (!existing || isNewerReview(item, existing)) {
        byBookingCheckout.set(item.bookingId, item);
      }
      continue;
    }
    rest.push(item);
  }

  return [...rest, ...byBookingCheckout.values()].sort(
    (a, b) => reviewTimestamp(a) - reviewTimestamp(b),
  );
}
