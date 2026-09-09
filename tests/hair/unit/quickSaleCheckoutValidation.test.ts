import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { Basket, BasketLine } from '@/src/hair/domain/basket/types';
import {
  collectBasketValidationErrors,
  collectPaymentValidationErrors,
  validateQuickSaleCheckout,
} from '@/src/hair/domain/basket/validateCheckout';

const root = process.cwd();
function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

const sampleCustomerId = 'c1';

const serviceLine: BasketLine = {
  lineId: 'l1',
  billableRef: { id: 's1', type: 'service' },
  snapshot: {
    name: 'Premium Trimming',
    code: 'TRIM',
    unitSellingPricePaise: 100_000,
    gstBps: 1800,
    staffMode: 'SERVICE',
    category: null,
  },
  quantity: 1,
  overridePricePaise: null,
  staff: [],
};

const prepaidLine: BasketLine = {
  lineId: 'l2',
  billableRef: { id: 's2', type: 'service' },
  snapshot: {
    name: 'Luxury Wash',
    code: null,
    unitSellingPricePaise: 50_000,
    gstBps: 1800,
    staffMode: 'SERVICE',
    category: 'Package Redemption',
  },
  quantity: 1,
  overridePricePaise: 0,
  staff: [],
  prepaidRedemption: {
    kind: 'package_redemption',
    customerPackageId: 'cp1',
    creditId: 'cr1',
    serviceId: 's2',
    packageName: 'Gold Pack',
    effectiveUnitValuePaise: 50_000,
  },
};

function basket(overrides: Partial<Basket> = {}): Basket {
  const base: Basket = {
    customerId: sampleCustomerId,
    lines: [serviceLine],
    payments: [],
    flags: {},
    membershipDiscountPaise: 0,
  };
  const merged = { ...base, ...overrides };
  if (!overrides.payments) {
    const priced = priceBasket(merged);
    merged.payments = [{ id: 'p1', method: 'upi', amountPaise: priced.totals.grandTotalPaise }];
  }
  return merged;
}

test('1 missing prepaid staff produces validation error', () => {
  const b = basket({ lines: [prepaidLine], payments: [] });
  const priced = priceBasket(b);
  const errors = validateQuickSaleCheckout(b, priced);
  assert.ok(errors.some((e) => e.includes('Select staff for package redemption')));
});

test('2 missing payment coverage produces validation error', () => {
  const b = basket({ payments: [] });
  const priced = priceBasket(b);
  const errors = validateQuickSaleCheckout(b, priced);
  assert.ok(errors.some((e) => e.includes('Payment total must cover amount due')));
});

test('3 mark due with zero payment requires payment or mark full due', () => {
  const b = basket({ payments: [], flags: { markDue: true } });
  const priced = priceBasket(b);
  const errors = collectPaymentValidationErrors(
    priced.totals.grandTotalPaise,
    0,
    b.flags,
  );
  assert.deepEqual(errors, ['Add a payment or use Mark Full Due']);
});

test('4 multiple missing fields collected together', () => {
  const b = basket({
    customerId: '',
    lines: [prepaidLine, serviceLine],
    payments: [],
  });
  const priced = priceBasket({ ...b, customerId: sampleCustomerId });
  const basketErrors = collectBasketValidationErrors(b);
  assert.ok(basketErrors.includes('Select a customer'));
  assert.ok(basketErrors.some((e) => e.includes('Select staff for package redemption')));
  const payErrors = collectPaymentValidationErrors(priced.totals.grandTotalPaise, 0, b.flags);
  assert.ok(payErrors.length > 0);
});

test('5–8 submitCheckout validates before processing and checkout', () => {
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  const fnStart = shell.indexOf('async function submitCheckout()');
  const fnEnd = shell.indexOf('const addPrepaidSelections', fnStart);
  assert.ok(fnStart > 0 && fnEnd > fnStart);
  const block = shell.slice(fnStart, fnEnd);
  const validateIdx = block.indexOf('validateQuickSaleCheckout');
  const submittingIdx = block.indexOf('checkoutSubmittingRef.current = true');
  const pendingIdx = block.indexOf('markQuickSaleCheckoutPending');
  const actionIdx = block.indexOf('completeQuickSaleAction');
  assert.ok(validateIdx > 0);
  assert.ok(validateIdx < submittingIdx);
  assert.ok(submittingIdx < pendingIdx);
  assert.ok(pendingIdx < actionIdx);
  assert.match(block, /setValidationToasts\(validationErrors\)/);
  assert.match(block, /return;/);
});

test('9 basket validation is pure — no mutation on failure path', () => {
  const b = basket({ payments: [] });
  const before = JSON.stringify(b);
  const priced = priceBasket(b);
  validateQuickSaleCheckout(b, priced);
  assert.equal(JSON.stringify(b), before);
});

test('10 valid sale produces no validation errors', () => {
  const b = basket();
  const priced = priceBasket(b);
  const errors = validateQuickSaleCheckout(b, priced);
  assert.deepEqual(errors, []);
});

test('11–12 processing shield remains functional', () => {
  const overlay = readSrc('src/hair/components/quick-sale/QuickSaleProcessingOverlay.tsx');
  assert.match(overlay, /qs-interaction-shield/);
  assert.match(overlay, /qs-processing-indicator/);
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  assert.match(shell, /QuickSaleCheckoutProcessing/);
  assert.match(shell, /QuickSaleValidationToasts/);
});

test('13–15 success clears storage; failure reverts pending synchronously', () => {
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  assert.match(shell, /saleCompletedRef/);
  assert.match(shell, /clearQuickSaleSession/);
  assert.match(shell, /revertCheckoutPendingToSessionDraft/);
  const fnStart = shell.indexOf('async function submitCheckout()');
  const fnEnd = shell.indexOf('const addPrepaidSelections', fnStart);
  const block = shell.slice(fnStart, fnEnd);
  assert.match(block, /revertCheckoutPendingToSessionDraft/);
});

test('16–17 package prefetch and print failure contracts unchanged', () => {
  const pipeline = readSrc('src/hair/domain/checkout/pipeline.ts');
  assert.match(pipeline, /collectPaymentValidationErrors/);
  const prefetchIdx = pipeline.indexOf('listPackagePlansDetailed({ includeInactive: true }, ctx)');
  const txIdx = pipeline.indexOf('const invoiceId = await hairDb.transaction');
  assert.ok(prefetchIdx > 0 && txIdx > prefetchIdx);
  const action = readSrc('src/hair/actions/quickSale.ts');
  assert.match(action, /invoiceId: result\.invoiceId/);
});

test('normal services without staff are allowed at checkout validation', () => {
  const b = basket({ lines: [serviceLine] });
  const priced = priceBasket(b);
  const errors = collectBasketValidationErrors(b);
  assert.deepEqual(errors, []);
  assert.deepEqual(validateQuickSaleCheckout(b, priced), []);
});
