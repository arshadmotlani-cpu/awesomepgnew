import type { BasketFlags, BasketLine, PaymentEntry } from '@/src/hair/domain/basket/types';
import type { BillableItemType } from '@/src/hair/domain/catalog/types';
import {
  buildQuickSaleSessionSnapshot,
  isRestorableQuickSaleSession,
  normalizeRestoredQuickSaleSession,
  type QuickSaleSessionLifecycle,
} from '@/src/hair/lib/quickSaleLifecycle';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';

const STORAGE_KEY = 'fyh-quick-sale-session-v1';

export type QuickSaleTab = BillableItemType | 'all';

type QuickSaleSessionSnapshotV1 = {
  v: 1;
  customer: PosCustomerHit;
  appointmentId: string | null;
  tab: QuickSaleTab;
  catalogQ: string;
  lines: BasketLine[];
  payments: PaymentEntry[];
  flags: BasketFlags;
  holdInvoiceId: string | null;
  staffNames: Record<string, string>;
};

export type QuickSaleSessionSnapshot = {
  v: 2;
  lifecycle: QuickSaleSessionLifecycle;
  customer: PosCustomerHit;
  appointmentId: string | null;
  tab: QuickSaleTab;
  catalogQ: string;
  lines: BasketLine[];
  payments: PaymentEntry[];
  flags: BasketFlags;
  holdInvoiceId: string | null;
  staffNames: Record<string, string>;
};

function migrateV1ToV2(raw: QuickSaleSessionSnapshotV1): QuickSaleSessionSnapshot {
  return buildQuickSaleSessionSnapshot({
    customer: raw.customer,
    appointmentId: raw.appointmentId,
    tab: raw.tab,
    catalogQ: raw.catalogQ,
    lines: raw.lines,
    payments: raw.payments,
    flags: raw.flags,
    holdInvoiceId: raw.holdInvoiceId,
    staffNames: raw.staffNames ?? {},
    lifecycle: 'active_draft',
  });
}

function parseStoredSession(raw: string): QuickSaleSessionSnapshot | null {
  const parsed = JSON.parse(raw) as QuickSaleSessionSnapshot | QuickSaleSessionSnapshotV1;
  if (!parsed?.customer?.id) return null;
  if (parsed.v === 2 && parsed.lifecycle) {
    return parsed as QuickSaleSessionSnapshot;
  }
  if (parsed.v === 1) {
    return migrateV1ToV2(parsed as QuickSaleSessionSnapshotV1);
  }
  return null;
}

export type LoadedQuickSaleSession = {
  snapshot: QuickSaleSessionSnapshot;
  interruptedCheckout: boolean;
};

function isLoadableQuickSaleSession(
  snapshot: QuickSaleSessionSnapshot | null,
): snapshot is QuickSaleSessionSnapshot {
  if (!snapshot?.customer?.id) return false;
  return snapshot.lifecycle === 'active_draft' || snapshot.lifecycle === 'checkout_pending';
}

export function loadQuickSaleSession(): LoadedQuickSaleSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseStoredSession(raw);
    if (!parsed || !isLoadableQuickSaleSession(parsed)) return null;
    const interruptedCheckout = parsed.lifecycle === 'checkout_pending';
    const snapshot = normalizeRestoredQuickSaleSession(parsed);
    return { snapshot, interruptedCheckout };
  } catch {
    return null;
  }
}

export function saveQuickSaleSession(snapshot: QuickSaleSessionSnapshot): void {
  if (typeof window === 'undefined') return;
  if (!isRestorableQuickSaleSession(snapshot) && snapshot.lifecycle !== 'checkout_pending') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // quota / private mode — non-fatal
  }
}

export function markQuickSaleCheckoutPending(snapshot: QuickSaleSessionSnapshot): void {
  saveQuickSaleSession({ ...snapshot, lifecycle: 'checkout_pending' });
}

export function clearQuickSaleSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export { buildQuickSaleSessionSnapshot, isRestorableQuickSaleSession };
