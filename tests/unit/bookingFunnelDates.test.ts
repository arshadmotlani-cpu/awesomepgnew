import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingFunnelDatesFromParams,
  bookingNewSearchParams,
  validateBookingFunnelDates,
} from '@/src/lib/booking/bookingFunnelDates';

test('fixed-date funnel preserves check-in, check-out, and nights', () => {
  const dates = bookingFunnelDatesFromParams({
    start: '2026-07-01',
    end: '2026-07-05',
    stayType: 'fixed_date_stay',
  });
  assert.equal(dates.start, '2026-07-01');
  assert.equal(dates.end, '2026-07-05');
  assert.equal(dates.stayNights, 4);
});

test('monthly funnel drops checkout date', () => {
  const dates = bookingFunnelDatesFromParams({
    start: '2026-07-01',
    end: '2026-07-31',
    stayType: 'monthly_stay',
  });
  assert.equal(dates.end, null);
  assert.equal(dates.stayNights, null);
});

test('edit-dates URL includes checkout for fixed stays', () => {
  const params = bookingNewSearchParams({
    bedIds: ['bed-uuid'],
    start: '2026-07-01',
    end: '2026-07-05',
    stayType: 'fixed_date_stay',
  });
  assert.equal(params.get('start'), '2026-07-01');
  assert.equal(params.get('end'), '2026-07-05');
  assert.equal(params.get('stayType'), 'fixed_date_stay');
  assert.equal(params.get('mode'), 'fixed_stay');
});

test('validateBookingFunnelDates blocks missing checkout on fixed stays', () => {
  const err = validateBookingFunnelDates({
    start: '2026-07-01',
    end: null,
    stayType: 'fixed_date_stay',
  });
  assert.ok(err);
});
