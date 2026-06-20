import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveResidencyJourney } from '../../src/lib/residents/residencyJourney';

describe('residency journey v2', () => {
  it('routes new users to browse PGs', () => {
    const j = deriveResidencyJourney({
      profileComplete: true,
      kycStatus: 'approved',
      hasConfirmedBooking: false,
      depositPaid: false,
      isActiveStay: false,
      residencyStatus: 'pending',
      depositOutstandingPaise: 0,
    });
    assert.equal(j.nextActionLabel, 'Browse PGs to book');
    assert.equal(j.waitingFor, 'Bed confirmation');
  });

  it('marks checked-in residents', () => {
    const j = deriveResidencyJourney({
      profileComplete: true,
      kycStatus: 'approved',
      hasConfirmedBooking: true,
      depositPaid: true,
      isActiveStay: true,
      residencyStatus: 'active',
      depositOutstandingPaise: 0,
    });
    assert.equal(j.residentStatusLabel, 'Checked-in');
    assert.equal(j.steps[4]!.status, 'done');
  });

  it('locks active stay until deposit paid', () => {
    const j = deriveResidencyJourney({
      profileComplete: true,
      kycStatus: 'approved',
      hasConfirmedBooking: true,
      depositPaid: false,
      isActiveStay: false,
      residencyStatus: 'pending',
      depositOutstandingPaise: 500000,
    });
    assert.equal(j.steps[3]!.status, 'pending');
    assert.equal(j.steps[4]!.status, 'locked');
    assert.equal(j.residentStatusLabel, 'Pending deposit');
  });
});
