import { strict as assert } from 'node:assert';
import test from 'node:test';
import { asPlainNumber, coerceNonNegativePaise, paiseToInr } from '../../src/lib/format';
import { jsonSafe } from '../../src/lib/depositPageDebug';
import { depositAdminDisplayAmounts, effectiveDepositCollectedPaise } from '../../src/lib/deposits/unifiedDepositView';
import { sanitizeUnifiedDepositView } from '../../src/services/depositOperations';

test('jsonSafe handles undefined without throwing', () => {
  assert.equal(jsonSafe(undefined), undefined);
  assert.doesNotThrow(() => jsonSafe(undefined));
});

test('jsonSafe serializes bigint paise for RSC props', () => {
  const out = jsonSafe({ amount: 900000n });
  assert.equal(out.amount, 900000);
  assert.doesNotThrow(() => JSON.stringify(out));
});

test('effectiveDepositCollectedPaise caps gross to required when fully paid', () => {
  assert.equal(
    effectiveDepositCollectedPaise({
      grossCollectedPaise: 900000,
      requiredPaise: 450000,
      depositDuePaise: 0,
    }),
    450000,
  );
});

test('effectiveDepositCollectedPaise keeps gross when deposit still due', () => {
  assert.equal(
    effectiveDepositCollectedPaise({
      grossCollectedPaise: 900000,
      requiredPaise: 900000,
      depositDuePaise: 450000,
    }),
    900000,
  );
});

test('depositAdminDisplayAmounts hides collection adjustment from deductions', () => {
  const display = depositAdminDisplayAmounts({
    grossCollectedPaise: 6150000,
    grossDeductedPaise: 900000,
    grossRefundedPaise: 0,
    grossRefundableBalancePaise: 5250000,
    requiredPaise: 5250000,
    depositDuePaise: 0,
  });
  assert.equal(display.requiredPaise, 5250000);
  assert.equal(display.collectedPaise, 5250000);
  assert.equal(display.deductedPaise, 0);
  assert.equal(display.deductionsPaise, 0);
  assert.equal(display.refundablePaise, 5250000);
});

test('depositAdminDisplayAmounts keeps real deductions after collection adjustment', () => {
  const display = depositAdminDisplayAmounts({
    grossCollectedPaise: 900000,
    grossDeductedPaise: 450000,
    grossRefundedPaise: 0,
    grossRefundableBalancePaise: 450000,
    requiredPaise: 450000,
    depositDuePaise: 0,
  });
  assert.equal(display.collectedPaise, 450000);
  assert.equal(display.deductedPaise, 0);
  assert.equal(display.deductionsPaise, 0);
});

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

test('sanitizeUnifiedDepositView returns safe empty view for null/undefined input', () => {
  for (const input of [null, undefined]) {
    const view = sanitizeUnifiedDepositView(input);
    assert.equal(view.bookingId, '');
    assert.equal(view.requiredPaise, 0);
    assert.equal(view.collectedPaise, 0);
    assert.doesNotThrow(() => JSON.stringify(view));
  }
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

test('bigint paise breaks raw division — root cause of E352 before coercion', () => {
  const requiredPaise = 350000n;
  assert.throws(() => (requiredPaise / 100).toString());
  assert.throws(() => JSON.stringify({ requiredPaise }));
});

test('sanitizeUnifiedDepositView fixes RSC serialization after deposit save', () => {
  const dirty = {
    bookingId: 'b1',
    customerId: 'c1',
    requiredPaise: 350000n as unknown as number,
    collectedPaise: '350000' as unknown as number,
    deductedPaise: 0,
    refundedPaise: 0,
    refundablePaise: 350000n as unknown as number,
    depositDuePaise: 0,
    depositCollectionStatus: 'full',
    invoiceStatus: null,
    walletInSync: true,
    walletMismatchReason: null,
  };
  const clean = sanitizeUnifiedDepositView(dirty);
  assert.doesNotThrow(() => JSON.stringify(clean));
  assert.doesNotThrow(() => (clean.requiredPaise / 100).toString());
});

test('expectedAfterRebuild uses numeric paise when booking fields are bigint-like', () => {
  const current = sanitizeUnifiedDepositView({
    bookingId: 'b1',
    customerId: 'c1',
    requiredPaise: 350000,
    collectedPaise: 350000,
    deductedPaise: 0,
    refundedPaise: 0,
    refundablePaise: 350000,
    depositDuePaise: 0,
    depositCollectionStatus: 'full',
    invoiceStatus: 'Held',
    walletInSync: true,
    walletMismatchReason: null,
  });
  const summary = {
    bookingId: 'b1',
    customerId: 'c1',
    collectedPaise: 300000,
    deductedPaise: 0,
    refundedPaise: 0,
    refundableBalancePaise: 300000,
    entries: [],
  };
  const expected = sanitizeUnifiedDepositView({
    ...current,
    collectedPaise: summary.collectedPaise,
    refundablePaise: summary.refundableBalancePaise,
    depositDuePaise: Math.max(0, 350000 - 300000),
  });
  assert.equal(expected.depositDuePaise, 50000);
  assert.doesNotThrow(() => JSON.stringify(expected));
});
