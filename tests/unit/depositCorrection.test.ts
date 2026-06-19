import { strict as assert } from 'node:assert';
import test from 'node:test';
import { asPlainNumber, coerceNonNegativePaise, paiseToInr } from '../../src/lib/format';
import { sanitizeUnifiedDepositView } from '../../src/services/depositOperations';

test('coerceNonNegativePaise rejects NaN and negative values', () => {
  assert.equal(coerceNonNegativePaise(NaN), 0);
  assert.equal(coerceNonNegativePaise(-100), 0);
  assert.equal(coerceNonNegativePaise(undefined), 0);
  assert.equal(coerceNonNegativePaise(null), 0);
  assert.equal(coerceNonNegativePaise(125000n), 125000);
  assert.equal(coerceNonNegativePaise('5000'), 5000);
});

test('deposit wallet placeholder math fails on bigint without coercion', () => {
  const rawRequired = 125000n;
  assert.throws(() => (rawRequired / 100).toString());
  const safe = coerceNonNegativePaise(rawRequired);
  assert.equal((safe / 100).toString(), '1250');
});

test('sanitizeUnifiedDepositView coerces all paise fields for RSC + client props', () => {
  const view = sanitizeUnifiedDepositView({
    bookingId: 'b1',
    customerId: 'c1',
    requiredPaise: 10000n as unknown as number,
    collectedPaise: '5000' as unknown as number,
    deductedPaise: NaN,
    refundedPaise: undefined as unknown as number,
    refundablePaise: 5000n as unknown as number,
    depositDuePaise: -50,
    depositCollectionStatus: 'partial',
    invoiceStatus: null,
    walletInSync: true,
    walletMismatchReason: null,
  });
  assert.equal(view.requiredPaise, 10000);
  assert.equal(view.collectedPaise, 5000);
  assert.equal(view.deductedPaise, 0);
  assert.equal(view.refundedPaise, 0);
  assert.equal(view.refundablePaise, 5000);
  assert.equal(view.depositDuePaise, 0);
  assert.equal(paiseToInr(view.requiredPaise), '₹100');
});

test('asPlainNumber safe accumulation matches ledger sum pattern', () => {
  let collected = 0;
  for (const amount of [1000n, '2000', 3000, undefined]) {
    collected += coerceNonNegativePaise(amount);
  }
  assert.equal(collected, 6000);
});
