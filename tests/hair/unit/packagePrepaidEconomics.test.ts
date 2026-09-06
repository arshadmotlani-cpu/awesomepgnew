import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allocateEffectiveUnitValues,
  computePackageDiscount,
  computePackageNormalValuePaise,
} from '@/src/hair/domain/packages/economics';
import {
  buildRedemptionBasketLine,
  clampRedemptionQty,
} from '@/src/hair/domain/packages/availableServices';

test('computePackageNormalValuePaise sums retail × quantity', () => {
  assert.equal(
    computePackageNormalValuePaise([
      { retailUnitPaise: 50_000, quantity: 2 },
      { retailUnitPaise: 30_000, quantity: 1 },
    ]),
    130_000,
  );
});

test('computePackageDiscount uses basis points against normal value', () => {
  const d = computePackageDiscount(100_000, 70_000);
  assert.equal(d.discountAmountPaise, 30_000);
  assert.equal(d.discountBps, 3000);
  assert.equal(d.discountPercentDisplay, 30);
});

test('allocateEffectiveUnitValues preserves offer total with largest remainder', () => {
  const allocated = allocateEffectiveUnitValues(
    [
      { serviceId: 'a', quantity: 2, retailUnitPaise: 50_000 },
      { serviceId: 'b', quantity: 1, retailUnitPaise: 30_000 },
    ],
    70_000,
  );
  const sum = allocated.reduce((s, row) => s + row.allocatedTotalPaise, 0);
  assert.equal(sum, 70_000);
  assert.equal(allocated[0]!.effectiveUnitPaise, Math.floor(allocated[0]!.allocatedTotalPaise / 2));
  assert.equal(allocated[1]!.effectiveUnitPaise, allocated[1]!.allocatedTotalPaise);
});

test('clampRedemptionQty never exceeds remaining', () => {
  assert.equal(clampRedemptionQty(5, 3), 3);
  assert.equal(clampRedemptionQty(0, 3), 0);
  assert.equal(clampRedemptionQty(2, 0), 0);
});

test('buildRedemptionBasketLine returns ₹0 cash prepaid meta', () => {
  const meta = buildRedemptionBasketLine({
    requestedQuantity: 2,
    credit: {
      creditId: 'c1',
      customerPackageId: 'p1',
      packageName: null,
      serviceId: 's1',
      serviceName: 'Cut',
      remainingCredits: 5,
      effectiveUnitValuePaise: 12_500,
      expiresOn: null,
    },
  });
  assert.deepEqual(meta, {
    creditId: 'c1',
    customerPackageId: 'p1',
    serviceId: 's1',
    quantity: 2,
    effectiveValuePaise: 25_000,
    cashPaise: 0,
  });
});
