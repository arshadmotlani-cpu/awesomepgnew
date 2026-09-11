import assert from 'node:assert/strict';
import test from 'node:test';
import type { BasketLine } from '@/src/hair/domain/basket/types';
import {
  computeDraftAvailableCredits,
  computePackageRedemptionUnitDiscount,
  formatPackageRedemptionDiscountLabel,
  sumDraftReservedQtyByCreditId,
  validateDraftRedemptionQty,
} from '@/src/hair/domain/packages/availableServices';

function prepaidLine(input: {
  creditId: string;
  serviceId: string;
  quantity: number;
}): BasketLine {
  return {
    lineId: `line-${input.creditId}-${input.quantity}`,
    billableRef: { id: input.serviceId, type: 'service' },
    snapshot: {
      name: 'Hair Wash',
      code: null,
      unitSellingPricePaise: 20_300,
      gstBps: 0,
      staffMode: 'SERVICE',
      category: 'Package Redemption',
    },
    quantity: input.quantity,
    overridePricePaise: 0,
    staff: [],
    prepaidRedemption: {
      kind: 'package_redemption',
      customerPackageId: 'cp-1',
      creditId: input.creditId,
      serviceId: input.serviceId,
      packageName: 'Wash Pack',
      effectiveUnitValuePaise: 20_300,
      retailUnitValuePaise: 55_000,
    },
  };
}

test('15 credits with 2 in basket shows 13 available', () => {
  const lines = [prepaidLine({ creditId: 'cred-1', serviceId: 'svc-wash', quantity: 2 })];
  const reserved = sumDraftReservedQtyByCreditId(lines);
  assert.equal(reserved['cred-1'], 2);
  const available = computeDraftAvailableCredits({
    persistedRemaining: 15,
    creditId: 'cred-1',
    draftReservedByCreditId: reserved,
  });
  assert.equal(available, 13);
});

test('adding one more in basket reduces available to 12', () => {
  const lines = [
    prepaidLine({ creditId: 'cred-1', serviceId: 'svc-wash', quantity: 2 }),
    prepaidLine({ creditId: 'cred-1', serviceId: 'svc-wash', quantity: 1 }),
  ];
  const reserved = sumDraftReservedQtyByCreditId(lines);
  assert.equal(reserved['cred-1'], 3);
  const available = computeDraftAvailableCredits({
    persistedRemaining: 15,
    creditId: 'cred-1',
    draftReservedByCreditId: reserved,
  });
  assert.equal(available, 12);
});

test('clearing basket restores full persisted availability', () => {
  const reserved = sumDraftReservedQtyByCreditId([]);
  const available = computeDraftAvailableCredits({
    persistedRemaining: 15,
    creditId: 'cred-1',
    draftReservedByCreditId: reserved,
  });
  assert.equal(available, 15);
});

test('same serviceId with distinct creditIds reserve independently', () => {
  const lines = [
    prepaidLine({ creditId: 'cred-a', serviceId: 'svc-wash', quantity: 2 }),
    prepaidLine({ creditId: 'cred-b', serviceId: 'svc-wash', quantity: 4 }),
  ];
  const reserved = sumDraftReservedQtyByCreditId(lines);
  assert.equal(
    computeDraftAvailableCredits({
      persistedRemaining: 10,
      creditId: 'cred-a',
      draftReservedByCreditId: reserved,
    }),
    8,
  );
  assert.equal(
    computeDraftAvailableCredits({
      persistedRemaining: 6,
      creditId: 'cred-b',
      draftReservedByCreditId: reserved,
    }),
    2,
  );
});

test('validateDraftRedemptionQty rejects over-available selection', () => {
  const reserved = sumDraftReservedQtyByCreditId([
    prepaidLine({ creditId: 'cred-1', serviceId: 'svc-wash', quantity: 2 }),
  ]);
  const result = validateDraftRedemptionQty({
    requestedQty: 14,
    persistedRemaining: 15,
    creditId: 'cred-1',
    draftReservedByCreditId: reserved,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /13/);
  }
});

test('package redemption discount percent: ₹550 retail vs ₹203 effective → 63.09% off', () => {
  const pct = computePackageRedemptionUnitDiscount(55_000, 20_300);
  assert.equal(pct, 63.09);
  assert.equal(formatPackageRedemptionDiscountLabel(pct), '63.09% off');
});
