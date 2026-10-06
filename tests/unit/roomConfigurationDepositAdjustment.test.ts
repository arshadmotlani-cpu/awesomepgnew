import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeRoomConfigurationDepositAdjustment,
  shouldApplyRoomConfigurationDepositAdjustment,
} from '@/src/lib/deposits/roomConfigurationDepositAdjustment';
import { computeRoomConfigurationUnusedRentCreditPaise } from '@/src/lib/deposits/roomConfigurationRentCredit';

test('deposit decrease: collected exceeds new requirement → due 0, excess refundable', () => {
  const adj = computeRoomConfigurationDepositAdjustment({
    newRequiredDepositPaise: 360_570,
    collectedDepositPaise: 412_080,
  });
  assert.equal(adj.depositDuePaise, 0);
  assert.equal(adj.depositPaise, 360_570);
  assert.equal(adj.excessRefundableDepositPaise, 51_510);
});

test('deposit increase: due is top-up only', () => {
  const adj = computeRoomConfigurationDepositAdjustment({
    newRequiredDepositPaise: 550_000,
    collectedDepositPaise: 412_080,
  });
  assert.equal(adj.depositDuePaise, 137_920);
  assert.equal(adj.excessRefundableDepositPaise, 0);
});

test('legacy skip would miss cheaper configuration (Sagar-shaped numbers)', () => {
  const previousRequired = 550_000;
  const collected = 412_080;
  const newRequired = 360_570;
  assert.equal(newRequired <= previousRequired, true);
  assert.ok(
    shouldApplyRoomConfigurationDepositAdjustment({
      newRequiredDepositPaise: newRequired,
      previousRequiredDepositPaise: previousRequired,
      collectedDepositPaise: collected,
    }),
  );
});

test('unused rent credit when month paid and rate drops mid-cycle', () => {
  const credit = computeRoomConfigurationUnusedRentCreditPaise({
    effectiveFrom: '2026-10-15',
    oldMonthlyRentPaise: 550_000,
    newMonthlyRentPaise: 360_600,
    currentMonthRentIsPaid: true,
  });
  assert.ok(credit > 0);
});

test('no rent credit when new rate is higher', () => {
  assert.equal(
    computeRoomConfigurationUnusedRentCreditPaise({
      effectiveFrom: '2026-10-15',
      oldMonthlyRentPaise: 360_600,
      newMonthlyRentPaise: 550_000,
      currentMonthRentIsPaid: true,
    }),
    0,
  );
});

test('no rent credit when billing month rent not paid', () => {
  assert.equal(
    computeRoomConfigurationUnusedRentCreditPaise({
      effectiveFrom: '2026-10-15',
      oldMonthlyRentPaise: 550_000,
      newMonthlyRentPaise: 360_600,
      currentMonthRentIsPaid: false,
    }),
    0,
  );
});
