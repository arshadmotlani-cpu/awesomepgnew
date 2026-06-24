import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCheckoutRefundPreview } from '@/src/lib/billing/checkoutRefundPreview';

test('checkout refund preview uses notice + electricity deductions (Aatif-style)', () => {
  const preview = computeCheckoutRefundPreview({
    depositHeldPaise: 400_000,
    noticeDeductionPaise: 68_000,
    electricitySharePaise: 0,
    electricityDeductFromDeposit: true,
  });
  assert.equal(preview.finalRefundPaise, 332_000);
});

test('checkout refund preview respects locked final refund', () => {
  const preview = computeCheckoutRefundPreview({
    depositHeldPaise: 400_000,
    noticeDeductionPaise: 68_000,
    finalRefundPaise: 332_000,
    amountsLocked: true,
  });
  assert.equal(preview.finalRefundPaise, 332_000);
});
