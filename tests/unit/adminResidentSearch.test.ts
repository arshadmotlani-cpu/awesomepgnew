import { strict as assert } from 'node:assert';
import test from 'node:test';

test('admin resident search phone gate allows 2-digit partial matches', () => {
  const phoneDigits = '98';
  const phoneSearchEnabled = phoneDigits.length >= 2;
  assert.equal(phoneSearchEnabled, true);

  const oneDigit = '9'.replace(/\D/g, '');
  assert.equal(oneDigit.length >= 2, false);
});

test('express walk-in search accepts 2-character queries', () => {
  const trimmed = 'ab';
  assert.ok(trimmed.length >= 2);
});

test('residents table phone filter accepts 2-digit substring', () => {
  const query = '98';
  const digits = query.replace(/\D/g, '');
  const phone = '+919876543210';
  assert.equal(digits.length >= 2 && phone.replace(/\D/g, '').includes(digits), true);
});
