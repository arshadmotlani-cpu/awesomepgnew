import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCheckoutSettlementV2DeductionPlan,
  computeCheckoutSettlementV2,
} from '@/src/lib/checkout/checkoutSettlementEngineV2';

const DAILY = Math.floor(150_000 / 30); // ₹5,000/mo → ~₹166.67/day

test('notice fully covered by unused rent — deposit untouched', () => {
  const noticeFromRent = 200_000;
  const unusedRent = 230_000;
  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-06-01',
    stayCheckoutDate: '2026-06-01',
    rentPaidPaise: unusedRent + DAILY,
    monthlyRentPaise: 150_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: Math.ceil(noticeFromRent / DAILY),
    noticeApplies: true,
    electricityPaise: 0,
  });
  assert.equal(w.rentBucket.unusedPaise, unusedRent);
  assert.equal(w.notice.fullPaise, noticeFromRent);
  assert.equal(w.notice.fromUnusedRentPaise, noticeFromRent);
  assert.equal(w.notice.fromDepositPaise, 0);
  assert.equal(w.notice.unusedRentRemainingPaise, unusedRent - noticeFromRent);
  assert.equal(w.depositBucket.refundablePaise, 412_100);
});

// Sign-off: deposit ₹4,000, unused rent ₹2,500, notice ₹1,500 → refund ₹5,000 (deposit + ₹1,000 unused).
// Bucket amounts match the ₹4,000/mo example; monthlyRent uses ₹3,000/mo here because floor(400k/30)
// cannot produce exact ₹1,500 consumed/notice with integer stay/notice days.
test('sign-off: notice from unused rent; remaining unused rent refunds with deposit', () => {
  const monthlyRentPaise = 300_000; // daily 10_000 → exact ₹1,500 buckets
  const depositCollectedPaise = 400_000;
  const rentPaidPaise = 400_000;
  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-01-01',
    stayCheckoutDate: '2026-01-15', // 15 days → consumed 150_000
    rentPaidPaise,
    monthlyRentPaise,
    depositCollectedPaise,
    missingNoticeDays: 15, // notice 150_000
    noticeApplies: true,
    electricityPaise: 0,
  });

  assert.equal(w.rentBucket.consumedPaise, 150_000);
  assert.equal(w.rentBucket.unusedPaise, 250_000);
  assert.equal(w.notice.fromUnusedRentPaise, 150_000);
  assert.equal(w.notice.fromDepositPaise, 0);
  assert.equal(w.notice.unusedRentRemainingPaise, 100_000);
  assert.equal(w.depositBucket.refundablePaise, 400_000);
  assert.equal(w.refund.unusedRentPortionPaise, 100_000);
  assert.equal(w.refund.totalPaise, 500_000); // ₹5,000
});

test('notice exceeds unused rent — remainder from deposit', () => {
  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-01-01',
    stayCheckoutDate: '2026-01-10',
    rentPaidPaise: 100_000,
    monthlyRentPaise: 150_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: 12,
    noticeApplies: true,
    electricityPaise: 0,
  });
  assert.equal(w.rentBucket.unusedPaise, 50_000);
  assert.equal(w.notice.fromUnusedRentPaise, 50_000);
  assert.equal(w.notice.fromDepositPaise, 12 * DAILY - 50_000);
  assert.equal(w.notice.unusedRentRemainingPaise, 0);
});

test('full accounting transparency — notice from rent, electricity from deposit', () => {
  const monthlyRentPaise = 150_000;
  const daily = Math.floor(monthlyRentPaise / 30);
  const rentPaid = 412_100;
  const noticeFromRent = 200_000;
  const missingNoticeDays = Math.ceil(noticeFromRent / daily);

  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-01-01',
    stayCheckoutDate: '2026-02-05',
    rentPaidPaise: rentPaid,
    monthlyRentPaise,
    depositCollectedPaise: 412_100,
    missingNoticeDays,
    noticeApplies: true,
    electricityPaise: 52_000,
  });

  assert.equal(w.rentBucket.paidPaise, rentPaid);
  assert.ok(w.rentBucket.consumedPaise <= rentPaid);
  assert.equal(w.rentBucket.unusedPaise, rentPaid - w.rentBucket.consumedPaise);
  assert.equal(w.notice.fromUnusedRentPaise, noticeFromRent);
  assert.equal(
    w.notice.unusedRentRemainingPaise,
    w.rentBucket.unusedPaise - noticeFromRent,
  );
  assert.equal(w.notice.fromDepositPaise, 0);
  assert.equal(w.depositBucket.refundablePaise, 412_100 - 52_000);
  assert.equal(
    w.refund.totalPaise,
    w.depositBucket.refundablePaise + w.refund.unusedRentPortionPaise,
  );
});

test('deduction plan uses deposit notice portion only', () => {
  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-01-01',
    stayCheckoutDate: '2026-01-10',
    rentPaidPaise: 100_000,
    monthlyRentPaise: 150_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: 12,
    electricityPaise: 52_000,
  });
  const plan = buildCheckoutSettlementV2DeductionPlan(w);
  const noticeRow = plan.find((d) => d.reason.includes('Notice'));
  assert.ok(noticeRow);
  assert.equal(noticeRow!.amountPaise, w.notice.fromDepositPaise);
  assert.equal(
    plan.reduce((s, d) => s + d.amountPaise, 0),
    w.notice.fromDepositPaise + w.depositBucket.electricityPaise,
  );
});

test('fixed-stay skips notice', () => {
  const w = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-01-01',
    stayCheckoutDate: '2026-01-30',
    rentPaidPaise: 100_000,
    monthlyRentPaise: 150_000,
    depositCollectedPaise: 200_000,
    missingNoticeDays: 14,
    noticeApplies: false,
    electricityPaise: 10_000,
  });
  assert.equal(w.notice.fullPaise, 0);
  assert.equal(w.notice.fromDepositPaise, 0);
  assert.equal(w.depositBucket.refundablePaise, 190_000);
});
