import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isOnboardingBookingEligibleForBedAssignment,
  isResidentBedAssignmentEligible,
  isResidentBedAssignable,
} from '@/src/lib/residentBedAssignment';

test('isOnboardingBookingEligibleForBedAssignment accepts confirmed bookings', () => {
  assert.equal(
    isOnboardingBookingEligibleForBedAssignment({ bookingStatus: 'confirmed' }),
    true,
  );
});

test('isOnboardingBookingEligibleForBedAssignment accepts pending_approval with payment', () => {
  assert.equal(
    isOnboardingBookingEligibleForBedAssignment({
      bookingStatus: 'pending_approval',
      paymentApproved: true,
    }),
    true,
  );
  assert.equal(
    isOnboardingBookingEligibleForBedAssignment({
      bookingStatus: 'pending_approval',
      paymentApproved: false,
    }),
    false,
  );
});

test('isOnboardingBookingEligibleForBedAssignment rejects completed and cancelled bookings', () => {
  assert.equal(
    isOnboardingBookingEligibleForBedAssignment({ bookingStatus: 'completed' }),
    false,
  );
  assert.equal(
    isOnboardingBookingEligibleForBedAssignment({ bookingStatus: 'cancelled' }),
    false,
  );
  assert.equal(
    isOnboardingBookingEligibleForBedAssignment({ bookingStatus: 'pending_payment' }),
    false,
  );
});

test('former verified resident without onboarding booking is not bed-assignment eligible', () => {
  assert.equal(
    isResidentBedAssignable({ tenancyStatus: 'unassigned', bedId: null, bookingId: null }),
    true,
  );
  assert.equal(
    isResidentBedAssignmentEligible({
      tenancyStatus: 'unassigned',
      bedId: null,
      bookingId: null,
      onboardingBookingId: null,
      onboardingBookingStatus: null,
    }),
    false,
  );
});

test('confirmed onboarding booking without bed is bed-assignment eligible', () => {
  assert.equal(
    isResidentBedAssignmentEligible({
      tenancyStatus: 'unassigned',
      bedId: null,
      bookingId: null,
      onboardingBookingId: 'booking-1',
      onboardingBookingStatus: 'confirmed',
      onboardingPaymentApproved: true,
    }),
    true,
  );
});

test('vacated residents are never bed-assignment eligible', () => {
  assert.equal(
    isResidentBedAssignmentEligible({
      tenancyStatus: 'vacated',
      bedId: null,
      bookingId: null,
      onboardingBookingId: 'booking-1',
      onboardingBookingStatus: 'confirmed',
    }),
    false,
  );
});
