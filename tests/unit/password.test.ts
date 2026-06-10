import { strict as assert } from 'node:assert';
import test from 'node:test';
import { validateAdminPassword } from '../../src/lib/auth/password';

test('validateAdminPassword rejects short passwords', () => {
  assert.equal(validateAdminPassword('short'), 'Password must be at least 12 characters.');
  assert.equal(validateAdminPassword(''), 'Password must be at least 12 characters.');
});

test('validateAdminPassword accepts 12+ characters', () => {
  assert.equal(validateAdminPassword('long-enough-pass'), null);
});
