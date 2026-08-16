import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ownershipSharePaise } from '@/src/owner/lib/wealth/types';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';
import { propertyBasisPaise } from '@/src/owner/lib/wealth/propertyValuation';

describe('owner wealth paise coercion', () => {
  test('coerceWealthPaise converts bigint from PostgreSQL', () => {
    assert.equal(coerceWealthPaise(BigInt(412080)), 412080);
    assert.equal(coerceWealthPaise('360570'), 360570);
  });

  test('ownershipSharePaise does not throw on bigint inputs', () => {
    const share = ownershipSharePaise(BigInt(120_000_00), BigInt(10000));
    assert.equal(share, 120_000_00);
  });

  test('propertyBasisPaise sums coerced purchase fields', () => {
    const basis = propertyBasisPaise({
      purchasePricePaise: BigInt(100_000_00),
      purchaseCostsPaise: BigInt(5_000_00),
      ownershipPctBps: 10000,
    });
    assert.equal(basis, 105_000_00);
  });

  test('assets row math matches coerced values', () => {
    const basis = {
      purchasePricePaise: coerceWealthPaise(BigInt(412080)),
      purchaseCostsPaise: 0,
      ownershipPctBps: 10000,
    };
    const current = coerceWealthPaise(BigInt(500000));
    const ownerCurrent = ownershipSharePaise(current, basis.ownershipPctBps);
    const ownerBasis = ownershipSharePaise(propertyBasisPaise(basis), basis.ownershipPctBps);
    assert.equal(ownerCurrent - ownerBasis, 87920);
  });
});
