import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  DEFAULT_VACATING_NOTICE_DAYS,
  defaultBillingMonth,
  defaultCheckOutDate,
  defaultExtensionUntilDate,
  defaultVacatingDate,
  normalizeBrowseStay,
} from '../../src/lib/dateDefaults';

test('normalizeBrowseStay fills missing params with today and +30 nights', () => {
  const stay = normalizeBrowseStay({});
  assert.match(stay.start, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(stay.end, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(stay.mode, 'open_ended');
  assert.ok(stay.end > stay.start);
});

test('defaultExtensionUntilDate is strictly after current checkout', () => {
  const until = defaultExtensionUntilDate('2026-06-01');
  assert.equal(until, '2026-06-08');
});

test('defaultVacatingDate is notice-compliant offset from today', () => {
  const from = '2026-06-01';
  const vacating = defaultVacatingDate(from);
  assert.equal(vacating, '2026-06-15');
  assert.equal(DEFAULT_VACATING_NOTICE_DAYS, 14);
});

test('defaultBillingMonth returns first of month', () => {
  assert.equal(defaultBillingMonth('2026-06-15'), '2026-06-01');
});

test('defaultCheckOutDate adds 30 nights', () => {
  assert.equal(defaultCheckOutDate('2026-01-01'), '2026-01-31');
});
