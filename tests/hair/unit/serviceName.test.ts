import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalServiceName,
  normalizeServiceName,
} from '../../../src/hair/lib/serviceName.ts';

test('normalizeServiceName treats spacing and case as equivalent', () => {
  assert.equal(
    normalizeServiceName('Premium Hair Trimming'),
    normalizeServiceName(' premium hair trimming '),
  );
  assert.equal(normalizeServiceName('PREMIUM HAIR TRIMMING'), normalizeServiceName('Premium  Hair   Trimming'));
});

test('canonicalServiceName collapses whitespace', () => {
  assert.equal(canonicalServiceName('  Foo   Bar  '), 'Foo Bar');
});
