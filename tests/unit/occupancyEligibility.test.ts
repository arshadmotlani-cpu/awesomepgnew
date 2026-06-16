import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canCompleteCheckoutWithoutActiveStayToday,
  isBookingStatusEligibleForOccupancy,
  isReservationStatusEligibleForOccupancy,
  shouldShortenStayOnVacatingApproval,
} from '../../src/lib/occupancyEligibility';

test('isBookingStatusEligibleForOccupancy only allows confirmed', () => {
  assert.equal(isBookingStatusEligibleForOccupancy('confirmed'), true);
  assert.equal(isBookingStatusEligibleForOccupancy('completed'), false);
  assert.equal(isBookingStatusEligibleForOccupancy('pending_payment'), false);
});

test('isReservationStatusEligibleForOccupancy allows active and hold', () => {
  assert.equal(isReservationStatusEligibleForOccupancy('active'), true);
  assert.equal(isReservationStatusEligibleForOccupancy('hold'), true);
  assert.equal(isReservationStatusEligibleForOccupancy('completed'), false);
});

test('shouldShortenStayOnVacatingApproval skips same-day checkout', () => {
  assert.equal(shouldShortenStayOnVacatingApproval('2026-06-13', '2026-06-13'), false);
  assert.equal(shouldShortenStayOnVacatingApproval('2026-06-12', '2026-06-13'), false);
  assert.equal(shouldShortenStayOnVacatingApproval('2026-06-14', '2026-06-13'), true);
});

test('canCompleteCheckoutWithoutActiveStayToday when vacating date is today or past', () => {
  assert.equal(
    canCompleteCheckoutWithoutActiveStayToday({
      vacatingDate: '2026-06-13',
      vacatingStatus: 'approved',
      today: '2026-06-13',
    }),
    true,
  );
  assert.equal(
    canCompleteCheckoutWithoutActiveStayToday({
      vacatingDate: '2026-06-12',
      vacatingStatus: 'approved',
      today: '2026-06-13',
    }),
    true,
  );
  assert.equal(
    canCompleteCheckoutWithoutActiveStayToday({
      vacatingDate: '2026-06-20',
      vacatingStatus: 'approved',
      today: '2026-06-13',
    }),
    false,
  );
});
