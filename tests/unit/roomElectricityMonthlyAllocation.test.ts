import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { billingMonthCalendarDays } from '@/src/lib/billing/roomElectricityOccupancyCoverage';

test('checkout payer is excluded from monthly electricity invoices', () => {
  const checkout = new Map<string, number>([['resident-a', 22_400]]);
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 120_000,
    prepaidCreditPaise: 0,
    occupants: [
      { bookingId: 'b1', customerId: 'resident-a', bedCount: 1, weight: 30 },
      { bookingId: 'b2', customerId: 'resident-b', bedCount: 1, weight: 30 },
    ],
    checkoutCollectedByCustomerId: checkout,
    useProRata: false,
    activeBedCount: 2,
  });

  assert.equal(result.checkoutCreditAppliedPaise, 22_400);
  assert.equal(result.netSplittablePaise, 97_600);
  const aInvoice = result.invoices.find((i) => i.customerId === 'resident-a');
  const bInvoice = result.invoices.find((i) => i.customerId === 'resident-b');
  assert.equal(aInvoice?.excludedBecauseCheckoutPaid, true);
  assert.equal(aInvoice?.amountPaise, 0);
  assert.equal(bInvoice?.amountPaise, 48_800);
});

test('room collection never exceeds gross bill', () => {
  const checkout = new Map<string, number>([['a', 50_000]]);
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 120_000,
    prepaidCreditPaise: 10_000,
    occupants: [
      { bookingId: 'b1', customerId: 'a', bedCount: 1, weight: 15 },
      { bookingId: 'b2', customerId: 'b', bedCount: 1, weight: 15 },
    ],
    checkoutCollectedByCustomerId: checkout,
    useProRata: false,
    activeBedCount: 2,
  });

  const invoiceTotal = result.invoices
    .filter((i) => !i.excludedBecauseCheckoutPaid)
    .reduce((sum, i) => sum + i.amountPaise, 0);
  const collected = result.checkoutCreditAppliedPaise + result.prepaidCreditAppliedPaise + invoiceTotal;
  assert.ok(collected <= 120_000);
  assert.equal(result.netSplittablePaise, 60_000);
});

test('no checkout credit bills all occupants equally by active bed count', () => {
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 40_000,
    prepaidCreditPaise: 0,
    occupants: [
      { bookingId: 'b1', customerId: 'a', bedCount: 1, weight: 30 },
      { bookingId: 'b2', customerId: 'b', bedCount: 1, weight: 30 },
    ],
    checkoutCollectedByCustomerId: new Map(),
    useProRata: false,
    activeBedCount: 4,
  });

  assert.equal(result.netSplittablePaise, 40_000);
  assert.equal(result.invoices.filter((i) => i.amountPaise > 0).length, 2);
  assert.equal(result.invoices[0]?.amountPaise, 10_000);
  assert.equal(result.invoices[1]?.amountPaise, 10_000);
});

test('room 203 — deduct checkout collection then split per active bed', () => {
  const grossTotalPaise = 287 * 1_600; // 459_200 — 287 units @ ₹16
  const checkoutCollected = new Map<string, number>([['departed', 99_000]]);
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise,
    prepaidCreditPaise: 0,
    occupants: [
      { bookingId: 'krishna', customerId: 'krishna', bedCount: 1, weight: 30 },
      { bookingId: 'vijay', customerId: 'vijay', bedCount: 1, weight: 30 },
      { bookingId: 'waqar', customerId: 'waqar', bedCount: 1, weight: 30 },
      { bookingId: 'departed', customerId: 'departed', bedCount: 1, weight: 10 },
    ],
    checkoutCollectedByCustomerId: checkoutCollected,
    useProRata: false,
    activeBedCount: 4,
  });

  assert.equal(result.checkoutCreditAppliedPaise, 99_000);
  assert.equal(result.netSplittablePaise, 360_200);
  const billable = result.invoices.filter((i) => i.amountPaise > 0);
  assert.equal(billable.length, 3);
  for (const line of billable) {
    assert.equal(line.amountPaise, 90_050);
  }
  const departed = result.invoices.find((i) => i.customerId === 'departed');
  assert.equal(departed?.amountPaise, 0);
  assert.equal(departed?.excludedBecauseCheckoutPaid, true);
});

test('historical contributions reduce pool and assign per-bed share to remaining occupant', () => {
  const grossTotalPaise = 299_200; // ₹2,992
  const contributions = new Map<string, number>([
    ['resident-a', 122_000],
    ['resident-b', 50_000],
  ]);
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise,
    prepaidCreditPaise: 0,
    contributionsByCustomerId: contributions,
    occupants: [
      { bookingId: 'b-a', customerId: 'resident-a', bedCount: 1, weight: 30 },
      { bookingId: 'b-b', customerId: 'resident-b', bedCount: 1, weight: 10 },
      { bookingId: 'b-c', customerId: 'resident-c', bedCount: 1, weight: 30 },
    ],
    checkoutCollectedByCustomerId: new Map(),
    useProRata: false,
    activeBedCount: 3,
  });

  assert.equal(result.roomContributionsAppliedPaise, 172_000);
  assert.equal(result.netSplittablePaise, 127_200);
  const remaining = result.invoices.find((i) => i.customerId === 'resident-c');
  assert.equal(remaining?.amountPaise, 42_400);
  assert.equal(result.invoices.find((i) => i.customerId === 'resident-a')?.amountPaise, 0);
  assert.equal(result.invoices.find((i) => i.customerId === 'resident-b')?.amountPaise, 0);
});

test('july bill ignores june contributions when contributions map is empty', () => {
  const result = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 300_000,
    prepaidCreditPaise: 0,
    occupants: [
      { bookingId: 'b1', customerId: 'july-a', bedCount: 1, weight: 30 },
      { bookingId: 'b2', customerId: 'july-b', bedCount: 1, weight: 30 },
    ],
    checkoutCollectedByCustomerId: new Map(),
    useProRata: false,
    activeBedCount: 2,
  });

  assert.equal(result.netSplittablePaise, 300_000);
  assert.equal(result.invoices.filter((i) => i.amountPaise > 0).length, 2);
});

const augustDays = billingMonthCalendarDays('2026-08-01');

function dailyAllocation(input: {
  grossTotalPaise?: number;
  occupants: Array<{
    bookingId: string;
    customerId: string;
    occupiedDates: string[];
  }>;
  contributions?: Map<string, number>;
  prepaidCreditPaise?: number;
}) {
  return allocateMonthlyElectricityInvoices({
    grossTotalPaise: input.grossTotalPaise ?? 3_100,
    prepaidCreditPaise: input.prepaidCreditPaise ?? 0,
    contributionsByCustomerId: input.contributions,
    occupants: input.occupants.map((occupant) => ({
      ...occupant,
      bedCount: 99,
      weight: occupant.occupiedDates.length,
    })),
    checkoutCollectedByCustomerId: new Map(),
    useProRata: false,
    activeBedCount: 99,
    billingDays: augustDays,
  });
}

test('daily room allocation ignores bed count and splits full-month residents equally', () => {
  const result = dailyAllocation({
    occupants: [
      { bookingId: 'a', customerId: 'a', occupiedDates: augustDays },
      { bookingId: 'b', customerId: 'b', occupiedDates: augustDays },
    ],
  });
  assert.deepEqual(
    result.invoices.map((row) => row.amountPaise),
    [1_550, 1_550],
  );
});

test('leave and join dates split liability at the half-open daily boundary', () => {
  const result = dailyAllocation({
    occupants: [
      { bookingId: 'a', customerId: 'a', occupiedDates: augustDays.slice(0, 15) },
      { bookingId: 'b', customerId: 'b', occupiedDates: augustDays.slice(15) },
    ],
  });
  assert.equal(result.calculatedShareByCustomerId.get('a'), 1_500);
  assert.equal(result.calculatedShareByCustomerId.get('b'), 1_600);
});

test('empty room-days remain operator absorbed and are not redivided', () => {
  const result = dailyAllocation({
    occupants: [{ bookingId: 'a', customerId: 'a', occupiedDates: augustDays.slice(10) }],
  });
  assert.equal(result.emptyDayPaise, 1_000);
  assert.equal(result.invoices[0]?.amountPaise, 2_100);
});

test('daily occupant count changes determine each resident share', () => {
  const result = dailyAllocation({
    occupants: [
      { bookingId: 'a', customerId: 'a', occupiedDates: augustDays },
      { bookingId: 'b', customerId: 'b', occupiedDates: augustDays.slice(15) },
    ],
  });
  assert.equal(result.invoices.find((row) => row.customerId === 'a')?.amountPaise, 2_300);
  assert.equal(result.invoices.find((row) => row.customerId === 'b')?.amountPaise, 800);
});

test('simultaneous join leave and bed movement does not duplicate a daily share', () => {
  const result = dailyAllocation({
    occupants: [
      { bookingId: 'moving', customerId: 'moving', occupiedDates: augustDays },
      { bookingId: 'leaving', customerId: 'leaving', occupiedDates: augustDays.slice(0, 15) },
      { bookingId: 'joining', customerId: 'joining', occupiedDates: augustDays.slice(15) },
    ],
  });
  assert.equal(result.dailyAllocation.every((day) => day.occupantCustomerIds.length === 2), true);
  assert.equal(result.calculatedShareByCustomerId.get('moving'), 1_550);
});

test('repeated daily generation is deterministic and idempotent', () => {
  const input = {
    grossTotalPaise: 10_007,
    occupants: [
      { bookingId: 'a', customerId: 'a', occupiedDates: augustDays },
      { bookingId: 'b', customerId: 'b', occupiedDates: augustDays.slice(7) },
    ],
  };
  assert.deepEqual(dailyAllocation(input), dailyAllocation(input));
});

test('checkout contribution applies only against that resident calculated share', () => {
  const result = dailyAllocation({
    occupants: [
      { bookingId: 'a', customerId: 'a', occupiedDates: augustDays },
      { bookingId: 'b', customerId: 'b', occupiedDates: augustDays },
    ],
    contributions: new Map([['a', 1_000]]),
  });
  assert.equal(result.calculatedShareByCustomerId.get('a'), 1_550);
  assert.equal(result.contributionAppliedByCustomerId.get('a'), 1_000);
  assert.equal(result.invoices.find((row) => row.customerId === 'a')?.amountPaise, 550);
  assert.equal(result.invoices.find((row) => row.customerId === 'b')?.amountPaise, 1_550);
});

test('resident shares plus empty and rounding paise conserve the room pool', () => {
  const result = dailyAllocation({
    grossTotalPaise: 100,
    occupants: [
      { bookingId: 'a', customerId: 'a', occupiedDates: augustDays },
      { bookingId: 'b', customerId: 'b', occupiedDates: augustDays },
    ],
  });
  const residentShares = [...result.calculatedShareByCustomerId.values()].reduce(
    (sum, amount) => sum + amount,
    0,
  );
  assert.equal(
    residentShares + result.emptyDayPaise + result.dailyRoundingRemainderPaise,
    result.netSplittablePaise,
  );
});

test('property matrix conserves paise across daily occupancy and rounding variants', () => {
  for (let residentCount = 0; residentCount <= 6; residentCount += 1) {
    for (const grossTotalPaise of [0, 1, 29, 31, 97, 3_101, 99_999]) {
      const occupants = Array.from({ length: residentCount }, (_, index) => ({
        bookingId: `booking-${index}`,
        customerId: `resident-${index}`,
        occupiedDates: augustDays.filter(
          (_, dayIndex) => (dayIndex + index) % (index + 2) !== 0,
        ),
      }));
      const result = dailyAllocation({ grossTotalPaise, occupants });
      const residentShares = [...result.calculatedShareByCustomerId.values()].reduce(
        (sum, amount) => sum + amount,
        0,
      );
      assert.equal(
        residentShares + result.emptyDayPaise + result.dailyRoundingRemainderPaise,
        result.netSplittablePaise,
        `residents=${residentCount} gross=${grossTotalPaise}`,
      );
    }
  }
});

test('production-shaped month handles transfers, joins, departures, empty days and contribution', () => {
  const result = dailyAllocation({
    grossTotalPaise: 459_203,
    occupants: [
      { bookingId: 'continuous', customerId: 'continuous', occupiedDates: augustDays },
      { bookingId: 'departed', customerId: 'departed', occupiedDates: augustDays.slice(0, 9) },
      { bookingId: 'joined', customerId: 'joined', occupiedDates: augustDays.slice(14) },
      { bookingId: 'short-stay', customerId: 'short-stay', occupiedDates: augustDays.slice(20, 25) },
    ],
    contributions: new Map([['departed', 40_000]]),
  });
  const invoices = result.invoices.reduce((sum, row) => sum + row.amountPaise, 0);
  const contributions = [...result.contributionAppliedByCustomerId.values()].reduce(
    (sum, amount) => sum + amount,
    0,
  );
  assert.equal(
    invoices +
      contributions +
      result.emptyDayPaise +
      result.dailyRoundingRemainderPaise,
    result.netSplittablePaise,
  );
  assert.equal(result.dailyAllocation.length, 31);
});
