/**
 * Meter-period electricity generation — regression (generic, not Room 102 hardcoded).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveElectricityGenerationMeterPeriodFromBills } from '@/src/lib/billing/resolveElectricityGenerationMeterPeriod';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { mergeRoomElectricityCoverage, calendarDaysBetween } from '@/src/lib/billing/roomElectricityOccupancyCoverage';
import { resolveElectricityStayEndExclusive } from '@/src/lib/billing/resolveElectricityStayEndExclusive';

const finalizedChain = [
  {
    billingMonth: '2026-09-01',
    previousReadingUnits: 337,
    currentReadingUnits: 424,
    periodStartDate: '2026-07-21',
    periodEndDate: '2026-09-04',
    createdAt: '2026-09-04T10:00:00.000Z',
    ratePerUnitPaise: 1600,
    meterImageUrl: null,
  },
];

test('open meter period starts day after last finalized period end', () => {
  const mp = resolveElectricityGenerationMeterPeriodFromBills({
    reportingBillingMonth: '2026-10-01',
    previousReadingUnits: 424,
    readingDate: '2026-10-04',
    finalizedBills: finalizedChain,
  });
  assert.equal(mp.periodStartDate, '2026-09-05');
  assert.equal(mp.periodEndDate, '2026-10-04');
  assert.equal(mp.billingDays.length, 30);
});

test('resident A then B in same meter period — both included in daily allocation', () => {
  const periodStart = '2026-09-05';
  const periodEndExclusive = '2026-09-20';
  const days = calendarDaysBetween(periodStart, periodEndExclusive);
  const occupants = [
    {
      bookingId: 'bk-a',
      customerId: 'a',
      bedCount: 1,
      weight: 10,
      occupiedDates: days.slice(0, 10),
    },
    {
      bookingId: 'bk-b',
      customerId: 'b',
      bedCount: 1,
      weight: 5,
      occupiedDates: days.slice(10),
    },
  ];
  const gross = 15000;
  const allocation = allocateMonthlyElectricityInvoices({
    grossTotalPaise: gross,
    prepaidCreditPaise: 0,
    occupants,
    checkoutCollectedByCustomerId: new Map(),
    useProRata: true,
    activeBedCount: 2,
    billingDays: days,
  });
  const byId = new Map(allocation.invoices.map((i) => [i.customerId, i.amountPaise]));
  assert.ok((byId.get('a') ?? 0) > 0);
  assert.ok((byId.get('b') ?? 0) > 0);
  const sum = allocation.invoices.reduce((s, i) => s + i.amountPaise, 0);
  assert.equal(sum + allocation.remainderPaise, gross);
});

test('prior contribution reduces invoice once', () => {
  const days = calendarDaysBetween('2026-09-05', '2026-09-15');
  const occupants = [
    { bookingId: 'bk-a', customerId: 'a', bedCount: 1, weight: 10, occupiedDates: days },
  ];
  const gross = 10000;
  const allocation = allocateMonthlyElectricityInvoices({
    grossTotalPaise: gross,
    prepaidCreditPaise: 0,
    contributionsByCustomerId: new Map([['a', 4000]]),
    occupants,
    checkoutCollectedByCustomerId: new Map(),
    useProRata: true,
    activeBedCount: 1,
    billingDays: days,
  });
  const line = allocation.invoices.find((i) => i.customerId === 'a');
  assert.ok(line);
  assert.equal(line!.amountPaise, 6000);
});

test('same-room bed change stays one resident coverage', () => {
  const coverage = mergeRoomElectricityCoverage({
    roomId: 'r1',
    billingMonth: '2026-09-01',
    segments: [
      {
        roomId: 'r1',
        bookingId: 'bk1',
        customerId: 'c1',
        bedId: 'b1',
        startDate: '2026-09-05',
        endDateExclusive: '2026-09-10',
      },
      {
        roomId: 'r1',
        bookingId: 'bk1',
        customerId: 'c1',
        bedId: 'b2',
        startDate: '2026-09-10',
        endDateExclusive: '2026-09-20',
      },
    ],
    occupancyWindow: { startIso: '2026-09-05', endExclusiveIso: '2026-09-20' },
  });
  assert.equal(coverage.length, 1);
  assert.equal(coverage[0]!.customerId, 'c1');
  assert.ok(coverage[0]!.activeDays >= 14);
});

test('vacating clamp shortens occupancy within meter window', () => {
  const end = resolveElectricityStayEndExclusive({
    stayRangeUpper: '2026-10-03',
    vacatingDate: '2026-10-02',
    reservationStatus: 'completed',
    bookingStatus: 'confirmed',
  });
  const coverage = mergeRoomElectricityCoverage({
    roomId: 'r1',
    billingMonth: '2026-10-01',
    segments: [
      {
        roomId: 'r1',
        bookingId: 'bk',
        customerId: 'c1',
        bedId: 'b1',
        startDate: '2026-09-20',
        endDateExclusive: end,
      },
    ],
    occupancyWindow: { startIso: '2026-09-05', endExclusiveIso: '2026-10-05' },
  });
  assert.equal(coverage[0]!.occupiedDates.at(-1), '2026-10-02');
});

test('orphan prior contribution reduces daily room pool when payer left before meter period', () => {
  const days = calendarDaysBetween('2026-09-05', '2026-09-15');
  const occupants = [
    { bookingId: 'bk-b', customerId: 'b', bedCount: 1, weight: 10, occupiedDates: days },
  ];
  const gross = 10000;
  const allocation = allocateMonthlyElectricityInvoices({
    grossTotalPaise: gross,
    prepaidCreditPaise: 0,
    contributionsByCustomerId: new Map([['former', 3000]]),
    occupants,
    checkoutCollectedByCustomerId: new Map(),
    useProRata: true,
    activeBedCount: 1,
    billingDays: days,
  });
  const invoiceTotal = allocation.invoices.reduce((s, i) => s + i.amountPaise, 0);
  assert.equal(allocation.roomContributionsAppliedPaise, 3000);
  assert.equal(invoiceTotal + allocation.remainderPaise, 7000);
});

test('missing August bill does not reset opening reading', () => {
  const mp = resolveElectricityGenerationMeterPeriodFromBills({
    reportingBillingMonth: '2026-10-01',
    previousReadingUnits: 424,
    readingDate: '2026-10-04',
    finalizedBills: finalizedChain,
  });
  assert.equal(mp.previousReadingUnits, 424);
});
