import assert from 'node:assert/strict';
import test from 'node:test';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import { buildAttributionPlan } from '@/src/hair/domain/basket/attribution';
import type { Basket, BasketLine } from '@/src/hair/domain/basket/types';
import {
  collectBasketLineValidationErrors,
  validateBasket,
} from '@/src/hair/domain/basket/validate';
import {
  analyzeQuickSaleCheckoutValidation,
  validateQuickSaleCheckout,
} from '@/src/hair/domain/basket/validateCheckout';
import { checkoutFromBasket } from '@/src/hair/domain/checkout/pipeline';

function serviceLine(name: string, lineId: string, staff: BasketLine['staff']): BasketLine {
  return {
    lineId,
    billableRef: { id: `svc-${lineId}`, type: 'service' },
    snapshot: {
      name,
      code: null,
      unitSellingPricePaise: 60_000,
      gstBps: 1800,
      staffMode: 'SERVICE',
      category: null,
    },
    quantity: 1,
    lineGrossOverridePaise: null,
    overridePricePaise: null,
    staff,
  };
}

function paidBasket(lines: BasketLine[]): Basket {
  const basket: Basket = {
    customerId: 'cust-1',
    lines,
    payments: [],
    flags: {},
  };
  const priced = priceBasket(basket);
  basket.payments = [{ id: 'p1', method: 'cash', amountPaise: priced.totals.grandTotalPaise }];
  return basket;
}

test('1 one service without staff is rejected', () => {
  const b = paidBasket([serviceLine('Creative Director Hair Cut', 'l1', [])]);
  const priced = priceBasket(b);
  const v = analyzeQuickSaleCheckoutValidation(b, priced);
  assert.ok(v.errors.length > 0);
  assert.ok(v.staffAlert?.lineNames.includes('Creative Director Hair Cut'));
  assert.equal(validateBasket(b)?.includes('Cannot complete sale'), true);
});

test('2 one service with staff succeeds validation', () => {
  const b = paidBasket([
    serviceLine('Creative Director Hair Cut', 'l1', [{ staffId: 'st1', shareBps: 10_000 }]),
  ]);
  const priced = priceBasket(b);
  assert.deepEqual(validateQuickSaleCheckout(b, priced), []);
  assert.equal(validateBasket(b), null);
});

test('3 two services one missing staff lists the missing line', () => {
  const b = paidBasket([
    serviceLine('Cut A', 'l1', [{ staffId: 'st1', shareBps: 10_000 }]),
    serviceLine('Cut B', 'l2', []),
  ]);
  const priced = priceBasket(b);
  const v = analyzeQuickSaleCheckoutValidation(b, priced);
  assert.deepEqual(v.staffAlert?.lineNames, ['Cut B']);
  assert.deepEqual(v.staffRequiredLineIds, ['l2']);
});

test('4 two services both staffed succeeds', () => {
  const b = paidBasket([
    serviceLine('Cut A', 'l1', [{ staffId: 'st1', shareBps: 10_000 }]),
    serviceLine('Cut B', 'l2', [{ staffId: 'st2', shareBps: 10_000 }]),
  ]);
  assert.deepEqual(validateQuickSaleCheckout(b, priceBasket(b)), []);
});

test('5 package redemption without performer rejected', () => {
  const line: BasketLine = {
    ...serviceLine('Luxury Wash', 'r1', []),
    overridePricePaise: 0,
    prepaidRedemption: {
      kind: 'package_redemption',
      customerPackageId: 'cp1',
      creditId: 'cr1',
      serviceId: 'svc-r1',
      packageName: 'Gold',
      effectiveUnitValuePaise: 30_000,
      retailUnitValuePaise: 60_000,
    },
  };
  const b = paidBasket([line]);
  assert.ok(validateBasket(b)?.includes('Cannot complete sale'));
});

test('6 package redemption with performer succeeds and attributes effective value', () => {
  const line: BasketLine = {
    ...serviceLine('Luxury Wash', 'r1', [{ staffId: 'st1', shareBps: 10_000 }]),
    overridePricePaise: 0,
    prepaidRedemption: {
      kind: 'package_redemption',
      customerPackageId: 'cp1',
      creditId: 'cr1',
      serviceId: 'svc-r1',
      packageName: 'Gold',
      effectiveUnitValuePaise: 30_000,
      retailUnitValuePaise: 60_000,
    },
  };
  const b = paidBasket([line]);
  assert.equal(validateBasket(b), null);
  const priced = priceBasket(b);
  const attrs = buildAttributionPlan(priced.lines);
  assert.equal(attrs[0]!.attributedBasePaise, 30_000);
});

test('7 product-only sale without staff remains allowed', () => {
  const product: BasketLine = {
    lineId: 'p1',
    billableRef: { id: 'prod-1', type: 'product' },
    snapshot: {
      name: 'Shampoo',
      code: null,
      unitSellingPricePaise: 50_000,
      gstBps: 1800,
      staffMode: 'SALE',
      category: null,
    },
    quantity: 1,
    lineGrossOverridePaise: null,
    overridePricePaise: null,
    staff: [],
  };
  const b = paidBasket([product]);
  assert.deepEqual(collectBasketLineValidationErrors(b), []);
});

test('11 server checkoutFromBasket rejects missing staff before side effects', async () => {
  const b = paidBasket([serviceLine('Cut', 'l1', [])]);
  await assert.rejects(
    () => checkoutFromBasket({ basket: b, allowUnpaid: true }),
    (err: Error) => err.message.includes('Cannot complete sale'),
  );
});

test('pipeline validates basket lines before payment and transaction', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'src/hair/domain/checkout/pipeline.ts'),
    'utf8',
  );
  const fnStart = src.indexOf('export async function checkoutFromBasket');
  const fnEnd = src.indexOf('export async function', fnStart + 1);
  const block = fnEnd > fnStart ? src.slice(fnStart, fnEnd) : src.slice(fnStart);
  const basketValIdx = block.indexOf('collectBasketLineValidationErrors(input.basket)');
  const enrichIdx = block.indexOf('enrichBasketWithRedemptions(input.basket');
  const txIdx = block.indexOf('const invoiceId = await hairDb.transaction');
  assert.ok(basketValIdx > 0 && basketValIdx < enrichIdx && enrichIdx < txIdx);
});
