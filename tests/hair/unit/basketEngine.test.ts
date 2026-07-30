import assert from 'node:assert/strict';
import test from 'node:test';
import { priceBasket } from '../../../src/hair/domain/basket/engine.ts';
import type { Basket } from '../../../src/hair/domain/basket/types.ts';
import { decomposeInclusive, priceLineFromParts } from '../../../src/hair/domain/basket/gstInclusiveMath.ts';

test('decomposeInclusive splits 18% GST from inclusive price', () => {
  const { basePaise, gstPaise } = decomposeInclusive(11_800, 1800);
  assert.equal(basePaise + gstPaise, 11_800);
  assert.ok(gstPaise > 0);
});

test('overridePrice reduces final line and derives discount', () => {
  const priced = priceLineFromParts({
    unitSellingPricePaise: 10_000,
    quantity: 1,
    gstBps: 1800,
    overridePricePaise: 9_000,
  });
  assert.equal(priced.finalLinePaise, 9_000);
  assert.equal(priced.discountPaise, 1_000);
  assert.equal(priced.discountBps, 1000);
});

test('priceBasket grand total uses inclusive line finals minus membership', () => {
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
          category: 'Hair',
        },
        quantity: 1,
        overridePricePaise: null,
        staff: [{ staffId: 'st1', shareBps: 10_000 }],
      },
    ],
    payments: [],
    flags: {},
    membershipDiscountPaise: 500,
  };
  const priced = priceBasket(basket);
  assert.equal(priced.totals.grandTotalPaise, 9_500);
  assert.equal(priced.attributions.length, 1);
  assert.equal(priced.attributions[0]!.shareBps, 10_000);
});

test('staff allocation validation requires 100% on service lines', async () => {
  const { validateStaffAllocations } = await import('../../../src/hair/domain/basket/validate.ts');
  const err = validateStaffAllocations({
    lineId: 'l1',
    billableRef: { id: 's1', type: 'service' },
    snapshot: {
      name: 'Color',
      code: null,
      unitSellingPricePaise: 5000,
      gstBps: 1800,
      staffMode: 'SERVICE',
      category: null,
    },
    quantity: 1,
    overridePricePaise: null,
    staff: [
      { staffId: 'a', shareBps: 5000 },
      { staffId: 'b', shareBps: 4000 },
    ],
  });
  assert.ok(err?.includes('100%'));
});
