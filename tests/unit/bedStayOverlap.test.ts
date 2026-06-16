import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findOverlappingReservations,
  isStayRangeAvailable,
  maxCheckoutBeforeOverlap,
  stayRangesOverlap,
} from '../../src/lib/bedStayOverlap';
import { validateStayAgainstReservations } from '../../src/lib/bedAvailabilityWindows';

const futureReservation = [{ startDate: '2027-06-16', endDate: '2027-07-01' }];

test('stayRangesOverlap: half-open ranges', () => {
  assert.equal(
    stayRangesOverlap('2026-06-01', '2026-06-08', '2027-06-16', '2027-07-01'),
    false,
  );
  assert.equal(
    stayRangesOverlap('2026-06-01', '2026-06-08', '2026-06-05', '2026-06-10'),
    true,
  );
  assert.equal(
    stayRangesOverlap('2026-06-10', '2026-06-15', '2026-06-05', '2026-06-10'),
    false,
  );
});

test('isStayRangeAvailable: unrelated future reservation does not block', () => {
  assert.equal(
    isStayRangeAvailable('2026-06-01', '2026-06-08', futureReservation),
    true,
  );
});

test('maxCheckoutBeforeOverlap: cap only when stay would cross reservation', () => {
  const cap = maxCheckoutBeforeOverlap('2026-06-01', futureReservation, '2028-01-01');
  assert.equal(cap, '2027-06-16');

  const shortCap = maxCheckoutBeforeOverlap('2026-06-01', futureReservation, '2026-12-31');
  assert.equal(shortCap, '2026-12-31');
});

test('validateStayAgainstReservations: no warning path when selected range is clear', () => {
  const result = validateStayAgainstReservations(
    '2026-06-01',
    '2026-06-08',
    futureReservation,
    '2028-01-01',
  );
  assert.equal(result.ok, true);
});

test('validateStayAgainstReservations: rejects overlapping selected range', () => {
  const overlap = findOverlappingReservations(
    '2026-06-01',
    '2026-06-20',
    [{ startDate: '2026-06-10', endDate: '2026-06-15' }],
  );
  assert.equal(overlap.length, 1);

  const result = validateStayAgainstReservations(
    '2026-06-01',
    '2026-06-20',
    [{ startDate: '2026-06-10', endDate: '2026-06-15' }],
    '2028-01-01',
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'no_window');
});

test('validateStayAgainstReservations: rejects checkout past cap before next reservation', () => {
  const result = validateStayAgainstReservations(
    '2027-05-01',
    '2027-06-17',
    futureReservation,
    '2028-01-01',
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'no_window');
});

test('validateStayAgainstReservations: rejects stay extending past horizon', () => {
  const result = validateStayAgainstReservations(
    '2026-06-01',
    '2026-06-10',
    [],
    '2026-06-08',
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'exceeds_cap');
    assert.equal(result.maxCheckout, '2026-06-08');
  }
});
