import assert from 'node:assert/strict';
import test from 'node:test';
import { computeGrandTotalFromParts, sumCartLines } from '../../../src/hair/lib/invoiceMath.ts';

test('sumCartLines applies line discounts before tax', () => {
  const { subtotalPaise, taxPaise } = sumCartLines([
    {
      kind: 'service',
      unitPricePaise: 10_000,
      quantity: 2,
      lineDiscountPaise: 1_000,
      gstBps: 1800,
    },
  ]);
  assert.equal(subtotalPaise, 19_000);
  assert.equal(taxPaise, Math.round((19_000 * 1800) / 10_000));
});

test('computeGrandTotalFromParts includes tip, round-off, wallet, membership', () => {
  const { grandTotalPaise } = computeGrandTotalFromParts({
    subtotalPaise: 10_000,
    taxPaise: 1_800,
    discountPaise: 500,
    membershipDiscountPaise: 1_000,
    packageRedeemPaise: 0,
    walletRedeemPaise: 2_000,
    tipPaise: 500,
    roundOffPaise: -50,
  });
  const taxableBase = 10_000 - 500 - 1_000;
  const taxAdj = Math.round((1_800 * taxableBase) / 10_000);
  const expected = Math.max(0, taxableBase + taxAdj - 2_000 + 500 - 50);
  assert.equal(grandTotalPaise, expected);
});

test('searchCustomersForPos requires one character', async () => {
  const { searchCustomersForPos } = await import('../../../src/hair/services/quickSale.ts');
  const empty = await searchCustomersForPos('');
  assert.equal(empty.length, 0);
});
