import assert from 'node:assert/strict';
import test from 'node:test';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { Basket, BasketLine } from '@/src/hair/domain/basket/types';
import { basketToLegacyLines } from '@/src/hair/domain/basket/legacyBridge';
import {
  catalogGrossPaiseForLine,
  discountPercentForLine,
  effectiveLineGrossPaise,
  parseQuickSalePriceRupees,
  patchLineFromDiscountPercent,
  patchLineFromPriceRupees,
  patchLineQuantityChange,
  pricedPartsForBasketLine,
} from '@/src/hair/lib/quickSaleLinePricing';
import { computePaymentPanelSummary } from '@/src/hair/lib/quickSalePaymentPanelState';
import { discountBpsFromWholePercent } from '@/src/hair/lib/quickSaleDiscountPercent';

function serviceLine(partial: Partial<BasketLine> & Pick<BasketLine, 'lineId'>): BasketLine {
  return {
    billableRef: { id: 'svc-1', type: 'service' },
    snapshot: {
      name: 'Cut',
      code: null,
      unitSellingPricePaise: 60_000,
      gstBps: 1800,
      staffMode: 'SERVICE',
      category: null,
    },
    quantity: 1,
    lineGrossOverridePaise: null,
    overridePricePaise: null,
    staff: [{ staffId: 'st1', shareBps: 10_000 }],
    ...partial,
  };
}

function productLine(unitPaise: number): BasketLine {
  return serviceLine({
    lineId: 'prod-1',
    billableRef: { id: 'prod-1', type: 'product' },
    snapshot: {
      name: 'Shampoo',
      code: 'SH',
      unitSellingPricePaise: unitPaise,
      gstBps: 1800,
      staffMode: 'SALE',
      category: null,
    },
  });
}

test('1: ₹600 at 0% → final ₹600', () => {
  const line = serviceLine({ lineId: 'l1' });
  const priced = pricedPartsForBasketLine(line);
  assert.equal(priced.lineGrossPaise, 60_000);
  assert.equal(priced.finalLinePaise, 60_000);
  assert.equal(discountPercentForLine(line), 0);
});

test('2: ₹600 at 10% → final ₹540', () => {
  let line = serviceLine({ lineId: 'l1' });
  line = { ...line, ...patchLineFromDiscountPercent(line, 10) };
  const priced = pricedPartsForBasketLine(line);
  assert.equal(priced.finalLinePaise, 54_000);
  assert.equal(discountPercentForLine(line), 10);
});

test('3: price ₹600 → ₹700 keeps discount and updates final', () => {
  let line = serviceLine({ lineId: 'l1' });
  line = { ...line, ...patchLineFromDiscountPercent(line, 10) };
  const patch = patchLineFromPriceRupees(line, 700);
  assert.ok(patch);
  line = { ...line, ...patch };
  assert.equal(effectiveLineGrossPaise(line), 70_000);
  assert.equal(pricedPartsForBasketLine(line).finalLinePaise, 63_000);
});

test('4: discount 10% → 20% updates final immediately', () => {
  let line = serviceLine({ lineId: 'l1', lineGrossOverridePaise: 70_000 });
  line = { ...line, ...patchLineFromDiscountPercent(line, 10) };
  assert.equal(pricedPartsForBasketLine(line).finalLinePaise, 63_000);
  line = { ...line, ...patchLineFromDiscountPercent(line, 20) };
  assert.equal(pricedPartsForBasketLine(line).finalLinePaise, 56_000);
});

test('5: quantity 2 scales line gross and final with preserved unit economics', () => {
  let line = serviceLine({ lineId: 'l1' });
  line = { ...line, ...patchLineFromDiscountPercent(line, 10) };
  line = { ...line, ...patchLineQuantityChange(line, 2) };
  assert.equal(effectiveLineGrossPaise(line), 120_000);
  assert.equal(pricedPartsForBasketLine(line).finalLinePaise, 108_000);
});

test('6: basket grand total and payment due follow priced finals', () => {
  const basket: Basket = {
    customerId: 'c1',
    payments: [{ id: 'p1', method: 'cash', amountPaise: 50_000 }],
    flags: {},
    lines: [
      { ...serviceLine({ lineId: 'l1' }), ...patchLineFromDiscountPercent(serviceLine({ lineId: 'l1' }), 0) },
      {
        ...serviceLine({ lineId: 'l2' }),
        ...patchLineFromDiscountPercent(serviceLine({ lineId: 'l2' }), 10),
      },
    ],
  };
  const priced = priceBasket(basket);
  assert.equal(priced.totals.grandTotalPaise, 60_000 + 54_000);
  const panel = computePaymentPanelSummary({
    grandTotalPaise: priced.totals.grandTotalPaise,
    payments: basket.payments,
    flags: basket.flags,
  });
  assert.equal(panel.remainingToAllocatePaise, 64_000);
});

test('7–8: price override does not change catalog snapshot unit (service or product)', () => {
  let service = serviceLine({ lineId: 'l1' });
  service = { ...service, ...patchLineFromPriceRupees(service, 700)! };
  assert.equal(service.snapshot.unitSellingPricePaise, 60_000);
  assert.equal(catalogGrossPaiseForLine(service), 60_000);
  assert.equal(effectiveLineGrossPaise(service), 70_000);

  let product = productLine(45_000);
  product = { ...product, ...patchLineFromPriceRupees(product, 500)! };
  assert.equal(product.snapshot.unitSellingPricePaise, 45_000);
  assert.equal(effectiveLineGrossPaise(product), 50_000);
});

test('9: discount 100% → final ₹0', () => {
  let line = serviceLine({ lineId: 'l1' });
  line = { ...line, ...patchLineFromDiscountPercent(line, 100) };
  assert.equal(pricedPartsForBasketLine(line).finalLinePaise, 0);
});

test('10: negative price input rejected', () => {
  const line = serviceLine({ lineId: 'l1' });
  assert.equal(parseQuickSalePriceRupees('-5'), null);
  assert.equal(patchLineFromPriceRupees(line, -1), null);
});

test('11: discount >100% rejected by percent parser (basket unchanged)', () => {
  const line = serviceLine({ lineId: 'l1' });
  const before = pricedPartsForBasketLine(line).finalLinePaise;
  const bps = discountBpsFromWholePercent(101);
  assert.equal(bps, 10_000);
  assert.equal(before, 60_000);
});

test('12: package redemption stays ₹0 payable with effective performance base', () => {
  const basket: Basket = {
    customerId: 'c1',
    payments: [],
    flags: {},
    lines: [
      {
        lineId: 'r1',
        billableRef: { id: 'svc1', type: 'service' },
        snapshot: {
          name: 'Wash',
          code: null,
          unitSellingPricePaise: 60_000,
          gstBps: 0,
          staffMode: 'SERVICE',
          category: 'Package Redemption',
        },
        quantity: 1,
        lineGrossOverridePaise: null,
        overridePricePaise: 0,
        staff: [{ staffId: 'st1', shareBps: 10_000 }],
        prepaidRedemption: {
          kind: 'package_redemption',
          customerPackageId: 'cp1',
          creditId: 'cr1',
          serviceId: 'svc1',
          packageName: 'Pack',
          effectiveUnitValuePaise: 30_000,
          retailUnitValuePaise: 60_000,
        },
      },
    ],
  };
  const priced = priceBasket(basket);
  assert.equal(priced.totals.grandTotalPaise, 0);
  assert.equal(priced.attributions[0]!.attributedBasePaise, 30_000);
  assert.equal(patchLineFromPriceRupees(basket.lines[0]!, 999), null);
});

test('13: legacy line export carries gross override and discount for invoice path', () => {
  let line = serviceLine({ lineId: 'l1' });
  line = { ...line, ...patchLineFromPriceRupees(line, 700)! };
  line = { ...line, ...patchLineFromDiscountPercent(line, 10) };
  const legacy = basketToLegacyLines({
    customerId: 'c1',
    lines: [line],
    payments: [],
    flags: {},
  })[0]!;
  assert.equal(legacy.lineGrossOverridePaise, 70_000);
  assert.equal(legacy.lineDiscountPaise, 7_000);
  const priced = priceBasket({ customerId: 'c1', lines: [line], payments: [], flags: {} });
  assert.equal(priced.lines[0]!.lineGrossPaise, 70_000);
  assert.equal(priced.lines[0]!.finalLinePaise, 63_000);
  assert.equal(priced.lines[0]!.discountPaise, 7_000);
});
