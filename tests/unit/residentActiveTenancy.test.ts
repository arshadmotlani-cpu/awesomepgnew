import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveTenancyStatus } from '@/src/lib/residentActiveTenancy';
import {
  isResidentBedAssigned,
  isResidentBedAssignable,
} from '@/src/lib/residentBedAssignment';

test('deriveTenancyStatus prioritizes active reservation over vacated residency flag', () => {
  assert.equal(
    deriveTenancyStatus({
      residencyStatus: 'vacated',
      activeTenancy: { bookingId: 'b1', isVacating: false },
    }),
    'active',
  );
});

test('deriveTenancyStatus marks vacating when reservation has open vacating request', () => {
  assert.equal(
    deriveTenancyStatus({
      residencyStatus: 'active',
      activeTenancy: { bookingId: 'b1', isVacating: true },
    }),
    'vacating',
  );
});

test('deriveTenancyStatus returns unassigned only when no active reservation exists', () => {
  assert.equal(
    deriveTenancyStatus({
      residencyStatus: 'active',
      activeTenancy: null,
    }),
    'unassigned',
  );
});

test('deriveTenancyStatus infers vacated for completed former resident without active bed', () => {
  assert.equal(
    deriveTenancyStatus({
      residencyStatus: 'active',
      activeTenancy: null,
      hasCompletedTenancy: true,
    }),
    'vacated',
  );
});

test('deriveTenancyStatus returns vacated when residency is vacated and no active reservation', () => {
  assert.equal(
    deriveTenancyStatus({
      residencyStatus: 'vacated',
      activeTenancy: null,
    }),
    'vacated',
  );
});

test('isResidentBedAssigned uses bedId + bookingId as canonical assignment', () => {
  assert.equal(
    isResidentBedAssigned({
      tenancyStatus: 'unassigned',
      bedId: 'bed-1',
      bookingId: 'booking-1',
    }),
    true,
  );
});

test('isResidentBedAssignable is false when bed is assigned', () => {
  assert.equal(
    isResidentBedAssignable({
      tenancyStatus: 'active',
      bedId: 'bed-1',
      bookingId: 'booking-1',
    }),
    false,
  );
});

test('deriveTenancyStatus treats bedId as assigned even without booking id in status input', () => {
  assert.equal(
    deriveTenancyStatus({
      activeTenancy: null,
      bedId: 'bed-1',
    }),
    'active',
  );
});
