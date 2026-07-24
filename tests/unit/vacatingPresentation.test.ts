import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVacatingTimelineStages,
  currentStageLabel,
  refundRequestStageLabel,
  refundUnlockCountdown,
  residentHomeMoveOutDetail,
  residentSettlementStatusLabel,
} from '@/src/lib/residents/vacatingPresentation';

test('refund request stage label before vacate date', () => {
  assert.equal(
    refundRequestStageLabel({ vacatingDate: '2026-08-20', today: '2026-08-01' }),
    'Waiting for Refund Request',
  );
});

test('refund request stage label on or after vacate date', () => {
  assert.equal(
    refundRequestStageLabel({ vacatingDate: '2026-08-20', today: '2026-08-20' }),
    'Ready to Request Refund',
  );
});

test('refund unlock countdown copy', () => {
  const locked = refundUnlockCountdown({ vacatingDate: '2026-08-20', today: '2026-08-08' });
  assert.equal(locked.daysUntil, 12);
  assert.equal(locked.headline, 'Refund request opens in 12 days');
  assert.equal(locked.badgeText, '12 days');

  const today = refundUnlockCountdown({ vacatingDate: '2026-08-20', today: '2026-08-20' });
  assert.equal(today.headline, 'Refund request opens today');
  assert.equal(today.badgeText, 'Today');
});

test('resident settlement status never exposes internal codes', () => {
  assert.equal(
    residentSettlementStatusLabel({
      checkoutStatus: 'awaiting_admin_review',
      waterfall: null,
    }),
    'Waiting for meter verification',
  );
  assert.equal(
    residentSettlementStatusLabel({
      checkoutStatus: 'awaiting_admin_review',
      waterfall: {
        engineVersion: 2 as const,
        stay: { checkInDate: '2026-01-01', checkoutDate: '2026-08-20', stayDays: 200 },
        rentBucket: { paidPaise: 100, consumedPaise: 50, unusedPaise: 50, dailyRentPaise: 100 },
        notice: {
          missingNoticeDays: 0,
          fullPaise: 0,
          fromUnusedRentPaise: 0,
          fromDepositPaise: 0,
          unusedRentRemainingPaise: 50,
        },
        depositBucket: {
          collectedPaise: 5000,
          electricityPaise: 0,
          tailRentPaise: 0,
          otherPaise: 0,
          refundablePaise: 5000,
        },
        refund: { depositPortionPaise: 5000, unusedRentPortionPaise: 500, totalPaise: 5500 },
        lines: [],
      },
    }),
    'Calculating electricity charges',
  );
  assert.equal(
    residentSettlementStatusLabel({
      checkoutStatus: 'refund_pending',
      waterfall: null,
    }),
    'Refund is being processed',
  );
});

test('timeline stage 3 uses dynamic refund request label', () => {
  const stages = buildVacatingTimelineStages({
    vacatingStatus: 'approved',
    checkoutStatus: null,
    vacatingDate: '2026-08-20',
    today: '2026-08-01',
  });
  assert.equal(stages[2]?.label, 'Waiting for Refund Request');

  const ready = buildVacatingTimelineStages({
    vacatingStatus: 'approved',
    checkoutStatus: 'awaiting_resident_details',
    vacatingDate: '2026-08-20',
    today: '2026-08-20',
  });
  assert.equal(ready[2]?.label, 'Ready to Request Refund');
});

test('currentStageLabel matches dynamic stage 3', () => {
  assert.equal(
    currentStageLabel('approved', null, '2026-08-20', 'monthly', '2026-08-20'),
    'Ready to Request Refund',
  );
});

test('resident home move-out detail uses permanent workflow copy before vacate date', () => {
  const detail = residentHomeMoveOutDetail({
    vacatingStatus: 'approved',
    checkoutStatus: null,
    vacatingDate: '2026-08-20',
    today: '2026-08-08',
  });
  assert.match(detail, /upload meter photo & UPI QR on your vacating date/);
});

test('resident home move-out detail uses settlement label during review', () => {
  const detail = residentHomeMoveOutDetail({
    vacatingStatus: 'approved',
    checkoutStatus: 'awaiting_admin_review',
    vacatingDate: '2026-08-01',
    waterfall: null,
  });
  assert.equal(detail, 'Waiting for PG verification.');
});
