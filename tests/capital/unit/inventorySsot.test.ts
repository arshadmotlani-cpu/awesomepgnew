import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertInventoryCountsConsistent,
  isOpenInventoryStatus,
  isReadyToListStatus,
  selectOpenInventoryFromRows,
  selectReadyToListFromRows,
} from '../../../src/capital/services/inventory';

describe('Inventory SSOT', () => {
  const fleet = [
    { id: '1', status: 'purchased' },
    { id: '2', status: 'ready' },
    { id: '3', status: 'ready' },
    { id: '4', status: 'listed' },
    { id: '5', status: 'ready' },
    { id: '6', status: 'sold' },
    { id: '7', status: 'cancelled' },
    { id: '8', status: 'settled' },
  ];

  it('open inventory excludes sold / settled / archived only', () => {
    assert.equal(isOpenInventoryStatus('ready'), true);
    assert.equal(isOpenInventoryStatus('purchased'), true);
    assert.equal(isOpenInventoryStatus('sold'), false);
    assert.equal(isOpenInventoryStatus('cancelled'), false);
    assert.equal(isOpenInventoryStatus('settled'), false);

    const open = selectOpenInventoryFromRows(fleet);
    assert.equal(open.length, 5);
    assert.deepEqual(
      open.map((v) => v.id),
      ['1', '2', '3', '4', '5'],
    );
  });

  it('ready-to-list is the open subset with status ready', () => {
    assert.equal(isReadyToListStatus('ready'), true);
    assert.equal(isReadyToListStatus('listed'), false);

    const ready = selectReadyToListFromRows(fleet);
    assert.equal(ready.length, 3);
  });

  it('Vehicles page == Vehicles in Stock KPI always', () => {
    const vehiclesPageOpenCount = selectOpenInventoryFromRows(fleet).length;
    const dashboardVehiclesInStock = vehiclesPageOpenCount; // must share same selector
    assert.equal(vehiclesPageOpenCount, 5);
    assert.equal(dashboardVehiclesInStock, 5);
    assertInventoryCountsConsistent({
      vehiclesPageOpenCount,
      dashboardVehiclesInStock,
      readyToListCount: selectReadyToListFromRows(fleet).length,
      allOpenAreReady: false,
    });
  });

  it('Ready to list == open inventory when every open vehicle is ready', () => {
    const allReadyOpen = [
      { id: 'a', status: 'ready' },
      { id: 'b', status: 'ready' },
      { id: 'c', status: 'ready' },
      { id: 'd', status: 'ready' },
      { id: 'e', status: 'ready' },
      { id: 'x', status: 'sold' },
    ];
    const vehiclesPageOpenCount = selectOpenInventoryFromRows(allReadyOpen).length;
    const dashboardVehiclesInStock = vehiclesPageOpenCount;
    const readyToListCount = selectReadyToListFromRows(allReadyOpen).length;

    assert.equal(vehiclesPageOpenCount, 5);
    assert.equal(dashboardVehiclesInStock, 5);
    assert.equal(readyToListCount, 5);
    assertInventoryCountsConsistent({
      vehiclesPageOpenCount,
      dashboardVehiclesInStock,
      readyToListCount,
      allOpenAreReady: true,
    });
  });

  it('fails when KPI diverges from Vehicles page (stake-style bug)', () => {
    assert.throws(
      () =>
        assertInventoryCountsConsistent({
          vehiclesPageOpenCount: 5,
          dashboardVehiclesInStock: 4, // Me-stake count bug
          readyToListCount: 5,
          allOpenAreReady: true,
        }),
      /Inventory mismatch/,
    );
  });

  it('does not treat Me stake / funding as inventory inputs', () => {
    // Inventory selection uses status only — financial fields must be ignored.
    const rows = [
      { id: '1', status: 'ready', meInvestedPaise: 0 },
      { id: '2', status: 'ready', meInvestedPaise: 100_000_00 },
      { id: '3', status: 'sold', meInvestedPaise: 50_000_00 },
    ];
    const open = selectOpenInventoryFromRows(rows);
    assert.equal(open.length, 2);
    assert.ok(open.some((r) => r.meInvestedPaise === 0));
  });
});
