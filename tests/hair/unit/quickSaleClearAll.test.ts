import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { Basket, BasketLine, PaymentEntry } from '@/src/hair/domain/basket/types';
import {
  buildClearedQuickSaleDraftForCustomer,
  buildQuickSaleSessionSnapshot,
  emptyQuickSaleTransactionState,
  hasQuickSaleTransactionContent,
} from '@/src/hair/lib/quickSaleLifecycle';
import {
  loadSessionDraft,
  LOCAL_PENDING_KEY,
  saveSessionDraft,
  SESSION_DRAFT_KEY,
  type QuickSaleSessionSnapshot,
} from '@/src/hair/lib/quickSaleSession';

const root = process.cwd();
function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const sampleCustomer = {
  id: 'c1',
  fullName: 'Jane',
  customerCode: 'FYH001',
  phone: '9876543210',
  walletBalancePaise: 50_000,
};

const sampleLine: BasketLine = {
  lineId: 'l1',
  billableRef: { id: 's1', type: 'service' },
  snapshot: {
    name: 'Premium Trim',
    code: 'TRIM',
    unitSellingPricePaise: 100_000,
    gstBps: 1800,
    staffMode: 'SERVICE',
    category: null,
  },
  quantity: 2,
  overridePricePaise: 180_000,
  staff: [{ staffId: 'st1', shareBps: 10_000 }],
};

const samplePayments: PaymentEntry[] = [
  { id: 'p1', method: 'upi', amountPaise: 100_000 },
  { id: 'p2', method: 'cash', amountPaise: 50_000 },
];

function activeBasket(): Basket {
  return {
    customerId: sampleCustomer.id,
    lines: [sampleLine],
    payments: samplePayments,
    flags: { markDue: true },
    membershipDiscountPaise: 5_000,
  };
}

test('1–8 clear-all draft removes items, staff, discounts, payments, and zeroes totals', () => {
  const before = activeBasket();
  const pricedBefore = priceBasket(before);
  assert.ok(pricedBefore.totals.grandTotalPaise > 0);
  assert.ok(pricedBefore.totals.taxPaise > 0);
  assert.ok(pricedBefore.totals.subtotalBasePaise > 0);
  assert.equal(before.lines[0]!.quantity, 2);
  assert.equal(before.lines[0]!.staff.length, 1);
  assert.ok(before.lines[0]!.overridePricePaise != null);
  assert.equal(before.payments.length, 2);

  const cleared = buildClearedQuickSaleDraftForCustomer(sampleCustomer);
  assert.deepEqual(cleared.lines, []);
  assert.deepEqual(cleared.payments, []);
  assert.deepEqual(cleared.flags, {});
  assert.deepEqual(cleared.staffNames, {});
  assert.equal(cleared.holdInvoiceId, null);

  const pricedAfter = priceBasket({
    customerId: sampleCustomer.id,
    lines: cleared.lines,
    payments: cleared.payments,
    flags: cleared.flags,
    membershipDiscountPaise: 0,
  });
  assert.equal(pricedAfter.totals.grandTotalPaise, 0);
  assert.equal(pricedAfter.totals.taxPaise, 0);
  assert.equal(pricedAfter.totals.subtotalBasePaise, 0);

  const paidPaise = cleared.payments.reduce((s, p) => s + p.amountPaise, 0);
  const remainingPaise = Math.max(0, pricedAfter.totals.grandTotalPaise - paidPaise);
  assert.equal(paidPaise, 0);
  assert.equal(remainingPaise, 0);
});

test('9–10 clear all preserves customer and does not touch customer profile fields', () => {
  const cleared = buildClearedQuickSaleDraftForCustomer(sampleCustomer);
  assert.deepEqual(cleared.customer, sampleCustomer);
  assert.equal(cleared.customer.walletBalancePaise, 50_000);
  assert.equal(cleared.customer.id, 'c1');
});

test('hasQuickSaleTransactionContent detects active vs empty sale', () => {
  assert.equal(
    hasQuickSaleTransactionContent({ lines: [], payments: [], holdInvoiceId: null }),
    false,
  );
  assert.equal(
    hasQuickSaleTransactionContent({ lines: [sampleLine], payments: [], holdInvoiceId: null }),
    true,
  );
  assert.equal(
    hasQuickSaleTransactionContent({ lines: [], payments: samplePayments, holdInvoiceId: null }),
    true,
  );
  assert.equal(
    hasQuickSaleTransactionContent({ lines: [], payments: [], holdInvoiceId: 'hold-1' }),
    true,
  );
});

test('11–13 shell requires confirmation, keep sale, and disables clear while processing', () => {
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  assert.match(shell, /QuickSaleClearAllConfirm/);
  assert.match(shell, /setClearAllConfirmOpen\(true\)/);
  assert.match(shell, /onKeep=\{\(\) => setClearAllConfirmOpen\(false\)\}/);
  assert.match(shell, /disabled=\{workspaceLocked\}/);
  assert.match(shell, /data-testid="qs-clear-all-trigger"/);
  assert.match(shell, /hasActiveTransaction \?/);
  assert.match(shell, /QuickSaleCheckoutProcessing/);
  assert.match(shell, /saveSessionDraft\(buildClearedQuickSaleDraftForCustomer/);
  assert.match(shell, /clearCheckoutPending/);
  const overlay = readSrc('src/hair/components/quick-sale/QuickSaleProcessingOverlay.tsx');
  assert.match(overlay, /qs-interaction-shield/);

  const confirm = readSrc('src/hair/components/quick-sale/QuickSaleClearAllConfirm.tsx');
  assert.match(confirm, /Clear this sale\?/);
  assert.match(confirm, /remove all items and payment entries/);
  assert.match(confirm, /Keep sale/);
  assert.match(confirm, /Clear all/);
});

test('14 cleared draft persists to sessionStorage only and cannot resurrect old basket', () => {
  const localStore = new Map<string, string>();
  const sessionStore = new Map<string, string>();
  const g = globalThis as typeof globalThis & { window?: Window };
  g.window = {
    localStorage: {
      getItem: (k: string) => localStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        localStore.set(k, v);
      },
      removeItem: (k: string) => {
        localStore.delete(k);
      },
    },
    sessionStorage: {
      getItem: (k: string) => sessionStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        sessionStore.set(k, v);
      },
      removeItem: (k: string) => {
        sessionStore.delete(k);
      },
    },
  } as Window;

  const dirty: QuickSaleSessionSnapshot = buildQuickSaleSessionSnapshot({
    customer: sampleCustomer,
    appointmentId: 'appt-1',
    tab: 'service',
    catalogQ: 'trim',
    lines: [sampleLine],
    payments: samplePayments,
    flags: { markDue: true },
    holdInvoiceId: 'hold-1',
    staffNames: { st1: 'Rahul' },
    lifecycle: 'active_draft',
  });
  saveSessionDraft(dirty);
  assert.ok(sessionStore.has(SESSION_DRAFT_KEY));
  assert.equal(localStore.has(SESSION_DRAFT_KEY), false);

  saveSessionDraft(buildClearedQuickSaleDraftForCustomer(sampleCustomer));
  const loaded = loadSessionDraft();
  assert.ok(loaded);
  assert.equal(loaded.snapshot.lines.length, 0);
  assert.equal(loaded.snapshot.payments.length, 0);
  assert.equal(loaded.snapshot.holdInvoiceId, null);
  assert.deepEqual(loaded.snapshot.customer, sampleCustomer);
  assert.equal(loaded.interruptedCheckout, false);
  assert.equal(localStore.has(LOCAL_PENDING_KEY), false);

  delete g.window;
});

test('15 empty transaction state matches cleared draft shape for re-render safety', () => {
  const empty = emptyQuickSaleTransactionState();
  const cleared = buildClearedQuickSaleDraftForCustomer(sampleCustomer);
  assert.deepEqual(cleared.lines, empty.lines);
  assert.deepEqual(cleared.payments, empty.payments);
  assert.deepEqual(cleared.flags, empty.flags);
  assert.deepEqual(cleared.staffNames, empty.staffNames);
  assert.equal(cleared.holdInvoiceId, empty.holdInvoiceId);
});
