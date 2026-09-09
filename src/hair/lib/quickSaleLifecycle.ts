import type { BasketFlags, BasketLine, PaymentEntry } from '@/src/hair/domain/basket/types';
import type { QuickSaleSessionSnapshot, QuickSaleTab } from '@/src/hair/lib/quickSaleSession';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';

export type QuickSaleSessionLifecycle = 'active_draft' | 'checkout_pending';

/** Only active drafts may be restored on Quick Sale open (not completed or mid-checkout markers). */
export function isRestorableQuickSaleSession(
  snapshot: QuickSaleSessionSnapshot | null | undefined,
): boolean {
  if (!snapshot?.customer?.id) return false;
  return snapshot.lifecycle === 'active_draft';
}

export function normalizeRestoredQuickSaleSession(
  snapshot: QuickSaleSessionSnapshot,
): QuickSaleSessionSnapshot {
  if (snapshot.lifecycle === 'checkout_pending') {
    return { ...snapshot, lifecycle: 'active_draft' };
  }
  return snapshot;
}

export type QuickSaleDraftSessionInput = {
  customer: PosCustomerHit;
  appointmentId: string | null;
  tab: QuickSaleTab;
  catalogQ: string;
  lines: BasketLine[];
  payments: PaymentEntry[];
  flags: BasketFlags;
  holdInvoiceId: string | null;
  staffNames: Record<string, string>;
  lifecycle?: QuickSaleSessionLifecycle;
};

export function buildQuickSaleSessionSnapshot(
  input: QuickSaleDraftSessionInput,
): QuickSaleSessionSnapshot {
  return {
    v: 2,
    lifecycle: input.lifecycle ?? 'active_draft',
    customer: input.customer,
    appointmentId: input.appointmentId,
    tab: input.tab,
    catalogQ: input.catalogQ,
    lines: input.lines,
    payments: input.payments,
    flags: input.flags,
    holdInvoiceId: input.holdInvoiceId,
    staffNames: input.staffNames,
  };
}

/** Transaction fields cleared after successful checkout (customer may remain for success dialog). */
export function emptyQuickSaleTransactionState(): {
  lines: BasketLine[];
  payments: PaymentEntry[];
  flags: BasketFlags;
  holdInvoiceId: null;
  staffNames: Record<string, string>;
  catalogQ: string;
  tab: QuickSaleTab;
  membershipDiscountPaise: number;
} {
  return {
    lines: [],
    payments: [],
    flags: {},
    holdInvoiceId: null,
    staffNames: {},
    catalogQ: '',
    tab: 'service',
    membershipDiscountPaise: 0,
  };
}

export const QUICK_SALE_CHECKOUT_AMBIGUOUS_ERROR =
  'Checkout did not complete. Verify Billing before retrying.';

export const QUICK_SALE_CHECKOUT_INTERRUPTED_ERROR =
  'A previous checkout may not have finished. Verify Billing before retrying.';
