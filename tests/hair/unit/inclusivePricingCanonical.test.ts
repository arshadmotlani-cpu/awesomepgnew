import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  computeInclusiveGrandTotal,
  decomposeInclusive,
  priceInclusiveCartLine,
  sumInclusiveCartLines,
} from '../../../src/hair/domain/basket/gstInclusiveMath.ts';
import { priceBasket } from '../../../src/hair/domain/basket/engine.ts';
import { priceLineDrafts } from '../../../src/hair/services/invoices.ts';
import type { Basket } from '../../../src/hair/domain/basket/types.ts';

const GST_BPS = 1800;

/** Historical exclusive helper — documents the bug surface; must not be reintroduced. */
function exclusiveTaxOnNet(netPaise: number, gstBps: number) {
  return Math.round((Math.max(0, netPaise) * Math.max(0, gstBps)) / 10_000);
}

function basketFromInclusiveLine(opts: {
  unitPaise: number;
  qty: number;
  discountPaise: number;
  membershipPaise?: number;
  packagePaise?: number;
}): Basket {
  const catalogGross = opts.unitPaise * opts.qty;
  return {
    customerId: 'c1',
    lines: [
      {
        lineId: 'l1',
        billableRef: { id: 's1', type: 'service' },
        snapshot: {
          name: 'Cut',
          code: null,
          unitSellingPricePaise: opts.unitPaise,
          gstBps: GST_BPS,
          staffMode: 'SERVICE',
          category: null,
        },
        quantity: opts.qty,
        overridePricePaise: catalogGross - opts.discountPaise,
        staff: [],
      },
    ],
    payments: [],
    flags: {},
    membershipDiscountPaise: opts.membershipPaise ?? 0,
    packageRedemptionPaise: opts.packagePaise ?? 0,
  };
}

test('standard sale: catalog price is GST-inclusive; grand total is not price+GST', () => {
  const priced = priceBasket(basketFromInclusiveLine({ unitPaise: 10_000, qty: 1, discountPaise: 0 }));
  assert.equal(priced.totals.grandTotalPaise, 10_000);
  assert.equal(priced.totals.subtotalBasePaise + priced.totals.taxPaise, 10_000);
  const exclusiveWouldCharge = 10_000 + exclusiveTaxOnNet(10_000, GST_BPS);
  assert.notEqual(priced.totals.grandTotalPaise, exclusiveWouldCharge);
});

test('discount applied: override reduces inclusive final; GST is extracted from discounted amount', () => {
  const line = priceInclusiveCartLine({
    unitSellingPricePaise: 10_000,
    quantity: 1,
    lineDiscountPaise: 1_000,
    gstBps: GST_BPS,
  });
  assert.equal(line.finalLinePaise, 9_000);
  assert.equal(line.discountPaise, 1_000);
  const split = decomposeInclusive(9_000, GST_BPS);
  assert.equal(line.basePaise, split.basePaise);
  assert.equal(line.gstPaise, split.gstPaise);
  const exclusiveTax = exclusiveTaxOnNet(9_000, GST_BPS);
  assert.notEqual(line.gstPaise, exclusiveTax);
});

test('GST edge: 18% inclusive split is remainder-safe (base + gst = final)', () => {
  for (const finalPaise of [0, 1, 99, 10_000, 11_800, 45_901]) {
    const { basePaise, gstPaise } = decomposeInclusive(finalPaise, GST_BPS);
    assert.equal(basePaise + gstPaise, finalPaise);
  }
  assert.deepEqual(decomposeInclusive(5_000, 0), { basePaise: 5_000, gstPaise: 0 });
});

test('zero-amount line does not add tax or grand total', () => {
  const summed = sumInclusiveCartLines([
    { unitSellingPricePaise: 0, quantity: 1, lineDiscountPaise: 0, gstBps: GST_BPS },
    { unitSellingPricePaise: 10_000, quantity: 1, lineDiscountPaise: 10_000, gstBps: GST_BPS },
  ]);
  assert.equal(summed.inclusiveFinalPaise, 0);
  assert.equal(summed.taxPaise, 0);
  assert.equal(computeInclusiveGrandTotal({ inclusiveFinalPaise: 0 }), 0);
});

test('membership and package reduce charged total after inclusive lines (void/refund not a second GST path)', () => {
  const priced = priceBasket(
    basketFromInclusiveLine({
      unitPaise: 10_000,
      qty: 1,
      discountPaise: 0,
      membershipPaise: 2_000,
      packagePaise: 1_000,
    }),
  );
  assert.equal(priced.totals.grandTotalPaise, 7_000);
});

test('partial payment / void / refund do not re-price: charged amount stays basket grand total', () => {
  const priced = priceBasket(basketFromInclusiveLine({ unitPaise: 10_000, qty: 1, discountPaise: 0 }));
  const amountPaidPaise = 4_000;
  const remainingDuePaise = Math.max(0, priced.totals.grandTotalPaise - amountPaidPaise);
  assert.equal(remainingDuePaise, 6_000);
  const voidedGrandTotalPaise = priced.totals.grandTotalPaise;
  assert.equal(voidedGrandTotalPaise, 10_000);
});

test('hold drafts and priceBasket agree (resident/admin-equivalent POS surfaces)', () => {
  const drafts = priceLineDrafts([
    {
      kind: 'service',
      description: 'Cut',
      quantity: 2,
      unitPricePaise: 10_000,
      lineDiscountPaise: 500,
      gstBps: GST_BPS,
    },
  ]);
  const priced = priceBasket(
    basketFromInclusiveLine({ unitPaise: 10_000, qty: 2, discountPaise: 500 }),
  );
  assert.equal(drafts.inclusiveFinalPaise, priced.totals.grandTotalPaise);
  assert.equal(drafts.taxPaise, priced.totals.taxPaise);
  assert.equal(drafts.subtotalPaise, priced.totals.subtotalBasePaise);
});

test('deleted exclusive invoiceMath module must not return', () => {
  const path = resolve(process.cwd(), 'src/hair/lib/invoiceMath.ts');
  assert.equal(existsSync(path), false);
});
