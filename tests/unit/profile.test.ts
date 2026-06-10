import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canCheckIn,
  isProfileComplete,
  profileFieldsSatisfied,
} from '../../src/services/profile';

describe('isProfileComplete', () => {
  it('returns true when profileCompletedAt is set', () => {
    assert.equal(
      isProfileComplete({
        fullName: 'A',
        email: 'bad',
        phone: '123',
        profileCompletedAt: new Date(),
      }),
      true,
    );
  });

  it('requires name, email, and mobile number', () => {
    const base = {
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+919876543210',
      profileCompletedAt: null,
    };
    assert.equal(isProfileComplete(base), true);
    assert.equal(isProfileComplete({ ...base, fullName: ' ' }), false);
    assert.equal(isProfileComplete({ ...base, email: 'not-an-email' }), false);
    assert.equal(isProfileComplete({ ...base, phone: '123' }), false);
  });
});

describe('profileFieldsSatisfied', () => {
  it('matches isProfileComplete when stamp is null', () => {
    const base = {
      fullName: 'Test User',
      email: 'user@example.com',
      phone: '+919876543210',
    };
    assert.equal(profileFieldsSatisfied(base), true);
    assert.equal(isProfileComplete({ ...base, profileCompletedAt: null }), true);
    assert.equal(
      isProfileComplete({ ...base, profileCompletedAt: new Date() }),
      true,
    );
  });
});

describe('canCheckIn', () => {
  it('only allows approved KYC', () => {
    assert.equal(canCheckIn({ kycStatus: 'approved' }), true);
    assert.equal(canCheckIn({ kycStatus: 'pending' }), false);
    assert.equal(canCheckIn({ kycStatus: 'rejected' }), false);
  });
});
