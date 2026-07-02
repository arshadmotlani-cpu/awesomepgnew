import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUTH_INTEGRITY_CHECK_TYPES,
  type AuthIntegrityCheckType,
} from '../../src/services/authIntegrityCheck';
import { maskEmailForDisplay, parseLoginIdentifier } from '../../src/lib/auth/loginIdentifier';

describe('AUTH_INTEGRITY_CHECK_TYPES', () => {
  it('includes all production detector classes', () => {
    const expected: AuthIntegrityCheckType[] = [
      'DUPLICATE_PHONE',
      'DUPLICATE_EMAIL',
      'PHONE_EMAIL_SPLIT',
      'ORPHAN_INCOMPLETE_WITH_BOOKING',
      'BOOKING_WITHOUT_CUSTOMER',
      'INCOMPLETE_WITH_PASSWORD',
      'SIGNUP_SESSION_CONFLICT',
      'PHONE_LOOKUP_EMAIL_MISMATCH',
      'ORPHAN_KYC',
      'ORPHAN_WALLET',
    ];
    assert.deepEqual([...AUTH_INTEGRITY_CHECK_TYPES], expected);
  });
});

describe('auth login identifier SSOT', () => {
  it('phone and email identifiers normalise to comparable values', () => {
    const phone = parseLoginIdentifier('9876543210');
    const email = parseLoginIdentifier('resident@example.com');
    assert.equal(phone?.kind, 'phone');
    assert.equal(email?.kind, 'email');
    assert.equal(phone?.value, '+919876543210');
    assert.equal(email?.value, 'resident@example.com');
  });

  it('forgot-password masking never exposes full local part', () => {
    const masked = maskEmailForDisplay('harshal.patel@gmail.com');
    assert.equal(masked, 'h******@gmail.com');
    assert.doesNotMatch(masked, /harshal/);
  });
});
