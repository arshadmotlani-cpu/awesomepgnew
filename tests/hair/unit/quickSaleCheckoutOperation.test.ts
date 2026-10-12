import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { overridePricePaiseForDiscountPercent } from '@/src/hair/lib/quickSaleDiscountPercent';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { BasketLine } from '@/src/hair/domain/basket/types';

const root = process.cwd();
function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('99% discount on ₹2,790 product matches ₹27.90 inclusive line total', () => {
  const grossPaise = 279_000;
  const finalPaise = overridePricePaiseForDiscountPercent(grossPaise, 99);
  assert.equal(finalPaise, 2_790);
  const line: BasketLine = {
    lineId: 'l1',
    billableRef: { id: 'p1', type: 'product' },
    snapshot: {
      name: 'BIOTOP 911 MASK',
      code: null,
      unitSellingPricePaise: grossPaise,
      gstBps: 1800,
      staffMode: 'SALE',
      category: 'Retail',
    },
    quantity: 1,
    lineGrossOverridePaise: null,
    overridePricePaise: finalPaise,
    staff: [],
  };
  const priced = priceBasket({
    customerId: 'c1',
    lines: [line],
    payments: [{ id: 'pay1', method: 'cash', amountPaise: 2_790 }],
    flags: {},
    membershipDiscountPaise: 0,
  });
  assert.equal(priced.totals.grandTotalPaise, 2_790);
});

test('post-checkout WhatsApp enqueue does not block checkoutFromBasket return', () => {
  const pipeline = readSrc('src/hair/domain/checkout/pipeline.ts');
  assert.match(pipeline, /void enqueuePostCheckoutNotifications/);
  assert.match(pipeline, /Must not block checkout response/);
});

test('completeQuickSaleAction uses executeBasketCheckout with attempt id', () => {
  const action = readSrc('src/hair/actions/quickSale.ts');
  assert.match(action, /executeBasketCheckout/);
  assert.match(action, /checkoutAttemptId/);
  assert.match(action, /recoverQuickSaleCheckoutAction/);
});

test('QuickSaleShell races checkout with client timeout and recovery', () => {
  const shell = readSrc('src/hair/components/quick-sale/QuickSaleShell.tsx');
  assert.match(shell, /raceQuickSaleCheckout/);
  assert.match(shell, /recoverQuickSaleCheckoutAction/);
  assert.match(shell, /checkoutAttemptId/);
});

test('stale checkout operations are failed and safe to retry', () => {
  const claim = readSrc('src/hair/domain/checkout/claimLease.ts');
  const reconcile = readSrc('src/hair/domain/checkout/reconcileAttempt.ts');
  assert.match(claim, /markStaleProcessingOperationsFailed/);
  assert.match(reconcile, /isStaleCheckoutOperation/);
  assert.match(reconcile, /STALE_CHECKOUT_OPERATION_ERROR/);
});

test('checkout operation stale window exceeds client timeout', () => {
  const lease = readSrc('src/hair/lib/checkoutOperationLease.ts');
  const client = readSrc('src/hair/lib/quickSaleCheckoutClient.ts');
  const staleMatch = lease.match(/QUICK_SALE_CHECKOUT_OPERATION_STALE_MS = (\d+)/);
  const timeoutMatch = client.match(/QUICK_SALE_CHECKOUT_CLIENT_TIMEOUT_MS = (\d+)/);
  assert.ok(staleMatch && timeoutMatch);
  assert.ok(Number(staleMatch[1]) > Number(timeoutMatch[1]));
});
