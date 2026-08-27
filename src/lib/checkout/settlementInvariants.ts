import type { CheckoutSettlementWaterfall } from '@/src/lib/checkout/checkoutSettlementEngineV2';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';

/** Assert V2 waterfall internal accounting — for unit tests. */
export function assertCheckoutSettlementWaterfallConsistent(w: CheckoutSettlementWaterfall): void {
  const paid = guardDepositPaise(w.rentBucket.paidPaise);
  const consumed = guardDepositPaise(w.rentBucket.consumedPaise);
  const unused = guardDepositPaise(w.rentBucket.unusedPaise);
  if (paid !== consumed + unused) {
    throw new Error(
      `rent bucket: paid ${paid} !== consumed ${consumed} + unused ${unused}`,
    );
  }

  const collected = guardDepositPaise(w.depositBucket.collectedPaise);
  const noticeFromDeposit = guardDepositPaise(w.notice.fromDepositPaise);
  const tail = guardDepositPaise(w.depositBucket.tailRentPaise);
  const electricity = guardDepositPaise(w.depositBucket.electricityPaise);
  const other = guardDepositPaise(w.depositBucket.otherPaise);
  const refundable = guardDepositPaise(w.depositBucket.refundablePaise);
  const expectedRefundable = Math.max(
    0,
    collected - noticeFromDeposit - tail - electricity - other,
  );
  if (refundable !== expectedRefundable) {
    throw new Error(
      `deposit bucket: refundable ${refundable} !== expected ${expectedRefundable}`,
    );
  }

  const unusedAfterNotice = guardDepositPaise(w.notice.unusedRentRemainingPaise);
  const totalRefund = guardDepositPaise(w.refund.totalPaise);
  const expectedTotal = guardDepositPaise(refundable + unusedAfterNotice);
  if (totalRefund !== expectedTotal) {
    throw new Error(
      `refund: total ${totalRefund} !== refundable ${refundable} + unused rent ${unusedAfterNotice}`,
    );
  }
}
