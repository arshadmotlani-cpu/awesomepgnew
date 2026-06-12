import assert from 'node:assert/strict';
import test from 'node:test';
import { maskEmail } from '../../src/lib/appUrl';
import {
  adminSessionExpiry,
  shouldRefreshAdminSession,
} from '../../src/lib/auth/adminSessionPolicy';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../src/lib/auth/crypto';

test('maskEmail hides most of the local part', () => {
  assert.equal(maskEmail('ops@awesomepg.in'), 'o••@awesomepg.in');
  assert.equal(maskEmail('a@example.com'), '•@example.com');
  assert.equal(maskEmail('ab@example.com'), 'a•@example.com');
});

test('admin password hashing round-trips', () => {
  const hash = hashPassword('long-enough-pass');
  assert.match(hash, /^scrypt:/);
  assert.equal(verifyPassword('long-enough-pass', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});

test('reset tokens are hashed consistently', () => {
  const token = randomToken();
  assert.equal(sha256(token), sha256(token));
  assert.notEqual(sha256(token), sha256(randomToken()));
});

test('shouldRefreshAdminSession when within refresh window', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const expiresSoon = new Date(now.getTime() + 2 * 86_400_000);
  const expiresLater = new Date(now.getTime() + 20 * 86_400_000);
  assert.equal(shouldRefreshAdminSession(expiresSoon, now), true);
  assert.equal(shouldRefreshAdminSession(expiresLater, now), false);
});

test('adminSessionExpiry respects remember me flag', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const standard = adminSessionExpiry(false, now);
  const remembered = adminSessionExpiry(true, now);
  assert.ok(remembered.getTime() > standard.getTime());
});
