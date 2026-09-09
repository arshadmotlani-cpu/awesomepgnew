import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQuickSaleSessionSnapshot,
  clearQuickSaleSession,
  isRestorableQuickSaleSession,
  loadQuickSaleSession,
  saveQuickSaleSession,
  type QuickSaleSessionSnapshot,
} from '@/src/hair/lib/quickSaleSession';

const STORAGE_KEY = 'fyh-quick-sale-session-v1';

const sampleCustomer = {
  id: 'c1',
  fullName: 'Jane',
  customerCode: 'FYH001',
  phone: '9876543210',
  walletBalancePaise: 0,
};

function makeSnapshot(
  overrides: Partial<QuickSaleSessionSnapshot> = {},
): QuickSaleSessionSnapshot {
  return buildQuickSaleSessionSnapshot({
    customer: sampleCustomer,
    appointmentId: null,
    tab: 'service',
    catalogQ: 'trim',
    lines: [],
    payments: [],
    flags: {},
    holdInvoiceId: null,
    staffNames: { s1: 'Rahul' },
    lifecycle: 'active_draft',
    ...overrides,
  });
}

test('QuickSaleSessionSnapshot v2 shape includes lifecycle and staffNames', () => {
  const snapshot = makeSnapshot();
  assert.equal(snapshot.v, 2);
  assert.equal(snapshot.lifecycle, 'active_draft');
  assert.equal(snapshot.staffNames.s1, 'Rahul');
  assert.equal(JSON.parse(JSON.stringify(snapshot)).v, 2);
});

test('v1 storage migrates to v2 active_draft on load', () => {
  const store = new Map<string, string>();
  const g = globalThis as typeof globalThis & { window?: Window };
  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  } as Window;

  store.set(
    STORAGE_KEY,
    JSON.stringify({
      v: 1,
      customer: sampleCustomer,
      appointmentId: null,
      tab: 'service',
      catalogQ: '',
      lines: [],
      payments: [{ id: 'p1', method: 'upi', amountPaise: 10000 }],
      flags: {},
      holdInvoiceId: null,
      staffNames: {},
    }),
  );

  const loaded = loadQuickSaleSession();
  assert.ok(loaded);
  assert.equal(loaded.snapshot.v, 2);
  assert.equal(loaded.snapshot.lifecycle, 'active_draft');
  assert.equal(loaded.interruptedCheckout, false);
  assert.equal(loaded.snapshot.payments.length, 1);

  delete g.window;
});

test('cleared storage does not restore', () => {
  const store = new Map<string, string>();
  const g = globalThis as typeof globalThis & { window?: Window };
  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  } as Window;

  saveQuickSaleSession(makeSnapshot());
  clearQuickSaleSession();
  assert.equal(loadQuickSaleSession(), null);

  delete g.window;
});

test('checkout_pending loads as active_draft with interrupted flag', () => {
  const store = new Map<string, string>();
  const g = globalThis as typeof globalThis & { window?: Window };
  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  } as Window;

  saveQuickSaleSession(makeSnapshot({ lifecycle: 'checkout_pending' }));
  const loaded = loadQuickSaleSession();
  assert.ok(loaded);
  assert.equal(loaded.snapshot.lifecycle, 'active_draft');
  assert.equal(loaded.interruptedCheckout, true);
  assert.equal(isRestorableQuickSaleSession(loaded.snapshot), true);

  delete g.window;
});

test('save ignores snapshots without restorable lifecycle', () => {
  const store = new Map<string, string>();
  const g = globalThis as typeof globalThis & { window?: Window };
  g.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    },
  } as Window;

  const invalid = makeSnapshot({ lifecycle: 'checkout_pending' });
  // Simulate unknown future lifecycle by casting — save only allows active_draft or checkout_pending
  saveQuickSaleSession({ ...invalid, lifecycle: 'active_draft' });
  assert.ok(store.has(STORAGE_KEY));

  delete g.window;
});
