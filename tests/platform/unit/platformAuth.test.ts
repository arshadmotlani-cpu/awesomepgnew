import assert from 'node:assert/strict';
import test from 'node:test';
import { PLATFORM_SESSION_COOKIE } from '@/src/platform/lib/auth/constants';
import { platformSessionExpiry } from '@/src/platform/lib/auth/sessionPolicy';

test('platform session cookie name is stable', () => {
  assert.equal(PLATFORM_SESSION_COOKIE, 'apg_platform_session');
});

test('platform session expiry respects remember-me duration', () => {
  const short = platformSessionExpiry(false);
  const long = platformSessionExpiry(true);
  assert.ok(long.getTime() > short.getTime());
  assert.ok(short.getTime() > Date.now());
});
