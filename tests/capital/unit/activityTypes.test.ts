import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SELECTABLE_ACTIVITY_TYPES,
  VEHICLE_ACTIVITY_TYPE_META,
  activityCostAmountPaise,
  computeRepairSettlement,
  sumActivityNetVehicleCost,
} from '../../../src/capital/lib/activityTypes';

const INR = (r: number) => Math.round(r * 100);

describe('activity cost map', () => {
  it('token / purchase / repair settlement hit vehicle cost', () => {
    assert.equal(activityCostAmountPaise('token_paid', INR(50_000)), INR(50_000));
    assert.equal(activityCostAmountPaise('purchase_payment', INR(10_00_000)), INR(10_00_000));
    assert.equal(activityCostAmountPaise('repair_settlement', INR(20_000)), INR(20_000));
  });

  it('repair advance and investor flows are cash-only (0 cost)', () => {
    assert.equal(activityCostAmountPaise('repair_advance', INR(25_000)), 0);
    assert.equal(activityCostAmountPaise('investor_contribution', INR(1_00_000)), 0);
    assert.equal(activityCostAmountPaise('note', null), 0);
    assert.equal(VEHICLE_ACTIVITY_TYPE_META.repair_advance.costImpact, 'cash_only');
  });

  it('sums net vehicle cost from activities without purchase base', () => {
    const cost = sumActivityNetVehicleCost([
      { activityType: 'vehicle_created', amountPaise: null },
      { activityType: 'token_paid', amountPaise: INR(50_000) },
      { activityType: 'purchase_payment', amountPaise: INR(9_50_000) },
      { activityType: 'repair_advance', amountPaise: INR(30_000) },
      { activityType: 'repair_settlement', amountPaise: INR(22_000) },
      { activityType: 'miscellaneous', amountPaise: INR(-5_000) },
    ]);
    assert.equal(cost.netVehicleCostPaise, INR(50_000) + INR(9_50_000) + INR(22_000) - INR(5_000));
    assert.equal(cost.dealerRefundTotalPaise, INR(5_000));
  });

  it('exposes selectable types for Add Activity', () => {
    assert.ok(SELECTABLE_ACTIVITY_TYPES.includes('token_paid'));
    assert.ok(!SELECTABLE_ACTIVITY_TYPES.includes('vehicle_created'));
    assert.ok(!SELECTABLE_ACTIVITY_TYPES.includes('sale'));
  });
});

describe('repair settlement', () => {
  it('actual cost hits vehicle; returned restores float', () => {
    const s = computeRepairSettlement({
      advancePaise: INR(10_000),
      actualCostPaise: INR(7_000),
      returnedPaise: INR(3_000),
    });
    assert.equal(s.vehicleCostPaise, INR(7_000));
    assert.equal(s.outstandingPaise, 0);
    assert.equal(s.cashStillHeldPaise, 0);
  });

  it('tracks cash still held when settlement under-closes advance', () => {
    const s = computeRepairSettlement({
      advancePaise: INR(10_000),
      actualCostPaise: INR(6_000),
      returnedPaise: INR(2_000),
    });
    assert.equal(s.outstandingPaise, INR(2_000));
    assert.equal(s.cashStillHeldPaise, INR(2_000));
  });
});
