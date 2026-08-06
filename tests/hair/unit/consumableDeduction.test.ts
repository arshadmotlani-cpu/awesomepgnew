import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConsumableDeductInventory } from '../../../src/hair/lib/consumableDeduction.ts';

test('resolveConsumableDeductInventory preserves previous flag when explicit omitted', () => {
  const prev = new Map([['p1', true], ['p2', false]]);
  assert.equal(
    resolveConsumableDeductInventory({
      productId: 'p1',
      previousByProduct: prev,
    }),
    true,
  );
  assert.equal(
    resolveConsumableDeductInventory({
      productId: 'p2',
      previousByProduct: prev,
    }),
    false,
  );
});

test('resolveConsumableDeductInventory honors explicit form value over previous', () => {
  const prev = new Map([['p1', true]]);
  assert.equal(
    resolveConsumableDeductInventory({
      productId: 'p1',
      explicit: false,
      previousByProduct: prev,
    }),
    false,
  );
});

test('resolveConsumableDeductInventory defaults new professional products', () => {
  assert.equal(
    resolveConsumableDeductInventory({
      productId: 'new',
      previousByProduct: new Map(),
      productIsProfessional: true,
    }),
    true,
  );
  assert.equal(
    resolveConsumableDeductInventory({
      productId: 'new',
      previousByProduct: new Map(),
      productIsProfessional: false,
    }),
    false,
  );
});
