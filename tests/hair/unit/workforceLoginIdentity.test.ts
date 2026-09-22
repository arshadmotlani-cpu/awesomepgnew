import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isWorkforceAuthenticationIdentity,
  workforceEmployeeForAuthentication,
  workforceLoginExclusive,
} from '@/src/workforce/auth/identity';

const base = {
  canLogin: true,
  status: 'active' as const,
  passwordHash: 'scrypt:deadbeef:abcd',
};

test('valid workforce login identity is accepted', () => {
  assert.equal(isWorkforceAuthenticationIdentity(base), true);
  assert.deepEqual(workforceEmployeeForAuthentication({ ...base, email: 'a@b.co' } as never), {
    ...base,
    email: 'a@b.co',
  });
});

test('can_login=false workforce row is not an authentication identity', () => {
  const emp = { ...base, canLogin: false };
  assert.equal(isWorkforceAuthenticationIdentity(emp), false);
  assert.equal(workforceEmployeeForAuthentication(emp), null);
  assert.equal(workforceLoginExclusive(emp), false);
});

test('missing password hash is not an authentication identity', () => {
  const emp = { ...base, passwordHash: null };
  assert.equal(isWorkforceAuthenticationIdentity(emp), false);
  assert.equal(workforceEmployeeForAuthentication(emp), null);
});

test('empty password hash is not an authentication identity', () => {
  const emp = { ...base, passwordHash: '   ' };
  assert.equal(isWorkforceAuthenticationIdentity(emp), false);
});

test('inactive workforce login account cannot authenticate', () => {
  const emp = { ...base, status: 'inactive' as const };
  assert.equal(isWorkforceAuthenticationIdentity(emp), false);
  assert.equal(workforceEmployeeForAuthentication(emp), null);
});

test('non-login workforce match does not block legacy admin (exclusive gate off)', () => {
  const posOnly = { ...base, canLogin: false, passwordHash: null };
  assert.equal(workforceEmployeeForAuthentication(posOnly), null);
  assert.equal(workforceLoginExclusive(posOnly), false);
});

test('valid workforce match blocks legacy fallback for same login id', () => {
  assert.equal(workforceLoginExclusive(base), true);
});

test('invalid workforce password path keeps exclusive gate when identity valid', () => {
  const emp = workforceEmployeeForAuthentication(base);
  assert.ok(emp);
  assert.equal(workforceLoginExclusive(emp), true);
});
