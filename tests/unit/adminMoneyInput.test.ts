import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  paiseFromRupeeInput,
  rupeesStringFromPaise,
  sanitizeRupeeInput,
} from '@/src/lib/admin/moneyInput';

describe('admin money input', () => {
  test('sanitizeRupeeInput strips non-digits for whole rupees', () => {
    assert.equal(sanitizeRupeeInput('₹4,121'), '4121');
    assert.equal(sanitizeRupeeInput('abc123def'), '123');
  });

  test('sanitizeRupeeInput allows optional decimals', () => {
    assert.equal(sanitizeRupeeInput('4121.50', { allowDecimal: true }), '4121.50');
    assert.equal(sanitizeRupeeInput('41.5.5', { allowDecimal: true }), '41.55');
  });

  test('paiseFromRupeeInput parses whole rupees', () => {
    assert.equal(paiseFromRupeeInput('4121'), 412_100);
    assert.equal(paiseFromRupeeInput(''), 0);
  });

  test('rupeesStringFromPaise formats whole rupees', () => {
    assert.equal(rupeesStringFromPaise(412_100), '4121');
  });
});
