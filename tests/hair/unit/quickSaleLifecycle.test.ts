import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildQuickSaleSessionSnapshot,
  emptyQuickSaleTransactionState,
  isRestorableQuickSaleSession,
  normalizeRestoredQuickSaleSession,
  QUICK_SALE_CHECKOUT_AMBIGUOUS_ERROR,
  QUICK_SALE_CHECKOUT_INTERRUPTED_ERROR,
} from '@/src/hair/lib/quickSaleLifecycle';
import type { QuickSaleSessionSnapshot } from '@/src/hair/lib/quickSaleSession';

const root = process.cwd();
function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const sampleCustomer = {
  id: 'c1',
  fullName: 'Jane',
  customerCode: 'FYH001',
  phone: '9876543210',
  walletBalancePaise: 0,
};

function draftSnapshot(
  overrides: Partial<QuickSaleSessionSnapshot> = {},
): QuickSaleSessionSnapshot {
  return buildQuickSaleSessionSnapshot({
    customer: sampleCustomer,
    appointmentId: null,
    tab: 'service',
    catalogQ: '',
    lines: [],
    payments: [],
    flags: {},
    holdInvoiceId: null,
    staffNames: {},
    ...overrides,
  });
}

test('fresh / missing snapshot is not restorable', () => {
  assert.equal(isRestorableQuickSaleSession(null), false);
  assert.equal(isRestorableQuickSaleSession(undefined), false);
  assert.equal(
    isRestorableQuickSaleSession(
      draftSnapshot({ lifecycle: 'checkout_pending' }),
    ),
    false,
  );
});

test('active_draft restores; checkout_pending normalizes to active_draft', () => {
  const active = draftSnapshot({ lifecycle: 'active_draft' });
  assert.equal(isRestorableQuickSaleSession(active), true);

  const pending = draftSnapshot({
    lifecycle: 'checkout_pending',
    lines: [
      {
        lineId: 'l1',
        billableRef: { id: 's1', type: 'service' },
        snapshot: {
          name: 'Cut',
          code: null,
          unitSellingPricePaise: 50000,
          gstBps: 1800,
          staffMode: 'SERVICE',
          category: null,
        },
        quantity: 1,
        overridePricePaise: null,
        staff: [],
      },
    ],
  });
  const normalized = normalizeRestoredQuickSaleSession(pending);
  assert.equal(normalized.lifecycle, 'active_draft');
  assert.equal(normalized.lines.length, 1);
});

test('empty transaction state clears basket and payment fields', () => {
  const empty = emptyQuickSaleTransactionState();
  assert.deepEqual(empty.lines, []);
  assert.deepEqual(empty.payments, []);
  assert.deepEqual(empty.flags, {});
  assert.equal(empty.holdInvoiceId, null);
  assert.deepEqual(empty.staffNames, {});
  assert.equal(empty.catalogQ, '');
  assert.equal(empty.tab, 'service');
  assert.equal(empty.membershipDiscountPaise, 0);
});

test('v2 snapshot builder defaults lifecycle to active_draft', () => {
  const snapshot = draftSnapshot();
  assert.equal(snapshot.v, 2);
  assert.equal(snapshot.lifecycle, 'active_draft');
});

test('checkout error constants are actionable', () => {
  assert.match(QUICK_SALE_CHECKOUT_AMBIGUOUS_ERROR, /Verify Billing/i);
  assert.match(QUICK_SALE_CHECKOUT_INTERRUPTED_ERROR, /Verify Billing/i);
});

test('QuickSaleShell uses dedicated checkoutSubmitting — not shared pending on Confirm', () => {
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  assert.match(shell, /checkoutSubmitting/);
  assert.match(shell, /holdSubmitting/);
  assert.doesNotMatch(shell, /useTransition/);
  assert.doesNotMatch(shell, /\{pending \? 'Processing…'/);
  assert.match(shell, /\{checkoutSubmitting \? 'Processing…' : 'Confirm sale'\}/);
  assert.match(shell, /QUICK_SALE_CHECKOUT_AMBIGUOUS_ERROR/);
  assert.match(shell, /finalizeSuccess/);
  assert.match(shell, /emptyQuickSaleTransactionState/);
});

test('workspace lock overlay and aria-busy when submitting', () => {
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  assert.match(shell, /qs-pos-locked/);
  assert.match(shell, /aria-busy=\{workspaceLocked\}/);
  assert.match(shell, /QuickSaleProcessingOverlay/);
  const overlay = readSrc('src/hair/components/quick-sale/QuickSaleProcessingOverlay.tsx');
  assert.match(overlay, /qs-processing-overlay/);
  assert.match(overlay, /data-testid="qs-processing-overlay"/);
});

test('membership preview does not set checkout submitting', () => {
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  const previewStart = shell.indexOf('if (!customer?.id || lines.length === 0)');
  const previewEnd = shell.indexOf('}, [customer?.id, lines]);', previewStart);
  assert.ok(previewStart > 0 && previewEnd > previewStart);
  const previewBlock = shell.slice(previewStart, previewEnd);
  assert.match(previewBlock, /previewQuickSaleTotalsAction/);
  assert.doesNotMatch(previewBlock, /setCheckoutSubmitting/);
  assert.doesNotMatch(previewBlock, /checkoutSubmittingRef/);
});

test('basket and payment panels accept locked prop', () => {
  const basket = readSrc('src/hair/components/quick-sale/QuickSaleBasketTable.tsx');
  const payment = readSrc('src/hair/components/quick-sale/QuickSalePaymentPanel.tsx');
  assert.match(basket, /locked\?: boolean/);
  assert.match(payment, /locked\?: boolean/);
  assert.match(basket, /disabled=\{locked/);
  assert.match(payment, /disabled=\{locked/);
});
