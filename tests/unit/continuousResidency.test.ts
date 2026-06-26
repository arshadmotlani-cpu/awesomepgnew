import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  CONTINUITY_MAX_GAP_DAYS,
  isWithinContinuityWindow,
} from '../../src/services/continuousResidency';

test('continuity window: same-day extension is continuous', () => {
  assert.equal(isWithinContinuityWindow('2026-06-23', '2026-06-23'), true);
});

test('continuity window: next-day extension is continuous', () => {
  assert.equal(isWithinContinuityWindow('2026-06-23', '2026-06-24'), true);
});

test('continuity window: two-day gap breaks continuity', () => {
  assert.equal(isWithinContinuityWindow('2026-06-23', '2026-06-25'), false);
});

test('continuity window: check-in before checkout is not continuous', () => {
  assert.equal(isWithinContinuityWindow('2026-06-23', '2026-06-22'), false);
});

test('CONTINUITY_MAX_GAP_DAYS is 1', () => {
  assert.equal(CONTINUITY_MAX_GAP_DAYS, 1);
});

test('Dhruv scenario: APG-0032 checkout Jun 23, APG-0036 check-in Jun 23', () => {
  assert.equal(isWithinContinuityWindow('2026-06-23', '2026-06-23'), true);
});

test('fixed stay extended by one day gap still continuous', () => {
  assert.equal(isWithinContinuityWindow('2026-06-30', '2026-07-01'), true);
});

test('monthly extension with 1-day gap is continuous', () => {
  assert.equal(isWithinContinuityWindow('2026-07-31', '2026-08-01'), true);
});

test('room transfer same PG next day is within window', () => {
  assert.equal(isWithinContinuityWindow('2026-06-15', '2026-06-16'), true);
});

test('bed transfer with same-day check-in is within window', () => {
  assert.equal(isWithinContinuityWindow('2026-06-15', '2026-06-15'), true);
});
