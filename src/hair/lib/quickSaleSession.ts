import type { BasketFlags, BasketLine, PaymentEntry } from '@/src/hair/domain/basket/types';
import type { BillableItemType } from '@/src/hair/domain/catalog/types';
import {
  buildQuickSaleSessionSnapshot,
  isRestorableQuickSaleSession,
  normalizeRestoredQuickSaleSession,
  type QuickSaleSessionLifecycle,
} from '@/src/hair/lib/quickSaleLifecycle';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';

/** sessionStorage — tab-scoped active draft */
export const SESSION_DRAFT_KEY = 'fyh-quick-sale-session-v1';
/** localStorage — survives tab close for interrupted checkout recovery */
export const LOCAL_PENDING_KEY = 'fyh-quick-sale-checkout-pending-v1';
/** legacy localStorage key from previous implementation */
const LEGACY_LOCAL_KEY = 'fyh-quick-sale-session-v1';

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

function isCheckoutPendingSnapshot(
  snapshot: QuickSaleSessionSnapshot | null,
): snapshot is QuickSaleSessionSnapshot {
  return Boolean(snapshot?.customer?.id && snapshot.lifecycle === 'checkout_pending');
}

function isActiveDraftSnapshot(
  snapshot: QuickSaleSessionSnapshot | null,
): snapshot is QuickSaleSessionSnapshot {
  return Boolean(snapshot?.customer?.id && snapshot.lifecycle === 'active_draft');
}

function safeGetItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // quota / private mode — non-fatal
  }
}

function safeRemoveItem(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Remove legacy localStorage active drafts (never restore).
 * Migrate legacy checkout_pending to LOCAL_PENDING_KEY.
 */
export function purgeLegacyLocalActiveDraft(): void {
  if (typeof window === 'undefined') return;
  const raw = safeGetItem(window.localStorage, LEGACY_LOCAL_KEY);
  if (!raw) return;
  try {
    const parsed = parseStoredSession(raw);
    if (!parsed) {
      safeRemoveItem(window.localStorage, LEGACY_LOCAL_KEY);
      return;
    }
    if (parsed.lifecycle === 'checkout_pending') {
      safeSetItem(
        window.localStorage,
        LOCAL_PENDING_KEY,
        JSON.stringify({ ...parsed, lifecycle: 'checkout_pending' }),
      );
    }
    // active_draft (v1 or v2) — discard silently
    safeRemoveItem(window.localStorage, LEGACY_LOCAL_KEY);
  } catch {
    safeRemoveItem(window.localStorage, LEGACY_LOCAL_KEY);
  }
}

export function loadCheckoutPending(): LoadedQuickSaleSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = safeGetItem(window.localStorage, LOCAL_PENDING_KEY);
    if (!raw) return null;
    const parsed = parseStoredSession(raw);
    if (!parsed || !isCheckoutPendingSnapshot(parsed)) return null;
    const snapshot = normalizeRestoredQuickSaleSession(parsed);
    return { snapshot, interruptedCheckout: true };
  } catch {
    return null;
  }
}

export function loadSessionDraft(): LoadedQuickSaleSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = safeGetItem(window.sessionStorage, SESSION_DRAFT_KEY);
    if (!raw) return null;
    const parsed = parseStoredSession(raw);
    if (!parsed || !isActiveDraftSnapshot(parsed)) return null;
    if (!isRestorableQuickSaleSession(parsed)) return null;
    const snapshot = normalizeRestoredQuickSaleSession(parsed);
    return { snapshot, interruptedCheckout: false };
  } catch {
    return null;
  }
}

/** Mount order: checkout_pending (localStorage) then active_draft (sessionStorage). */
export function loadQuickSaleSession(): LoadedQuickSaleSession | null {
  return loadCheckoutPending() ?? loadSessionDraft();
}

export function saveSessionDraft(snapshot: QuickSaleSessionSnapshot): void {
  if (typeof window === 'undefined') return;
  if (!isRestorableQuickSaleSession(snapshot)) return;
  safeSetItem(window.sessionStorage, SESSION_DRAFT_KEY, JSON.stringify(snapshot));
}

export function saveCheckoutPending(snapshot: QuickSaleSessionSnapshot): void {
  if (typeof window === 'undefined') return;
  if (snapshot.lifecycle !== 'checkout_pending') return;
  safeSetItem(
    window.localStorage,
    LOCAL_PENDING_KEY,
    JSON.stringify({ ...snapshot, lifecycle: 'checkout_pending' }),
  );
}

/** @deprecated Use saveSessionDraft or saveCheckoutPending */
export function saveQuickSaleSession(snapshot: QuickSaleSessionSnapshot): void {
  if (snapshot.lifecycle === 'checkout_pending') {
    saveCheckoutPending(snapshot);
  } else if (isRestorableQuickSaleSession(snapshot)) {
    saveSessionDraft(snapshot);
  }
}

export function markQuickSaleCheckoutPending(snapshot: QuickSaleSessionSnapshot): void {
  saveCheckoutPending({ ...snapshot, lifecycle: 'checkout_pending' });
}

/** Synchronous checkout-failure path: remove pending, persist tab-scoped draft. */
export function revertCheckoutPendingToSessionDraft(snapshot: QuickSaleSessionSnapshot): void {
  clearCheckoutPending();
  saveSessionDraft({ ...snapshot, lifecycle: 'active_draft' });
}

export function clearSessionDraft(): void {
  if (typeof window === 'undefined') return;
  safeRemoveItem(window.sessionStorage, SESSION_DRAFT_KEY);
}

export function clearCheckoutPending(): void {
  if (typeof window === 'undefined') return;
  safeRemoveItem(window.localStorage, LOCAL_PENDING_KEY);
  safeRemoveItem(window.localStorage, LEGACY_LOCAL_KEY);
}

export function clearQuickSaleSession(): void {
  clearSessionDraft();
  clearCheckoutPending();
}

export { buildQuickSaleSessionSnapshot, isRestorableQuickSaleSession };
