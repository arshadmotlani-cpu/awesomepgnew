import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluatePaymentReviewInvariants,
  isValidPaymentReviewBillingMonth,
  isValidPaymentReviewScreenshotUrl,
} from '@/src/lib/payments/paymentReviewInvariants';

const VALID_BLOB =
  'https://abc123.private.blob.vercel-storage.com/payment-proofs/rent/inv-1.png';

function base(overrides: Partial<Parameters<typeof evaluatePaymentReviewInvariants>[0]> = {}) {
  return evaluatePaymentReviewInvariants({
    kind: 'rent',
    invoiceId: '11111111-1111-1111-1111-111111111111',
    customerId: '22222222-2222-2222-2222-222222222222',
    bookingId: '33333333-3333-3333-3333-333333333333',
    billingMonth: '2026-08-01',
    expectedAmountPaise: 1500_00,
    proofAmountPaise: 1500_00,
    paymentProofUrl: VALID_BLOB,
    status: 'pending',
    now: new Date('2026-08-04T12:00:00.000Z'),
    ...overrides,
  });
}

describe('paymentReviewInvariants', () => {
  it('accepts a real rent proof candidate', () => {
    const result = base();
    assert.equal(result.ok, true);
  });

  it('rejects sentinel billing month 2099 (synthetic verify scripts)', () => {
    assert.equal(isValidPaymentReviewBillingMonth('2099-01-01'), false);
    assert.equal(isValidPaymentReviewBillingMonth('2099-02-01'), false);
    const result = base({ billingMonth: '2099-01-01' });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.violations.some((v) => v.code === 'INVALID_BILLING_MONTH'));
    }
  });

  it('rejects placeholder example.com screenshots', () => {
    assert.equal(
      isValidPaymentReviewScreenshotUrl(
        'https://example.com/opt-verify/OPTVERIFY_1.png',
      ),
      false,
    );
    const result = base({
      paymentProofUrl: 'https://example.com/opt-browser/OPTBROWSER_1.png',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.violations.some((v) => v.code === 'INVALID_SCREENSHOT'));
    }
  });

  it('rejects ₹100 synthetic rows that also fail month + screenshot together', () => {
    const result = base({
      billingMonth: '2099-01-01',
      expectedAmountPaise: 10_000,
      proofAmountPaise: 10_000,
      paymentProofUrl: 'https://example.com/opt-verify/OPTVERIFY_x.png',
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      const codes = new Set(result.violations.map((v) => v.code));
      assert.ok(codes.has('INVALID_BILLING_MONTH'));
      assert.ok(codes.has('INVALID_SCREENSHOT'));
    }
  });

  it('rejects zero/negative expected amount', () => {
    const result = base({ expectedAmountPaise: 0, proofAmountPaise: 0 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.violations.some((v) => v.code === 'INVALID_AMOUNT'));
    }
  });

  it('rejects amount mismatch between expected and proof snapshot', () => {
    const result = base({ expectedAmountPaise: 1500_00, proofAmountPaise: 10_000 });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.violations.some((v) => v.code === 'AMOUNT_MISMATCH'));
    }
  });

  it('rejects missing resident or invoice', () => {
    const missingResident = base({ customerId: null });
    assert.equal(missingResident.ok, false);
    const missingInvoice = base({ invoiceId: '' });
    assert.equal(missingInvoice.ok, false);
  });

  it('rejects missing booking for rent/electricity/extension', () => {
    const result = base({ bookingId: null });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.violations.some((v) => v.code === 'MISSING_BOOKING'));
    }
  });

  it('rejects duplicate screenshot among pending same-PG reviews', () => {
    const result = base({ duplicatePendingScreenshot: true });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.violations.some((v) => v.code === 'DUPLICATE_SCREENSHOT'));
    }
  });

  it('rejects orphan proof on cancelled booking', () => {
    const result = base({ bookingStatus: 'cancelled' });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.violations.some((v) => v.code === 'ORPHAN_PROOF'));
    }
  });

  it('rejects orphan proof on paid invoice with screenshot still set', () => {
    const result = base({ status: 'paid', requireAwaitingStatus: false });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.violations.some((v) => v.code === 'ORPHAN_PROOF'));
    }
  });
});
