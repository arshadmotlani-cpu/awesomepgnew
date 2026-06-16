import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDayAvailability,
  isCheckInAvailable,
  isCheckOutAvailable,
  pickStayRange,
} from '../../src/lib/stayDateSelection';

const reservations = [{ startDate: '2026-07-15', endDate: '2026-07-20' }];
const horizonEnd = '2026-08-01';

test('pickStayRange sets start on first click', () => {
  const can = () => true;
  const r = pickStayRange({ start: null, end: null }, '2026-07-10', can);
  assert.equal(r?.draft.start, '2026-07-10');
  assert.equal(r?.complete, false);
});

test('pickStayRange sets end on second click and completes', () => {
  const can = () => true;
  const r = pickStayRange({ start: '2026-07-10', end: null }, '2026-07-14', can);
  assert.equal(r?.draft.end, '2026-07-14');
  assert.equal(r?.complete, true);
});

test('pickStayRange restarts start when clicking before current start', () => {
  const can = () => true;
  const r = pickStayRange({ start: '2026-07-10', end: null }, '2026-07-05', can);
  assert.equal(r?.draft.start, '2026-07-05');
  assert.equal(r?.draft.end, null);
});

test('pickStayRange restarts range when already complete', () => {
  const can = () => true;
  const r = pickStayRange({ start: '2026-07-10', end: '2026-07-14' }, '2026-07-08', can);
  assert.equal(r?.draft.start, '2026-07-08');
  assert.equal(r?.draft.end, null);
});

test('isCheckOutAvailable respects reservation cap from check-in', () => {
  assert.equal(isCheckOutAvailable('2026-07-14', '2026-07-10', reservations, horizonEnd), true);
  assert.equal(isCheckOutAvailable('2026-07-19', '2026-07-10', reservations, horizonEnd), false);
  assert.equal(isCheckOutAvailable('2026-07-21', '2026-07-10', reservations, horizonEnd), false);
});

test('classifyDayAvailability marks reserved span', () => {
  const kind = classifyDayAvailability('2026-07-16', {
    earliestCheckIn: '2026-07-01',
    futureReservations: reservations,
    selectedCheckIn: '2026-07-10',
    horizonEnd,
  });
  assert.equal(kind, 'reserved');
});

test('isCheckInAvailable requires earliest check-in', () => {
  assert.equal(isCheckInAvailable('2026-06-30', reservations, '2026-07-01'), false);
  assert.equal(isCheckInAvailable('2026-07-05', reservations, '2026-07-01'), true);
});

test('isCheckInAvailable: distant future reservation does not block earlier check-in', () => {
  assert.equal(
    isCheckInAvailable('2026-06-01', [{ startDate: '2027-06-16', endDate: '2027-07-01' }], '2026-06-01'),
    true,
  );
});
