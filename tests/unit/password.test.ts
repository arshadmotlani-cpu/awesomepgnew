import { strict as assert } from 'node:assert';
import test from 'node:test';
import { validateAdminPassword, validateCustomerPassword } from '../../src/lib/auth/password';

test('validateAdminPassword rejects short passwords', () => {
  assert.equal(validateAdminPassword('short'), 'Password must be at least 12 characters.');
  assert.equal(validateAdminPassword(''), 'Password must be at least 12 characters.');
});

test('validateAdminPassword accepts 12+ characters', () => {
  assert.equal(validateAdminPassword('long-enough-pass'), null);
});

test('validateCustomerPassword rejects short passwords', () => {
  assert.equal(validateCustomerPassword('short'), 'Password must be at least 8 characters.');
});

test('validateCustomerPassword accepts 8+ characters', () => {
  assert.equal(validateCustomerPassword('long-enough'), null);
});
