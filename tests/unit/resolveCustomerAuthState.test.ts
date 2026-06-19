import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { preferLoginScreen } from '../../src/lib/auth/resolveCustomerAuthState';

describe('preferLoginScreen', () => {
  it('defaults to login when snapshot is null', () => {
    assert.equal(preferLoginScreen(null), true);
  });

  it('requires login for existing complete accounts', () => {
    assert.equal(
      preferLoginScreen({
        kind: 'existing_complete',
        email: 'a@b.com',
        shouldLogin: true,
        shouldSignup: false,
      }),
      true,
    );
  });

  it('requires login when account has a password', () => {
    assert.equal(
      preferLoginScreen({
        kind: 'existing_incomplete',
        email: 'a@b.com',
        shouldLogin: true,
        shouldSignup: false,
      }),
      true,
    );
  });

  it('allows signup for new emails', () => {
    assert.equal(
      preferLoginScreen({
        kind: 'new',
        email: 'a@b.com',
        shouldLogin: false,
        shouldSignup: true,
      }),
      false,
    );
  });
});
