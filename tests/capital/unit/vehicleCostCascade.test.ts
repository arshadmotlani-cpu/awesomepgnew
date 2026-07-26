import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeTviFromCosts,
  summarizeVehicleCostBreakdown,
} from '../../../src/capital/lib/threeLedgers';

describe('vehicle cost cascade / TVI breakdown', () => {
  it('splits repair and refund from cost ledger rows', () => {
    const costs = [
      { amountPaise: 50_000_00, costType: 'broker_commission' },
      { amountPaise: 20_000_00, costType: 'repair_settlement' },
      { amountPaise: -5_000_00, costType: 'refund' },
      { amountPaise: 3_000_00, costType: 'fuel' },
    ];
    const breakdown = summarizeVehicleCostBreakdown(costs);
    assert.equal(breakdown.repairTotalPaise, 20_000_00);
    assert.equal(breakdown.dealerRefundTotalPaise, 5_000_00);
    assert.equal(breakdown.costsPaise, 50_000_00 + 20_000_00 - 5_000_00 + 3_000_00);

    const tvi = computeTviFromCosts({
      purchasePricePaise: 500_000_00,
      costs,
    });
    assert.equal(tvi.totalVehicleInvestmentPaise, 500_000_00 + breakdown.costsPaise);
  });

  it('ignores reversed rows in breakdown', () => {
    const breakdown = summarizeVehicleCostBreakdown([
      { amountPaise: 10_000_00, costType: 'repair_settlement', isReversed: true },
      { amountPaise: 2_000_00, costType: 'fuel' },
    ]);
    assert.equal(breakdown.repairTotalPaise, 0);
    assert.equal(breakdown.costsPaise, 2_000_00);
  });
});
