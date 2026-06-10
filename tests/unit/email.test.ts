import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmail, normaliseEmail } from '../../src/lib/email/address';

describe('normaliseEmail', () => {
  it('lowercases and trims valid addresses', () => {
    assert.equal(normaliseEmail('  Jane@Example.COM '), 'jane@example.com');
  });

  it('rejects invalid addresses', () => {
    assert.equal(normaliseEmail('not-an-email'), null);
    assert.equal(normaliseEmail(''), null);
  });
});

describe('isValidEmail', () => {
  it('matches normaliseEmail behaviour', () => {
    assert.equal(isValidEmail('user@awesomepg.local'), true);
    assert.equal(isValidEmail('bad'), false);
  });
});
