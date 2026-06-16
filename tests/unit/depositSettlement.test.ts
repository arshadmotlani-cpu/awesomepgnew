import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeRefundDeductions } from '../../src/lib/refundDeductions';

/**
 * Unit-level guardrails for deposit settlement balance logic.
 * Full concurrency/idempotency is enforced in depositSettlement.ts via
 * FOR UPDATE + deposit_settlements.idempotency_key (integration-tested separately).
 */
describe('deposit refund balance guards', () => {
  it('final refund never goes negative when deductions exceed balance', () => {
    const balancePaise = 1_000;
    const calc = computeRefundDeductions(balancePaise, {
      damageChargePaise: 2_000,
    });
    assert.equal(calc.finalRefundPaise, 0);
    assert.equal(calc.totalDeductionsPaise, 2_000);
  });

  it('balanced deductions sum to held deposit', () => {
    const balancePaise = 50_000;
    const calc = computeRefundDeductions(balancePaise, {
      damageChargePaise: 10_000,
      penaltyChargePaise: 5_000,
      electricityUnits: 10,
      electricityUnitCostPaise: 500,
    });
    assert.equal(calc.finalRefundPaise + calc.totalDeductionsPaise, balancePaise);
    assert.ok(calc.finalRefundPaise >= 0);
  });
});

describe('applyDepositDeduction input validation', () => {
  it('rejects non-positive deduction amounts', async () => {
    const { applyDepositDeduction } = await import('../../src/services/depositSettlement');
    const result = await applyDepositDeduction({
      bookingId: '00000000-0000-0000-0000-000000000001',
      customerId: '00000000-0000-0000-0000-000000000002',
      amountPaise: 0,
      reason: 'test',
    });
    assert.equal(result.ok, false);
  });
});

describe('settleDepositRefund input validation', () => {
  it('rejects negative refund amounts without touching the database', async () => {
    const { settleDepositRefund } = await import('../../src/services/depositSettlement');
    const result = await settleDepositRefund({
      bookingId: '00000000-0000-0000-0000-000000000001',
      customerId: '00000000-0000-0000-0000-000000000002',
      idempotencyKey: 'test:negative',
      source: 'manual',
      adminId: null,
      reason: 'test',
      refundPaise: -100,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /cannot be negative/i);
    }
  });
});
