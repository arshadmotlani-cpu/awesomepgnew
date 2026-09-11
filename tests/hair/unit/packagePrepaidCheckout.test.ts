import assert from 'node:assert/strict';
import test from 'node:test';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { Basket } from '@/src/hair/domain/basket/types';
import {
  allocateEffectiveUnitValues,
  computePackageDiscount,
  computePackageNormalValuePaise,
} from '@/src/hair/domain/packages/economics';
import { buildAttributionPlan } from '@/src/hair/domain/basket/attribution';
import {
  formatPackagePurchaseInvoiceName,
  formatPackageRedemptionInvoiceName,
} from '@/src/hair/domain/packages/invoiceSnapshot';

test('15-wash package: normal ₹3000 offer ₹1500 → 50% discount', () => {
  const normal = computePackageNormalValuePaise([{ retailUnitPaise: 20_000, quantity: 15 }]);
  assert.equal(normal, 300_000);
  const d = computePackageDiscount(normal, 150_000);
  assert.equal(d.discountAmountPaise, 150_000);
  assert.equal(d.discountBps, 5000);
  assert.equal(d.discountPercentDisplay, 50);
});

test('multi-service package normal value sums independently', () => {
  const normal = computePackageNormalValuePaise([
    { retailUnitPaise: 20_000, quantity: 7 },
    { retailUnitPaise: 80_000, quantity: 7 },
    { retailUnitPaise: 50_000, quantity: 7 },
    { retailUnitPaise: 30_000, quantity: 7 },
  ]);
  assert.equal(normal, (20_000 + 80_000 + 50_000 + 30_000) * 7);
});

test('priceBasket: package redemption customer payable is ₹0 and cash revenue stays 0', () => {
  const basket: Basket = {
    customerId: 'c1',
    payments: [],
    flags: {},
    lines: [
      {
        lineId: 'r1',
        billableRef: { id: 'svc1', type: 'service' },
        snapshot: {
          name: 'Hair Wash',
          code: null,
          unitSellingPricePaise: 20_000,
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
          serviceId: 'svc1',
          packageName: 'Big Regular Hair Wash',
          effectiveUnitValuePaise: 10_000,
        },
      },
    ],
  };
  const priced = priceBasket(basket);
  assert.equal(priced.totals.grandTotalPaise, 0);
  assert.equal(priced.lines[0]!.finalLinePaise, 0);
  assert.equal(priced.attributions.length, 1);
  assert.equal(priced.attributions[0]!.attributedBasePaise, 10_000);
  assert.equal(priced.attributions[0]!.revenueMetric, 'service');
});

test('priceBasket: package purchase has revenue and zero performance attributions', () => {
  const basket: Basket = {
    customerId: 'c1',
    payments: [],
    flags: {},
    lines: [
      {
        lineId: 'p1',
        billableRef: { id: 'plan1', type: 'package' },
        snapshot: {
          name: 'Big Regular Hair Wash',
          code: null,
          unitSellingPricePaise: 150_000,
          gstBps: 0,
          staffMode: 'SALE',
          category: 'Package',
        },
        quantity: 1,
        overridePricePaise: null,
        staff: [],
      },
    ],
  };
  const priced = priceBasket(basket);
  assert.equal(priced.totals.grandTotalPaise, 150_000);
  assert.equal(priced.attributions.length, 0);
});

test('formatPackagePurchaseInvoiceName preserves economics text', () => {
  const name = formatPackagePurchaseInvoiceName({
    packageName: 'Big Regular Hair Wash',
    normalValuePaise: 300_000,
    offerPricePaise: 150_000,
    validityDays: null,
    includedServices: [{ serviceName: 'Hair Wash', quantity: 15 }],
  });
  assert.match(name, /Big Regular Hair Wash/);
  assert.match(name, /Hair Wash × 15/);
  assert.match(name, /Discount 50%/);
  assert.match(name, /Validity Forever/);
});

test('₹3000 / 15 Hair Wash package allocates ₹200 effective unit each', () => {
  const allocated = allocateEffectiveUnitValues(
    [{ serviceId: 'wash', quantity: 15, retailUnitPaise: 20_000 }],
    300_000,
  );
  assert.equal(allocated.length, 1);
  assert.equal(allocated[0]!.effectiveUnitPaise, 20_000);
});

test('redemption performance scales with qty at effective unit value', () => {
  const makeRedemptionLine = (qty: number, staffId: string) => ({
    lineId: `r-${qty}`,
    billableRef: { id: 'wash', type: 'service' as const },
    snapshot: {
      name: 'Hair Wash',
      code: null,
      unitSellingPricePaise: 20_000,
      gstBps: 1800,
      staffMode: 'SERVICE' as const,
      category: 'Package Redemption',
    },
    quantity: qty,
    catalogGrossPaise: 0,
    finalLinePaise: 0,
    discountPaise: 0,
    discountBps: 0,
    basePaise: 0,
    gstPaise: 0,
    staff: [{ staffId, shareBps: 10_000 }],
    serviceId: 'wash',
    productId: null,
    packageId: null,
    membershipId: null,
    primaryStaffId: staffId,
    prepaidRedemption: {
      kind: 'package_redemption' as const,
      customerPackageId: 'cp1',
      creditId: 'cr1',
      serviceId: 'wash',
      packageName: '15 Hair Wash',
      effectiveUnitValuePaise: 20_000,
    },
  });

  const one = buildAttributionPlan([makeRedemptionLine(1, 'staff-a')]);
  assert.equal(one.length, 1);
  assert.equal(one[0]!.attributedBasePaise, 20_000);
  assert.equal(one[0]!.staffId, 'staff-a');

  const two = buildAttributionPlan([makeRedemptionLine(2, 'staff-b')]);
  assert.equal(two.length, 1);
  assert.equal(two[0]!.attributedBasePaise, 40_000);
  assert.equal(two[0]!.staffId, 'staff-b');
});

test('formatPackageRedemptionInvoiceName marks prepaid ₹0', () => {
  const name = formatPackageRedemptionInvoiceName({
    serviceName: 'Hair Wash',
    packageName: 'Big Regular Hair Wash',
    quantity: 1,
  });
  assert.match(name, /Package Redemption/);
  assert.match(name, /Prepaid ₹0/);
});
