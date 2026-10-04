/**
 * Prior electricity collection — meter-period temporal attribution (not created_at).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkoutMeterBeforeOpenPeriodBoundary,
  priorCollectionBelongsToOpenMeterPeriod,
  resolvePriorCollectionAttributionDate,
} from '@/src/lib/billing/electricityPriorCollectionMeterPeriodAttribution';

const OPEN_START = '2026-09-05';
const OPEN_END_EXCL = '2026-10-05';
const BOUNDARY_424 = 424;

test('1 — checkout Aug 7, ledger backfilled Sep 6: prior cycle not open period', () => {
  const belongs = priorCollectionBelongsToOpenMeterPeriod({
    periodStartDate: OPEN_START,
    periodEndExclusive: OPEN_END_EXCL,
    previousFinalizedReadingUnits: BOUNDARY_424,
    vacatingDate: '2026-08-07',
    stayPeriodEnd: '2026-08-07',
    checkoutMeter: { previousReadingUnits: 337, currentReadingUnits: 358 },
  });
  assert.equal(belongs, false);
  assert.equal(
    resolvePriorCollectionAttributionDate({
      periodStartDate: OPEN_START,
      periodEndExclusive: OPEN_END_EXCL,
      vacatingDate: '2026-08-07',
    }),
    '2026-08-07',
  );
});

test('2 — checkout Sep 20, settlement recorded Oct 10: belongs to open period', () => {
  const belongs = priorCollectionBelongsToOpenMeterPeriod({
    periodStartDate: OPEN_START,
    periodEndExclusive: OPEN_END_EXCL,
    previousFinalizedReadingUnits: BOUNDARY_424,
    vacatingDate: '2026-09-20',
    checkoutMeter: { previousReadingUnits: 424, currentReadingUnits: 430 },
  });
  assert.equal(belongs, true);
});

test('3 — contribution_date inside period (created_at irrelevant)', () => {
  const belongs = priorCollectionBelongsToOpenMeterPeriod({
    periodStartDate: OPEN_START,
    periodEndExclusive: OPEN_END_EXCL,
    contributionDate: '2026-09-15',
  });
  assert.equal(belongs, true);
});

test('4 — checkout meter at/before finalized boundary is prior-cycle tail', () => {
  assert.equal(
    checkoutMeterBeforeOpenPeriodBoundary({
      previousFinalizedReadingUnits: 424,
      checkoutMeter: { previousReadingUnits: 337, currentReadingUnits: 358 },
    }),
    true,
  );
  assert.equal(
    priorCollectionBelongsToOpenMeterPeriod({
      periodStartDate: OPEN_START,
      periodEndExclusive: OPEN_END_EXCL,
      previousFinalizedReadingUnits: BOUNDARY_424,
      vacatingDate: '2026-08-07',
      checkoutMeter: { previousReadingUnits: 337, currentReadingUnits: 358 },
    }),
    false,
  );
});

test('5 — orphan former resident, consumption in open period', () => {
  const belongs = priorCollectionBelongsToOpenMeterPeriod({
    periodStartDate: OPEN_START,
    periodEndExclusive: OPEN_END_EXCL,
    previousFinalizedReadingUnits: BOUNDARY_424,
    vacatingDate: '2026-09-25',
    checkoutMeter: { previousReadingUnits: 424, currentReadingUnits: 440 },
  });
  assert.equal(belongs, true);
});

test('6 — orphan collection from previous meter period must not reduce open pool', () => {
  const belongs = priorCollectionBelongsToOpenMeterPeriod({
    periodStartDate: OPEN_START,
    periodEndExclusive: OPEN_END_EXCL,
    previousFinalizedReadingUnits: BOUNDARY_424,
    contributionDate: '2026-08-07',
    checkoutMeter: { previousReadingUnits: 337, currentReadingUnits: 358 },
  });
  assert.equal(belongs, false);
});

test('7 — billing_month Aug does not override vacating date outside open period', () => {
  const belongs = priorCollectionBelongsToOpenMeterPeriod({
    periodStartDate: OPEN_START,
    periodEndExclusive: OPEN_END_EXCL,
    previousFinalizedReadingUnits: BOUNDARY_424,
    vacatingDate: '2026-08-07',
    stayPeriodEnd: '2026-08-07',
  });
  assert.equal(belongs, false);
});

test('8 — late backfill: attribution date unchanged', () => {
  const date = resolvePriorCollectionAttributionDate({
    periodStartDate: OPEN_START,
    periodEndExclusive: OPEN_END_EXCL,
    vacatingDate: '2026-08-07',
    contributionDate: '2026-08-07',
  });
  assert.equal(date, '2026-08-07');
  assert.equal(
    priorCollectionBelongsToOpenMeterPeriod({
      periodStartDate: OPEN_START,
      periodEndExclusive: OPEN_END_EXCL,
      previousFinalizedReadingUnits: BOUNDARY_424,
      contributionDate: '2026-08-07',
      checkoutMeter: { previousReadingUnits: 337, currentReadingUnits: 358 },
    }),
    false,
  );
});

test('9 — stay interval overlap without vacating uses stay bounds', () => {
  const belongs = priorCollectionBelongsToOpenMeterPeriod({
    periodStartDate: OPEN_START,
    periodEndExclusive: OPEN_END_EXCL,
    stayPeriodStart: '2026-09-10',
    stayPeriodEnd: '2026-09-20',
  });
  assert.equal(belongs, true);
});
