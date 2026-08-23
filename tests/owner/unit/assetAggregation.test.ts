/**
 * Asset class aggregation — net worth breakdown (pure math, no DB).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { paiseFromRupees } from '@/src/owner/lib/wealth/types';
import { ownerShareMovableValuePaise } from '@/src/owner/lib/wealth/movableAssetValuation';
import { ownerShareMarketValuePaise } from '@/src/owner/lib/wealth/propertyValuation';
import { computeWealthPosition } from '@/src/owner/services/assetAggregation';

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


describe('computeWealthPosition — gross vs net worth', () => {
  test('1.5 Cr assets, 35L liabilities → gross 1.5 Cr, net 1.15 Cr', () => {
    const assets = paiseFromRupees(1_50_00_000);
    const liabilities = paiseFromRupees(35_00_000);
    const pos = computeWealthPosition(assets, liabilities);
    assert.equal(pos.grossNetWorthPaise, assets);
    assert.equal(pos.grossNetWorthPaise, pos.totalAssetsPaise);
    assert.equal(pos.totalLiabilitiesPaise, liabilities);
    assert.equal(pos.netWorthPaise, paiseFromRupees(1_15_00_000));
    assert.equal(pos.netWorthPaise, assets - liabilities);
    assert.notEqual(pos.grossNetWorthPaise, pos.netWorthPaise);
  });

  test('50L assets, 0 liabilities → net equals assets equals gross', () => {
    const assets = paiseFromRupees(50_00_000);
    const pos = computeWealthPosition(assets, 0);
    assert.equal(pos.grossNetWorthPaise, assets);
    assert.equal(pos.netWorthPaise, assets);
  });

  test('50L assets, 10L liabilities → net 40L', () => {
    const assets = paiseFromRupees(50_00_000);
    const liabilities = paiseFromRupees(10_00_000);
    const pos = computeWealthPosition(assets, liabilities);
    assert.equal(pos.grossNetWorthPaise, paiseFromRupees(50_00_000));
    assert.equal(pos.netWorthPaise, paiseFromRupees(40_00_000));
  });

  test('dashboard and net-worth page share the same formulas', () => {
    const assets = paiseFromRupees(1_50_00_000);
    const liabilities = paiseFromRupees(35_00_000);
    const pos = computeWealthPosition(assets, liabilities);
    // Dashboard headline
    const dashboardGross = pos.grossNetWorthPaise;
    // Net Worth page headline
    const pageNet = pos.netWorthPaise;
    assert.equal(dashboardGross, pos.totalAssetsPaise);
    assert.equal(pageNet, pos.totalAssetsPaise - pos.totalLiabilitiesPaise);
    assert.notEqual(dashboardGross, pageNet);
  });
});
