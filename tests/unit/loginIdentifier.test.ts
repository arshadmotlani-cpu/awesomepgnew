import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  maskEmailForDisplay,
  parseLoginIdentifier,
} from '../../src/lib/auth/loginIdentifier';

describe('parseLoginIdentifier', () => {
  it('detects email when input contains @', () => {
    const parsed = parseLoginIdentifier('Abc@Gmail.com');
    assert.equal(parsed?.kind, 'email');
    assert.equal(parsed?.value, 'abc@gmail.com');
  });

  it('detects phone for 10-digit Indian mobile', () => {
    const parsed = parseLoginIdentifier('9876543210');
    assert.equal(parsed?.kind, 'phone');
    assert.equal(parsed?.value, '+919876543210');
  });

  it('returns null for empty input', () => {
    assert.equal(parseLoginIdentifier(''), null);
  });
});

describe('maskEmailForDisplay', () => {
  it('masks local part without revealing full email', () => {
    assert.equal(maskEmailForDisplay('abc@gmail.com'), 'a******@gmail.com');
  });

  it('never returns the full address', () => {
    const masked = maskEmailForDisplay('secret.person@example.com');
    assert.doesNotMatch(masked, /secret\.person/);
    assert.match(masked, /@example\.com$/);
  });
});
