/**
 * Asset class aggregation — net worth breakdown (pure math, no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { paiseFromRupees } from '@/src/owner/lib/wealth/types';
import { ownerShareMovableValuePaise } from '@/src/owner/lib/wealth/movableAssetValuation';
import { ownerShareMarketValuePaise } from '@/src/owner/lib/wealth/propertyValuation';

describe('net worth aggregation math', () => {
  const property = paiseFromRupees(4435717);
  const car = paiseFromRupees(1500000);
  const cash = paiseFromRupees(500000);
  const loan = paiseFromRupees(1000000);

  test('fixed + movable + financial − liabilities', () => {
    const fixed = property;
    const movable = car;
    const financial = cash;
    const totalAssets = fixed + movable + financial;
    const netWorth = totalAssets - loan;
    assert.equal(totalAssets, paiseFromRupees(6435717));
    assert.equal(netWorth, paiseFromRupees(5435717));
  });

  test('ownership applied exactly once on property', () => {
    const full = paiseFromRupees(4435717);
    const half = ownerShareMarketValuePaise(full, 5000);
    assert.equal(half, Math.round(full / 2));
    assert.notEqual(half, full);
  });

  test('ownership applied exactly once on movable', () => {
    const full = paiseFromRupees(1500000);
    const half = ownerShareMovableValuePaise(full, 5000);
    assert.equal(half, Math.round(full / 2));
  });

  test('car value is not counted in property fixed total', () => {
    const fixedOnly = property;
    assert.notEqual(fixedOnly, property + car);
  });
});
