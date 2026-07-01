import { strict as assert } from 'node:assert';
import test from 'node:test';
import { compareRoomBedOrder, sortByRoomBed } from '../../src/lib/billing/roomBedSort';

test('sortByRoomBed orders by room number then bed code', () => {
  const rows = [
    { roomNumber: '202', bedCode: 'B3', name: 'Angatra' },
    { roomNumber: '101', bedCode: 'B1', name: 'CV' },
    { roomNumber: '202', bedCode: 'B1', name: 'Anuj' },
    { roomNumber: '201', bedCode: 'B1', name: 'Dhairya' },
  ];
  const sorted = sortByRoomBed(rows);
  assert.deepEqual(
    sorted.map((r) => `${r.roomNumber}-${r.bedCode}`),
    ['101-B1', '201-B1', '202-B1', '202-B3'],
  );
});

test('compareRoomBedOrder handles numeric bed codes', () => {
  assert.ok(
    compareRoomBedOrder({ roomNumber: '203', bedCode: 'B2' }, { roomNumber: '203', bedCode: 'B10' }) <
      0,
  );
});
