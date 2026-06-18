import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveTenancyStatus } from '@/src/lib/residentActiveTenancy';

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

test('deriveTenancyStatus returns vacated when residency is vacated and no active reservation', () => {
  assert.equal(
    deriveTenancyStatus({
      residencyStatus: 'vacated',
      activeTenancy: null,
    }),
    'vacated',
  );
});
