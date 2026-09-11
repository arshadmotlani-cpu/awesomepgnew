import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { Basket, BasketLine, PaymentEntry } from '@/src/hair/domain/basket/types';
import { validateQuickSaleCheckout } from '@/src/hair/domain/basket/validateCheckout';
import {
  clearDueFlagsIfFullyPaid,
  computePaymentPanelSummary,
  flagsForMarkRemainingDue,
  formatDraftAmountFromPaise,
  parseDraftAmountRupee,
  sumPaymentsPaise,
  validateDraftPayment,
} from '@/src/hair/lib/quickSalePaymentPanelState';

const root = process.cwd();
function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const THOUSAND = 100_000;

const serviceLine: BasketLine = {
  lineId: 'l1',
  billableRef: { id: 's1', type: 'service' },
  snapshot: {
    name: 'Service',
    code: null,
    unitSellingPricePaise: THOUSAND,
    gstBps: 1800,
    staffMode: 'SERVICE',
    category: null,
  },
  quantity: 1,
  overridePricePaise: null,
  staff: [{ staffId: 'st1', shareBps: 10_000 }],
};

const prepaidLine: BasketLine = {
  lineId: 'r1',
  billableRef: { id: 's2', type: 'service' },
  snapshot: {
    name: 'Wash',
    code: null,
    unitSellingPricePaise: 50_000,
    gstBps: 1800,
    staffMode: 'SERVICE',
    category: 'Package Redemption',
  },
  quantity: 1,
  overridePricePaise: 0,
  staff: [{ staffId: 'st1', shareBps: 10_000 }],
  prepaidRedemption: {
    kind: 'package_redemption',
    customerPackageId: 'cp1',
    creditId: 'cr1',
    serviceId: 's2',
    packageName: 'Pack',
    effectiveUnitValuePaise: 50_000,
    retailUnitValuePaise: 100_000,
  },
};

function basket(overrides: Partial<Basket> = {}): Basket {
  return {
    customerId: 'c1',
    lines: [serviceLine],
    payments: [],
    flags: {},
    membershipDiscountPaise: 0,
    ...overrides,
  };
}

function pay(method: PaymentEntry['method'], amountPaise: number): PaymentEntry {
  return { id: `${method}-${amountPaise}`, method, amountPaise };
}

test('1 full payment by Cash', () => {
  const payments = [pay('cash', THOUSAND)];
  const summary = computePaymentPanelSummary({
    grandTotalPaise: THOUSAND,
    payments,
    flags: {},
  });
  assert.equal(summary.paidPaise, THOUSAND);
  assert.equal(summary.duePaise, 0);
  assert.equal(summary.remainingToAllocatePaise, 0);
  assert.equal(summary.isComplete, true);
  const priced = priceBasket(basket({ payments }));
  assert.equal(validateQuickSaleCheckout(basket({ payments }), priced).length, 0);
});

test('2 full payment by UPI', () => {
  const payments = [pay('upi', THOUSAND)];
  const summary = computePaymentPanelSummary({
    grandTotalPaise: THOUSAND,
    payments,
    flags: {},
  });
  assert.equal(summary.paidPaise, THOUSAND);
  assert.equal(summary.isComplete, true);
});

test('3 split payment Cash + UPI', () => {
  const payments = [pay('cash', 50_000), pay('upi', 50_000)];
  assert.equal(sumPaymentsPaise(payments), THOUSAND);
  const summary = computePaymentPanelSummary({
    grandTotalPaise: THOUSAND,
    payments,
    flags: {},
  });
  assert.equal(summary.remainingToAllocatePaise, 0);
  assert.equal(summary.isComplete, true);
});

test('4 partial Cash + remaining Due', () => {
  const payments = [pay('cash', 50_000)];
  const flags = flagsForMarkRemainingDue({ paidPaise: 50_000, remainingPaise: 50_000 });
  const summary = computePaymentPanelSummary({
    grandTotalPaise: THOUSAND,
    payments,
    flags,
  });
  assert.equal(flags.markDue, true);
  assert.equal(summary.paidPaise, 50_000);
  assert.equal(summary.duePaise, 50_000);
  assert.equal(summary.remainingToAllocatePaise, 0);
  const priced = priceBasket(basket({ payments, flags }));
  assert.equal(validateQuickSaleCheckout(basket({ payments, flags }), priced).length, 0);
});

test('5 entire bill marked Due with no payment', () => {
  const flags = flagsForMarkRemainingDue({ paidPaise: 0, remainingPaise: THOUSAND });
  const summary = computePaymentPanelSummary({
    grandTotalPaise: THOUSAND,
    payments: [],
    flags,
  });
  assert.equal(flags.markFullDue, true);
  assert.equal(summary.paidPaise, 0);
  assert.equal(summary.duePaise, THOUSAND);
  assert.equal(summary.isComplete, true);
  const priced = priceBasket(basket({ flags }));
  assert.equal(validateQuickSaleCheckout(basket({ flags }), priced).length, 0);
});

test('6 after adding half payment remaining prefill becomes 500', () => {
  const summary = computePaymentPanelSummary({
    grandTotalPaise: THOUSAND,
    payments: [pay('cash', 50_000)],
    flags: {},
  });
  assert.equal(summary.remainingToAllocatePaise, 50_000);
  assert.equal(formatDraftAmountFromPaise(summary.remainingToAllocatePaise), '500');
});

test('7 payment panel resets method after add', () => {
  const panel = readSrc('src/hair/components/quick-sale/QuickSalePaymentPanel.tsx');
  assert.match(panel, /setDraftMethod\(''\)/);
  assert.match(panel, /Select method/);
});

test('8 cannot add more than remaining amount', () => {
  const error = validateDraftPayment({
    draftPaise: 60_000,
    remainingToAllocatePaise: 50_000,
  });
  assert.match(error ?? '', /cannot exceed remaining/i);
  assert.equal(parseDraftAmountRupee('600'), 60_000);
});

test('9 removing payment allocation recalculates remaining', () => {
  const withTwo = [pay('cash', 50_000), pay('upi', 50_000)];
  const withOne = [pay('cash', 50_000)];
  const full = computePaymentPanelSummary({
    grandTotalPaise: THOUSAND,
    payments: withTwo,
    flags: {},
  });
  const partial = computePaymentPanelSummary({
    grandTotalPaise: THOUSAND,
    payments: withOne,
    flags: {},
  });
  assert.equal(full.remainingToAllocatePaise, 0);
  assert.equal(partial.remainingToAllocatePaise, 50_000);
});

test('10 zero-total package redemption completes without payment', () => {
  const b = basket({ lines: [prepaidLine], payments: [] });
  const priced = priceBasket(b);
  const summary = computePaymentPanelSummary({
    grandTotalPaise: priced.totals.grandTotalPaise,
    payments: [],
    flags: {},
  });
  assert.equal(summary.isZeroTotal, true);
  assert.equal(summary.isComplete, true);
  assert.equal(validateQuickSaleCheckout(b, priced).length, 0);
});

test('11 due flags clear when fully paid', () => {
  const next = clearDueFlagsIfFullyPaid(
    { markDue: true, markFullDue: false },
    THOUSAND,
    THOUSAND,
  );
  assert.equal(next.markDue, false);
  assert.equal(next.markFullDue, false);
});

test('12 checkout pipeline still persists payment rows from basket payments', () => {
  const pipeline = readSrc('src/hair/domain/checkout/pipeline.ts');
  assert.match(pipeline, /fyhInvoicePayments/);
  assert.match(pipeline, /paymentsFromBasket/);
});

test('13 payment panel shows total paid and received rows', () => {
  const panel = readSrc('src/hair/components/quick-sale/QuickSalePaymentPanel.tsx');
  assert.match(panel, /Payments received/);
  assert.match(panel, /Total paid/);
});

test('14 shell keeps checkout double-submit guard', () => {
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  assert.match(shell, /checkoutSubmittingRef/);
  assert.match(shell, /computePaymentPanelSummary/);
});
