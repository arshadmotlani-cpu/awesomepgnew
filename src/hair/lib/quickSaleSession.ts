import type { BasketFlags, BasketLine, PaymentEntry } from '@/src/hair/domain/basket/types';
import type { BillableItemType } from '@/src/hair/domain/catalog/types';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';

const STORAGE_KEY = 'fyh-quick-sale-session-v1';

export type QuickSaleTab = BillableItemType | 'all';

export type QuickSaleSessionSnapshot = {
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

export function loadQuickSaleSession(): QuickSaleSessionSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuickSaleSessionSnapshot;
    if (parsed?.v !== 1 || !parsed.customer?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveQuickSaleSession(snapshot: QuickSaleSessionSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // quota / private mode — non-fatal
  }
}

export function clearQuickSaleSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
