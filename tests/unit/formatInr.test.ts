/**
 * Indian currency formatting — unit tests.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  formatInrAmount,
  formatInrFromRupees,
  paiseToInr,
  parseInrAmountInput,
  formatPercent,
} from '@/src/lib/format';

describe('INR formatting', () => {
  test('formatInrAmount uses Indian grouping', () => {
    assert.equal(formatInrAmount(3300000), '33,00,000');
    assert.equal(formatInrAmount(500000), '5,00,000');
    assert.equal(formatInrAmount(12500000), '1,25,00,000');
    assert.equal(formatInrAmount(75000), '75,000');
  });

  test('paiseToInr formats with rupee symbol', () => {
    assert.equal(paiseToInr(330000000), '₹33,00,000');
    assert.equal(paiseToInr(331000000), '₹33,10,000');
  });

  test('parseInrAmountInput strips grouping', () => {
    assert.equal(parseInrAmountInput('33,00,000'), 3300000);
    assert.equal(parseInrAmountInput('₹33,10,000'), 3310000);
    assert.equal(parseInrAmountInput(''), 0);
  });

  test('formatPercent sensible precision', () => {
    assert.equal(formatPercent(8), '8%');
    assert.equal(formatPercent(8.5), '8.5%');
    assert.equal(formatPercent(30), '30%');
  });
});
