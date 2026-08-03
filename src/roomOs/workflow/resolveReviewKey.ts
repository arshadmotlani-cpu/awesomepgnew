/**
 * Map payment review keys ↔ entity kind and id.
 */

import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import type { PaymentProofWorkflowContext } from '@/src/roomOs/workflow/types';

const REVIEW_KEY_PREFIX: Record<PendingPaymentReviewItem['kind'], string> = {
  qr: 'qr',
  rent: 'rent',
  electricity: 'elec',
  extension: 'ext',
  deposit_link: 'deposit-link',
};

export function buildPaymentProofReviewKey(
  kind: PendingPaymentReviewItem['kind'],
  entityId: string,
): string {
  return `${REVIEW_KEY_PREFIX[kind]}-${entityId}`;
}

export function parsePaymentProofReviewKey(reviewKey: string): PaymentProofWorkflowContext | null {
  const patterns: Array<{
    prefix: string;
    kind: PendingPaymentReviewItem['kind'];
  }> = [
    { prefix: 'deposit-link-', kind: 'deposit_link' },
    { prefix: 'qr-', kind: 'qr' },
    { prefix: 'rent-', kind: 'rent' },
    { prefix: 'elec-', kind: 'electricity' },
    { prefix: 'ext-', kind: 'extension' },
  ];

  for (const { prefix, kind } of patterns) {
    if (reviewKey.startsWith(prefix)) {
      const entityId = reviewKey.slice(prefix.length);
      if (!entityId) return null;
      return {
        reviewKey,
        entityKind: kind,
        entityId,
        bookingId: null,
        pgId: '',
      };
    }
  }

  return null;
}

export function withPaymentProofContext(
  base: PaymentProofWorkflowContext,
  input: { pgId: string; bookingId?: string | null },
): PaymentProofWorkflowContext {
  return {
    ...base,
    pgId: input.pgId,
    bookingId: input.bookingId ?? null,
  };
}
