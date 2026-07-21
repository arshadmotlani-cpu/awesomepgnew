import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCheckoutRefundPreview } from '@/src/lib/billing/checkoutRefundPreview';

test('checkout refund preview uses notice + electricity deductions (Aatif-style)', () => {
  const preview = computeCheckoutRefundPreview({
    depositHeldPaise: 400_000,
    noticeDeductionPaise: 108_800,
    electricitySharePaise: 0,
    electricityDeductFromDeposit: true,
  });
  assert.equal(preview.finalRefundPaise, 291_200);
});

test('checkout refund preview deducts outstanding rent at checkout', () => {
  const preview = computeCheckoutRefundPreview({
    depositHeldPaise: 412_000,
    noticeDeductionPaise: 0,
    outstandingRentAtCheckoutPaise: 50_000,
  });
  assert.equal(preview.outstandingRentDeductionPaise, 50_000);
  assert.equal(preview.finalRefundPaise, 362_000);
});

test('checkout refund preview respects locked final refund', () => {
  const preview = computeCheckoutRefundPreview({
    depositHeldPaise: 400_000,
    noticeDeductionPaise: 108_800,
    finalRefundPaise: 291_200,
    amountsLocked: true,
  });
  assert.equal(preview.finalRefundPaise, 291_200);
});
