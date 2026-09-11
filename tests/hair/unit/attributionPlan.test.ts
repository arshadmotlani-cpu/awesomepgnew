import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAttributionPlan } from '../../../src/hair/domain/basket/attribution.ts';
import type { PricedLine } from '../../../src/hair/domain/basket/types.ts';
import { buildAttributionRows } from '../../../src/hair/lib/attributionMath.ts';

function pricedLine(
  type: PricedLine['billableRef']['type'],
  basePaise: number,
  staff: PricedLine['staff'],
): PricedLine {
  return {
    lineId: 'l1',
    billableRef: { id: 'ref1', type },
    snapshot: {
      name: 'Test',
      code: null,
      unitSellingPricePaise: basePaise,
      gstBps: 0,
      staffMode: type === 'service' ? 'SERVICE' : 'SALE',
      category: null,
    },
    quantity: 1,
    catalogGrossPaise: basePaise,
    finalLinePaise: basePaise,
    discountPaise: 0,
    discountBps: 0,
    basePaise,
    gstPaise: 0,
    staff,
    serviceId: type === 'service' ? 'ref1' : null,
    productId: type === 'product' ? 'ref1' : null,
    packageId: type === 'package' ? 'ref1' : null,
    membershipId: type === 'membership' ? 'ref1' : null,
    primaryStaffId: staff[0]?.staffId ?? null,
  };
}

test('buildAttributionPlan splits product revenue equally across staff', () => {
  const rows = buildAttributionPlan([
    pricedLine('product', 10_000, [
      { staffId: 's1', shareBps: 5000 },
      { staffId: 's2', shareBps: 5000 },
    ]),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.every((r) => r.role === 'sold_by'), true);
  assert.equal(rows.reduce((s, r) => s + r.attributedBasePaise, 0), 10_000);
});

test('buildAttributionPlan skips package purchase even with staff', () => {
  const rows = buildAttributionPlan([
    pricedLine('package', 20_000, [
      { staffId: 's1', shareBps: 5000 },
      { staffId: 's2', shareBps: 5000 },
    ]),
  ]);
  assert.equal(rows.length, 0);
});

test('buildAttributionPlan uses prepaid effective value for redemption performance', () => {
  const line = pricedLine('service', 0, [
    { staffId: 's1', shareBps: 5000 },
    { staffId: 's2', shareBps: 5000 },
  ]);
  line.basePaise = 0;
  line.finalLinePaise = 0;
  line.quantity = 2;
  line.prepaidRedemption = {
    kind: 'package_redemption',
    customerPackageId: 'pkg1',
    creditId: 'cred1',
    serviceId: 'ref1',
    packageName: 'Wash Pack',
    effectiveUnitValuePaise: 100_00,
    retailUnitValuePaise: 200_00,
  };
  const rows = buildAttributionPlan([line]);
  assert.equal(rows.length, 2);
  assert.equal(rows.every((r) => r.role === 'serviced_by'), true);
  assert.equal(rows.every((r) => r.revenueMetric === 'service'), true);
  assert.equal(rows.reduce((s, r) => s + r.attributedBasePaise, 0), 200_00);
});

test('buildAttributionRows splits multi-staff product via servicedBy legacy path', () => {
  const rows = buildAttributionRows({
    kind: 'product',
    lineNetPaise: 10_000,
    servicedBy: [{ staffId: 's1' }, { staffId: 's2' }],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((s, r) => s + r.attributedNetPaise, 0), 10_000);
});
