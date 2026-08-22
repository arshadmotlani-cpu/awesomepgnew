import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeInclusiveGrandTotal,
  decomposeInclusive,
  sumInclusiveCartLines,
} from '../../../src/hair/domain/basket/gstInclusiveMath.ts';
import { priceBasket } from '../../../src/hair/domain/basket/engine.ts';
import { priceLineDrafts } from '../../../src/hair/services/invoices.ts';
import type { Basket } from '../../../src/hair/domain/basket/types.ts';

test('sumInclusiveCartLines applies line discount then decomposes GST from inclusive final', () => {
  const { inclusiveFinalPaise, taxPaise, subtotalBasePaise } = sumInclusiveCartLines([
    {
      unitSellingPricePaise: 10_000,
      quantity: 2,
      lineDiscountPaise: 1_000,
      gstBps: 1800,
    },
  ]);
  assert.equal(inclusiveFinalPaise, 19_000);
  const split = decomposeInclusive(19_000, 1800);
  assert.equal(subtotalBasePaise, split.basePaise);
  assert.equal(taxPaise, split.gstPaise);
  assert.equal(subtotalBasePaise + taxPaise, 19_000);
});

test('computeInclusiveGrandTotal is membership/package off inclusive finals — not exclusive tax-on-net', () => {
  const grandTotalPaise = computeInclusiveGrandTotal({
    inclusiveFinalPaise: 10_000,
    membershipDiscountPaise: 1_000,
    packageRedeemPaise: 0,
  });
  assert.equal(grandTotalPaise, 9_000);
});

test('searchCustomersForPos requires one character', async () => {
  const { searchCustomersForPos } = await import('../../../src/hair/services/quickSale.ts');
  const empty = await searchCustomersForPos('');
  assert.equal(empty.length, 0);
});

test('priceLineDrafts matches priceBasket line totals for the same catalog line', () => {
  const drafts = priceLineDrafts([
    {
      kind: 'service',
      description: 'Cut',
      quantity: 1,
      unitPricePaise: 10_000,
      lineDiscountPaise: 0,
      gstBps: 1800,
    },
  ]);
  const basket: Basket = {
    customerId: 'c1',
    lines: [
      {
        lineId: 'l1',
        billableRef: { id: 's1', type: 'service' },
        snapshot: {
          name: 'Cut',
          code: null,
          unitSellingPricePaise: 10_000,
          gstBps: 1800,
          staffMode: 'SERVICE',
          category: null,
        },
        quantity: 1,
        overridePricePaise: null,
        staff: [],
      },
    ],
    payments: [],
    flags: {},
  };
  const priced = priceBasket(basket);
  assert.equal(drafts.inclusiveFinalPaise, priced.totals.grandTotalPaise);
  assert.equal(drafts.taxPaise, priced.totals.taxPaise);
  assert.equal(drafts.priced[0]!.lineTotalPaise, priced.lines[0]!.finalLinePaise);
});
