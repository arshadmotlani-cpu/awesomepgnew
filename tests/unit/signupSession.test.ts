import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveSignupStep } from '../../src/lib/auth/signupSession';
import type { SignupSessionRow } from '../../src/db/schema';

function session(partial: Partial<SignupSessionRow> & Pick<SignupSessionRow, 'id' | 'email'>): SignupSessionRow {
  const now = new Date();
  return {
    id: partial.id,
    email: partial.email,
    fullName: partial.fullName ?? null,
    phone: partial.phone ?? null,
    otpVerified: partial.otpVerified ?? false,
    profileSubmitted: partial.profileSubmitted ?? false,
    status: partial.status ?? 'pending',
    expiresAt: partial.expiresAt ?? new Date(now.getTime() + 60_000),
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

describe('resolveSignupStep', () => {
  it('returns OTP when session missing or OTP not verified', () => {
    assert.equal(resolveSignupStep(null), 'OTP');
    assert.equal(
      resolveSignupStep(session({ id: '1', email: 'a@b.com', otpVerified: false })),
      'OTP',
    );
  });

  it('returns PROFILE after OTP verified', () => {
    assert.equal(
      resolveSignupStep(session({ id: '1', email: 'a@b.com', otpVerified: true })),
      'PROFILE',
    );
  });

  it('returns PASSWORD after profile submitted', () => {
    assert.equal(
      resolveSignupStep(
        session({
          id: '1',
          email: 'a@b.com',
          otpVerified: true,
          profileSubmitted: true,
        }),
      ),
      'PASSWORD',
    );
  });

  it('returns COMPLETED when account is complete', () => {
    assert.equal(
      resolveSignupStep(session({ id: '1', email: 'a@b.com', otpVerified: true, profileSubmitted: true }), {
        accountComplete: true,
      }),
      'COMPLETED',
    );
  });
});

describe('signup profile must not re-trigger OTP when session verified', () => {
  it('profile payload without code is valid when otpVerified is true', () => {
    const row = session({
      id: '1',
      email: 'a@b.com',
      otpVerified: true,
      profileSubmitted: false,
    });
    assert.equal(resolveSignupStep(row), 'PROFILE');
    assert.equal(row.otpVerified, true);
  });
});
