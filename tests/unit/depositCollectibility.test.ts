import assert from 'node:assert/strict';
import test from 'node:test';
import {
  depositRemainingDuePaise,
  isDepositDue,
} from '../../src/lib/deposits/depositCollectibility.ts';

test('isDepositDue when required exceeds wallet', () => {
  assert.equal(isDepositDue(500_000, 0), true);
  assert.equal(isDepositDue(500_000, 200_000), true);
  assert.equal(isDepositDue(500_000, 500_000), false);
  assert.equal(depositRemainingDuePaise(500_000, 200_000), 300_000);
});

test('isDepositDue false when required is zero', () => {
  assert.equal(isDepositDue(0, 0), false);
});
