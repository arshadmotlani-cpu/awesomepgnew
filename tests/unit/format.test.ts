import { strict as assert } from 'node:assert';
import test from 'node:test';
import { asPlainNumber, coerceNonNegativePaise, paiseToInr } from '../../src/lib/format';

test('asPlainNumber coerces bigint and numeric strings', () => {
  assert.equal(asPlainNumber(42), 42);
  assert.equal(asPlainNumber(42n), 42);
  assert.equal(asPlainNumber('1250'), 1250);
  assert.equal(asPlainNumber(null), 0);
});

test('coerceNonNegativePaise clamps invalid values', () => {
  assert.equal(coerceNonNegativePaise(-5), 0);
  assert.equal(coerceNonNegativePaise(NaN), 0);
});

test('paiseToInr accepts bigint paise from SQL drivers', () => {
  assert.equal(paiseToInr(125000n), '₹1,250');
});
