import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  computeCheckoutRentClosure,
  computeOptionARepairTarget,
} from '../../src/services/checkoutRentAccounting';

describe('computeCheckoutRentClosure', () => {
  test('closed when full rent applied to invoice', () => {
    const result = computeCheckoutRentClosure({
      rentPaisePaidFromPayment: 412_080,
      invoicePaidPrincipalPaise: 412_080,
      advanceRentCreditPaise: 0,
    });
    assert.equal(result.closed, true);
    assert.equal(result.unallocatedPaise, 0);
  });

  test('closed when prorated invoice plus advance credit equals rent paid', () => {
    const result = computeCheckoutRentClosure({
      rentPaisePaidFromPayment: 412_080,
      invoicePaidPrincipalPaise: 372_201,
      advanceRentCreditPaise: 39_879,
    });
    assert.equal(result.closed, true);
    assert.equal(result.unallocatedPaise, 0);
  });

  test('not closed when rent orphaned (Kunal defect shape)', () => {
    const result = computeCheckoutRentClosure({
      rentPaisePaidFromPayment: 412_080,
      invoicePaidPrincipalPaise: 372_201,
      advanceRentCreditPaise: 0,
    });
    assert.equal(result.closed, false);
    assert.equal(result.unallocatedPaise, 39_879);
  });
});

describe('computeOptionARepairTarget', () => {
  test('needs repair for prorated invoice with full rent collected and no credit', () => {
    const result = computeOptionARepairTarget({
      monthlyRentPaise: 412_080,
      rentCollectedPaise: 412_080,
      invoiceRentPaise: 372_201,
      invoicePaidPaise: 372_201,
      advanceRentCreditPaise: 0,
    });
    assert.equal(result.needsRepair, true);
    assert.equal(result.targetRentPaise, 412_080);
    assert.equal(result.gapPaise, 39_879);
  });

  test('no repair when invoice already full month', () => {
    const result = computeOptionARepairTarget({
      monthlyRentPaise: 412_080,
      rentCollectedPaise: 412_080,
      invoiceRentPaise: 412_080,
      invoicePaidPaise: 412_080,
      advanceRentCreditPaise: 0,
    });
    assert.equal(result.needsRepair, false);
    assert.equal(result.gapPaise, 0);
  });

  test('no repair when advance credit covers surplus', () => {
    const result = computeOptionARepairTarget({
      monthlyRentPaise: 412_080,
      rentCollectedPaise: 412_080,
      invoiceRentPaise: 372_201,
      invoicePaidPaise: 372_201,
      advanceRentCreditPaise: 39_879,
    });
    assert.equal(result.needsRepair, false);
  });

  test('no repair when checkout did not collect full month rent', () => {
    const result = computeOptionARepairTarget({
      monthlyRentPaise: 412_080,
      rentCollectedPaise: 372_201,
      invoiceRentPaise: 372_201,
      invoicePaidPaise: 372_201,
      advanceRentCreditPaise: 0,
    });
    assert.equal(result.needsRepair, false);
  });
});

describe('Option A repair projection', () => {
  test('after repair closure invariant holds', () => {
    const target = computeOptionARepairTarget({
      monthlyRentPaise: 412_080,
      rentCollectedPaise: 412_080,
      invoiceRentPaise: 372_201,
      invoicePaidPaise: 372_201,
      advanceRentCreditPaise: 0,
    });
    assert.equal(target.needsRepair, true);

    const after = computeCheckoutRentClosure({
      rentPaisePaidFromPayment: 412_080,
      invoicePaidPrincipalPaise: target.targetRentPaise,
      advanceRentCreditPaise: 0,
    });
    assert.equal(after.closed, true);
    assert.equal(after.unallocatedPaise, 0);
  });
});
