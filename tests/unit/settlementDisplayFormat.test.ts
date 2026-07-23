import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCheckoutSettlementV2 } from '../../src/lib/checkout/checkoutSettlementEngineV2';
import {
  formatDailyRentInr,
  formatDailyRentLabel,
  formatRentConsumedHint,
  formatSettlementPaise,
  resolveDaysPaidDisplay,
} from '../../src/lib/checkout/settlementDisplayFormat';

test('formatSettlementPaise never exposes paise in output', () => {
  const value = formatSettlementPaise(412_080);
  assert.match(value, /₹/);
  assert.doesNotMatch(value, /paise/i);
});

test('formatDailyRentInr renders rupee rate per day', () => {
  assert.equal(formatDailyRentInr(13_736), '₹137.36/day');
  assert.equal(formatDailyRentLabel(13_736), 'Daily rent: ₹137.36/day');
});

test('formatRentConsumedHint uses rupees not paise', () => {
  const hint = formatRentConsumedHint(18, 13_736);
  assert.match(hint, /18 days × ₹137\.36\/day/);
  assert.doesNotMatch(hint, /paise/i);
});

test('resolveDaysPaidDisplay implied hint is human-readable', () => {
  const result = resolveDaysPaidDisplay(null, 412_080, 13_736);
  assert.match(result.value, /day/);
  assert.match(result.hint ?? '', /daily rent/i);
  assert.doesNotMatch(result.hint ?? '', /paise/i);
  assert.doesNotMatch(result.hint ?? '', /floor\(/);
  assert.match(result.auditHint ?? '', /Implied: floor\(/);
  assert.doesNotMatch(result.auditHint ?? '', /paise/i);
});

test('resolveDaysPaidDisplay period hint stays date-only', () => {
  const result = resolveDaysPaidDisplay(
    {
      paidPeriodUsed: {
        periodStart: '2026-07-05',
        periodEnd: '2026-08-04',
        source: 'rent_invoice',
      },
    },
    412_080,
    13_736,
  );
  assert.match(result.hint ?? '', /2026-07-05 → 2026-08-04/);
  assert.equal(result.auditHint, undefined);
});

test('kunal-like waterfall daily rent hint stays rupee-only', () => {
  const waterfall = computeCheckoutSettlementV2({
    stayCheckInDate: '2026-07-04',
    stayCheckoutDate: '2026-07-21',
    rentPaidPaise: 412_080,
    monthlyRentPaise: 150_000,
    depositCollectedPaise: 412_100,
    missingNoticeDays: 14,
    noticeApplies: true,
    electricityPaise: 0,
    damageChargePaise: 0,
    cleaningChargePaise: 0,
    customChargePaise: 0,
  });
  const hint = formatRentConsumedHint(waterfall.stay.stayDays, waterfall.rentBucket.dailyRentPaise);
  assert.doesNotMatch(hint, /paise/i);
  assert.match(hint, /₹/);
});
