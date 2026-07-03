import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { allocateRoomElectricityCheckout } from '@/src/lib/checkout/roomElectricityAllocation';
import {
  buildElectricityBillBreakdownFromContext,
  personalizeElectricityBreakdown,
} from '@/src/lib/billing/electricityBillBreakdownPure';
import type { RoomElectricityTimelineRow } from '@/src/lib/billing/electricityBillBreakdownTypes';

test('one resident leaves early — checkout recovery reduces month-end split', () => {
  const gross = 500_000;
  const contributions = new Map([['early-leaver', 80_000]]);
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: gross,
    prepaidCreditPaise: 0,
    contributionsByCustomerId: contributions,
    occupants: [
      { bookingId: 'b1', customerId: 'early-leaver', bedCount: 1, weight: 10 },
      { bookingId: 'b2', customerId: 'stayer', bedCount: 1, weight: 20 },
    ],
    checkoutCollectedByCustomerId: new Map(),
    useProRata: true,
  });
  assert.equal(result.netSplittablePaise, 420_000);
  assert.equal(result.invoices.find((i) => i.customerId === 'stayer')?.amountPaise, 420_000);
});

test('multiple residents leave — all recoveries excluded from split', () => {
  const contributions = new Map([
    ['a', 50_000],
    ['b', 80_000],
  ]);
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 500_000,
    prepaidCreditPaise: 0,
    contributionsByCustomerId: contributions,
    occupants: [
      { bookingId: 'b1', customerId: 'a', bedCount: 1, weight: 10 },
      { bookingId: 'b2', customerId: 'b', bedCount: 1, weight: 10 },
      { bookingId: 'b3', customerId: 'c', bedCount: 1, weight: 20 },
    ],
    checkoutCollectedByCustomerId: new Map(),
    useProRata: true,
  });
  assert.equal(result.netSplittablePaise, 370_000);
  assert.equal(result.invoices.filter((i) => i.amountPaise > 0).length, 1);
});

test('new resident joins mid-month — pro-rata by active days at checkout', () => {
  const allocation = allocateRoomElectricityCheckout({
    billingMonth: '2026-07-01',
    periodStart: '2026-07-01',
    periodEndExclusive: '2026-07-31',
    totalBillPaise: 300_000,
    unitsConsumed: 100,
    occupants: [
      {
        bookingId: 'full',
        customerId: 'full',
        customerName: 'Full month',
        stayStart: '2026-07-01',
        stayEndExclusive: null,
      },
      {
        bookingId: 'mid',
        customerId: 'mid',
        customerName: 'Mid joiner',
        stayStart: '2026-07-20',
        stayEndExclusive: null,
      },
    ],
    collectedByCustomerId: new Map(),
    currentCustomerId: 'mid',
  });
  assert.ok(allocation.currentResidentSharePaise < allocation.remainingToRecoverPaise);
  assert.ok(allocation.currentResidentSharePaise > 0);
});

test('entire month with no checkout recoveries splits gross equally', () => {
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 300_000,
    prepaidCreditPaise: 0,
    occupants: [
      { bookingId: 'b1', customerId: 'a', bedCount: 1, weight: 30 },
      { bookingId: 'b2', customerId: 'b', bedCount: 1, weight: 30 },
    ],
    checkoutCollectedByCustomerId: new Map(),
    useProRata: false,
  });
  assert.equal(result.netSplittablePaise, 300_000);
  assert.equal(result.invoices[0]?.amountPaise, 150_000);
  assert.equal(result.invoices[1]?.amountPaise, 150_000);
});

test('checkout recoveries reduce final bill correctly (room 204 scenario)', () => {
  const gross = 299_200;
  const contributions = new Map([
    ['resident-a', 122_000],
    ['resident-b', 50_000],
  ]);
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: gross,
    prepaidCreditPaise: 0,
    contributionsByCustomerId: contributions,
    occupants: [
      { bookingId: 'b-a', customerId: 'resident-a', bedCount: 1, weight: 30 },
      { bookingId: 'b-b', customerId: 'resident-b', bedCount: 1, weight: 10 },
      { bookingId: 'b-c', customerId: 'resident-c', bedCount: 1, weight: 30 },
    ],
    checkoutCollectedByCustomerId: new Map(),
    useProRata: false,
  });
  assert.equal(result.netSplittablePaise, 127_200);
  assert.equal(result.invoices.find((i) => i.customerId === 'resident-c')?.amountPaise, 127_200);
});

test('invoice breakdown shows contributions and remaining balance', () => {
  const breakdown = buildElectricityBillBreakdownFromContext({
    roomNumber: '204',
    billingMonth: '2026-06-01',
    previousReadingUnits: 654,
    currentReadingUnits: 841,
    ratePerUnitPaise: 1600,
    grossTotalPaise: 299_200,
    prepaidCreditPaise: 0,
    manualCreditPaise: 0,
    checkoutCreditAppliedPaise: 0,
    remainingBillPaise: 127_200,
    useProRata: false,
    timelineRows: [],
    invoiceAmountByBookingId: new Map([['b-c', 127_200]]),
    checkoutCredits: [],
    previousContributions: [
      {
        customerId: 'a',
        customerName: 'Resident A',
        bookingId: 'b-a',
        amountPaise: 122_000,
        kind: 'historical',
        reason: 'Paid offline',
        contributionDate: '2026-06-01',
      },
      {
        customerId: 'b',
        customerName: 'Resident B',
        bookingId: 'b-b',
        amountPaise: 50_000,
        kind: 'historical',
        reason: 'Paid offline',
        contributionDate: '2026-06-10',
      },
    ],
  });
  assert.equal(breakdown.previousContributions.length, 2);
  assert.equal(breakdown.remainingBillPaise, 127_200);
  assert.equal(breakdown.adjustments.totalDeductedPaise, 172_000);
});

test('july unaffected by june contributions when contributions map empty', () => {
  const july = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 300_000,
    prepaidCreditPaise: 0,
    occupants: [{ bookingId: 'j1', customerId: 'july-only', bedCount: 1, weight: 30 }],
    checkoutCollectedByCustomerId: new Map(),
    useProRata: false,
  });
  assert.equal(july.netSplittablePaise, 300_000);
});

test('regenerating allocation with same contributions does not double-count recoveries', () => {
  const contributions = new Map([
    ['resident-a', 122_000],
    ['resident-b', 50_000],
  ]);
  const base = {
    grossTotalPaise: 299_200,
    prepaidCreditPaise: 0,
    contributionsByCustomerId: contributions,
    occupants: [
      { bookingId: 'b-a', customerId: 'resident-a', bedCount: 1, weight: 30 },
      { bookingId: 'b-b', customerId: 'resident-b', bedCount: 1, weight: 10 },
      { bookingId: 'b-c', customerId: 'resident-c', bedCount: 1, weight: 30 },
    ],
    checkoutCollectedByCustomerId: new Map<string, number>(),
    useProRata: false as const,
  };
  const first = allocateMonthlyElectricityInvoices(base);
  const second = allocateMonthlyElectricityInvoices(base);
  assert.deepEqual(
    first.invoices.map((i) => ({ customerId: i.customerId, amountPaise: i.amountPaise })),
    second.invoices.map((i) => ({ customerId: i.customerId, amountPaise: i.amountPaise })),
  );
  assert.equal(
    contributions.get('resident-a')! + contributions.get('resident-b')! + first.invoices.reduce((s, i) => s + i.amountPaise, 0),
    299_200,
  );
});

test('invoice breakdown personalizes occupancy label for resident view', () => {
  const timelineRows: RoomElectricityTimelineRow[] = [
    {
      bookingId: 'b-c',
      customerId: 'resident-c',
      customerName: 'Rishik',
      reservationStatus: 'active',
      bookingStatus: 'confirmed',
      lower: '2026-06-01',
      upper: null,
      activeDays: 30,
      stayStart: '2026-06-01',
      stayEnd: '2026-06-30',
      vacatedOn: null,
      role: 'active',
      settlement: null,
    },
  ];
  const breakdown = buildElectricityBillBreakdownFromContext({
    roomNumber: '204',
    billingMonth: '2026-06-01',
    previousReadingUnits: 654,
    currentReadingUnits: 841,
    ratePerUnitPaise: 1600,
    grossTotalPaise: 299_200,
    prepaidCreditPaise: 0,
    manualCreditPaise: 0,
    checkoutCreditAppliedPaise: 0,
    remainingBillPaise: 127_200,
    useProRata: false,
    timelineRows,
    invoiceAmountByBookingId: new Map([['b-c', 127_200]]),
    checkoutCredits: [],
    previousContributions: [
      {
        customerId: 'a',
        customerName: 'Resident A',
        bookingId: 'b-a',
        amountPaise: 122_000,
        kind: 'historical',
        reason: 'Paid offline',
        contributionDate: '2026-06-01',
      },
      {
        customerId: 'b',
        customerName: 'Resident B',
        bookingId: 'b-b',
        amountPaise: 50_000,
        kind: 'historical',
        reason: 'Paid offline',
        contributionDate: '2026-06-10',
      },
    ],
  });
  const { viewer } = personalizeElectricityBreakdown(breakdown, 'resident-c');
  assert.equal(viewer?.amountPayablePaise, 127_200);
  assert.ok(viewer?.occupancyLabel);
});
