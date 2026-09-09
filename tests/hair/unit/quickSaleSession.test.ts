import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQuickSaleSessionSnapshot,
  clearQuickSaleSession,
  isRestorableQuickSaleSession,
  loadCheckoutPending,
  loadQuickSaleSession,
  loadSessionDraft,
  LOCAL_PENDING_KEY,
  purgeLegacyLocalActiveDraft,
  revertCheckoutPendingToSessionDraft,
  saveCheckoutPending,
  saveSessionDraft,
  SESSION_DRAFT_KEY,
  type QuickSaleSessionSnapshot,
} from '@/src/hair/lib/quickSaleSession';

const LEGACY_LOCAL_KEY = 'fyh-quick-sale-session-v1';

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
    lines: [
      {
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
        quantity: 1,
        overridePricePaise: null,
        staff: [],
      },
    ],
    payments: [{ id: 'p1', method: 'upi', amountPaise: 100_000 }],
    flags: {},
    holdInvoiceId: null,
    staffNames: { s1: 'Rahul' },
    lifecycle: 'active_draft',
    ...overrides,
  });
}

function installDualStorage() {
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
  return { localStore, sessionStore, cleanup: () => delete g.window };
}

test('1 fresh Quick Sale with no storage returns null', () => {
  const { cleanup } = installDualStorage();
  assert.equal(loadQuickSaleSession(), null);
  assert.equal(loadSessionDraft(), null);
  assert.equal(loadCheckoutPending(), null);
  cleanup();
});

test('2 legacy localStorage active_draft is ignored and removed', () => {
  const { localStore, sessionStore, cleanup } = installDualStorage();
  localStore.set(LEGACY_LOCAL_KEY, JSON.stringify(makeSnapshot({ lifecycle: 'active_draft' })));
  purgeLegacyLocalActiveDraft();
  assert.equal(loadQuickSaleSession(), null);
  assert.equal(localStore.has(LEGACY_LOCAL_KEY), false);
  assert.equal(sessionStore.size, 0);
  cleanup();
});

test('3 sessionStorage active_draft restores within same tab', () => {
  const { cleanup } = installDualStorage();
  saveSessionDraft(makeSnapshot());
  const loaded = loadSessionDraft();
  assert.ok(loaded);
  assert.equal(loaded.snapshot.lines.length, 1);
  assert.equal(loaded.interruptedCheckout, false);
  assert.equal(loadQuickSaleSession()?.snapshot.lines.length, 1);
  cleanup();
});

test('4 browser refresh preserves sessionStorage active draft', () => {
  const { sessionStore, cleanup } = installDualStorage();
  saveSessionDraft(makeSnapshot({ catalogQ: 'wash' }));
  sessionStore.clear();
  sessionStore.set(SESSION_DRAFT_KEY, JSON.stringify(makeSnapshot({ catalogQ: 'wash' })));
  const loaded = loadSessionDraft();
  assert.ok(loaded);
  assert.equal(loaded.snapshot.catalogQ, 'wash');
  cleanup();
});

test('5 sessionStorage draft is not stored in localStorage (tab-close semantics)', () => {
  const { localStore, cleanup } = installDualStorage();
  saveSessionDraft(makeSnapshot());
  assert.equal(localStore.has(SESSION_DRAFT_KEY), false);
  assert.equal(localStore.has(LOCAL_PENDING_KEY), false);
  cleanup();
});

test('6 localStorage checkout_pending restores after fresh mount', () => {
  const { cleanup } = installDualStorage();
  saveCheckoutPending(makeSnapshot({ lifecycle: 'checkout_pending' }));
  const loaded = loadCheckoutPending();
  assert.ok(loaded);
  assert.equal(loaded.snapshot.lifecycle, 'active_draft');
  assert.equal(loaded.snapshot.lines.length, 1);
  cleanup();
});

test('7 checkout_pending displays interrupted checkout flag', () => {
  const { cleanup } = installDualStorage();
  saveCheckoutPending(makeSnapshot({ lifecycle: 'checkout_pending' }));
  const loaded = loadQuickSaleSession();
  assert.ok(loaded);
  assert.equal(loaded.interruptedCheckout, true);
  cleanup();
});

test('8 active_draft never gets interpreted as checkout_pending', () => {
  const { cleanup } = installDualStorage();
  saveSessionDraft(makeSnapshot({ lifecycle: 'active_draft' }));
  assert.equal(loadCheckoutPending(), null);
  const loaded = loadSessionDraft();
  assert.ok(loaded);
  assert.equal(loaded.interruptedCheckout, false);
  cleanup();
});

test('9 successful clearQuickSaleSession clears both storages', () => {
  const { localStore, sessionStore, cleanup } = installDualStorage();
  saveSessionDraft(makeSnapshot());
  saveCheckoutPending(makeSnapshot({ lifecycle: 'checkout_pending' }));
  clearQuickSaleSession();
  assert.equal(sessionStore.has(SESSION_DRAFT_KEY), false);
  assert.equal(localStore.has(LOCAL_PENDING_KEY), false);
  cleanup();
});

test('10 revertCheckoutPendingToSessionDraft moves pending to session draft', () => {
  const { localStore, sessionStore, cleanup } = installDualStorage();
  const snapshot = makeSnapshot();
  saveCheckoutPending({ ...snapshot, lifecycle: 'checkout_pending' });
  assert.ok(localStore.has(LOCAL_PENDING_KEY));
  revertCheckoutPendingToSessionDraft(snapshot);
  assert.equal(localStore.has(LOCAL_PENDING_KEY), false);
  assert.ok(sessionStore.has(SESSION_DRAFT_KEY));
  const loaded = loadSessionDraft();
  assert.ok(loaded);
  assert.equal(loaded.snapshot.lines.length, 1);
  assert.equal(loaded.interruptedCheckout, false);
  cleanup();
});

test('legacy checkout_pending migrates from legacy localStorage key', () => {
  const { localStore, cleanup } = installDualStorage();
  localStore.set(
    LEGACY_LOCAL_KEY,
    JSON.stringify(makeSnapshot({ lifecycle: 'checkout_pending' })),
  );
  purgeLegacyLocalActiveDraft();
  assert.equal(localStore.has(LEGACY_LOCAL_KEY), false);
  assert.ok(localStore.has(LOCAL_PENDING_KEY));
  const loaded = loadCheckoutPending();
  assert.ok(loaded);
  assert.equal(loaded.interruptedCheckout, true);
  cleanup();
});

test('v1 storage migrates to v2 active_draft in sessionStorage only', () => {
  const { sessionStore, cleanup } = installDualStorage();
  sessionStore.set(
    SESSION_DRAFT_KEY,
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
  const loaded = loadSessionDraft();
  assert.ok(loaded);
  assert.equal(loaded.snapshot.v, 2);
  assert.equal(loaded.snapshot.lifecycle, 'active_draft');
  assert.equal(loaded.snapshot.payments.length, 1);
  assert.equal(isRestorableQuickSaleSession(loaded.snapshot), true);
  cleanup();
});
