import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SELECTABLE_ACTIVITY_TYPES,
  VEHICLE_ACTIVITY_TYPE_META,
  activityCostAmountPaise,
  computeRepairSettlement,
  computeTotalVehicleInvestment,
  sumPaymentMilestonesPaise,
} from '../../../src/capital/lib/activityTypes';

const INR = (r: number) => Math.round(r * 100);

describe('activity cost map (ADR-016 Option 2)', () => {
  it('payment milestones never hit vehicle cost', () => {
    assert.equal(activityCostAmountPaise('token_paid', INR(50_000)), 0);
    assert.equal(activityCostAmountPaise('purchase_payment', INR(10_00_000)), 0);
    assert.equal(activityCostAmountPaise('final_purchase_payment', INR(1_00_000)), 0);
    assert.equal(VEHICLE_ACTIVITY_TYPE_META.token_paid.costImpact, 'cash_only');
    assert.equal(VEHICLE_ACTIVITY_TYPE_META.purchase_payment.category, 'payment_milestone');
  });

  it('investment costs and repair settlement hit vehicle cost', () => {
    assert.equal(activityCostAmountPaise('broker_commission', INR(20_000)), INR(20_000));
    assert.equal(activityCostAmountPaise('transport', INR(5_000)), INR(5_000));
    assert.equal(activityCostAmountPaise('repair_settlement', INR(43_500)), INR(43_500));
    assert.equal(activityCostAmountPaise('rto', INR(12_000)), INR(12_000));
    assert.equal(activityCostAmountPaise('storage', INR(3_000)), INR(3_000));
  });

  it('repair advance and investor flows are cash-only (0 cost)', () => {
    assert.equal(activityCostAmountPaise('repair_advance', INR(25_000)), 0);
    assert.equal(activityCostAmountPaise('investor_contribution', INR(1_00_000)), 0);
    assert.equal(activityCostAmountPaise('note', null), 0);
    assert.equal(VEHICLE_ACTIVITY_TYPE_META.repair_advance.costImpact, 'cash_only');
  });

  it('TVI = purchase price only when milestones alone are recorded', () => {
    const tvi = computeTotalVehicleInvestment({
      purchasePricePaise: INR(8_00_000),
      activities: [
        { activityType: 'vehicle_created', amountPaise: null },
        { activityType: 'token_paid', amountPaise: INR(50_000) },
        { activityType: 'purchase_payment', amountPaise: INR(7_50_000) },
      ],
    });
    assert.equal(tvi.netVehicleCostPaise, INR(8_00_000));
    assert.equal(tvi.investmentCostsPaise, 0);
  });

  it('TVI adds broker + transport on top of purchase price', () => {
    const tvi = computeTotalVehicleInvestment({
      purchasePricePaise: INR(8_00_000),
      activities: [
        { activityType: 'token_paid', amountPaise: INR(50_000) },
        { activityType: 'purchase_payment', amountPaise: INR(7_50_000) },
        { activityType: 'broker_commission', amountPaise: INR(20_000) },
        { activityType: 'transport', amountPaise: INR(5_000) },
      ],
    });
    assert.equal(tvi.netVehicleCostPaise, INR(8_25_000));
  });

  it('repair settlement adds actual cost only; advance/return excluded', () => {
    const tvi = computeTotalVehicleInvestment({
      purchasePricePaise: INR(8_00_000),
      activities: [
        { activityType: 'repair_advance', amountPaise: INR(50_000) },
        { activityType: 'repair_settlement', amountPaise: INR(43_500) },
      ],
    });
    assert.equal(tvi.netVehicleCostPaise, INR(8_43_500));
  });

  it('refunds reduce investment costs', () => {
    const tvi = computeTotalVehicleInvestment({
      purchasePricePaise: INR(8_00_000),
      activities: [
        { activityType: 'transport', amountPaise: INR(10_000) },
        { activityType: 'transport', amountPaise: INR(-2_000) },
      ],
    });
    assert.equal(tvi.netVehicleCostPaise, INR(8_08_000));
    assert.equal(tvi.dealerRefundTotalPaise, INR(2_000));
  });

  it('sums payment milestones for progress tracking', () => {
    const paid = sumPaymentMilestonesPaise([
      { activityType: 'token_paid', amountPaise: INR(50_000) },
      { activityType: 'purchase_payment', amountPaise: INR(7_50_000) },
      { activityType: 'broker_commission', amountPaise: INR(20_000) },
    ]);
    assert.equal(paid, INR(8_00_000));
  });

  it('exposes selectable types for Add Activity', () => {
    assert.ok(SELECTABLE_ACTIVITY_TYPES.includes('token_paid'));
    assert.ok(SELECTABLE_ACTIVITY_TYPES.includes('final_purchase_payment'));
    assert.ok(SELECTABLE_ACTIVITY_TYPES.includes('rto'));
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
    assert.equal(s.additionalAmountRequiredPaise, 0);
  });

  it('tracks cash still held when settlement under-closes advance', () => {
    const s = computeRepairSettlement({
      advancePaise: INR(10_000),
      actualCostPaise: INR(6_000),
      returnedPaise: INR(2_000),
    });
    assert.equal(s.outstandingPaise, INR(2_000));
    assert.equal(s.cashStillHeldPaise, INR(2_000));
    assert.equal(s.additionalAmountRequiredPaise, 0);
  });

  it('surfaces additional amount when actual exceeds advance', () => {
    const s = computeRepairSettlement({
      advancePaise: INR(50_000),
      actualCostPaise: INR(57_000),
      returnedPaise: 0,
    });
    assert.equal(s.vehicleCostPaise, INR(57_000));
    assert.equal(s.additionalAmountRequiredPaise, INR(7_000));
    assert.equal(s.cashStillHeldPaise, 0);
    assert.equal(s.outstandingPaise, INR(-7_000));
  });
});
