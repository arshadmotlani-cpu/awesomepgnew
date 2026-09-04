import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveElectricityStayEndExclusive } from '@/src/lib/billing/resolveElectricityStayEndExclusive';
import { planElectricityBillAllocationReconcile } from '@/src/lib/billing/electricityBillAllocationReconcilePlan';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { mergeRoomElectricityCoverage } from '@/src/lib/billing/roomElectricityOccupancyCoverage';
import { billingMonthCalendarDays } from '@/src/lib/billing/roomElectricityOccupancyCoverage';
import type { CanonicalElectricityInvoiceDraft } from '@/src/lib/billing/electricityBillMissingInvoiceRepairPlan';
import type { ExistingElectricityInvoiceFact } from '@/src/lib/billing/electricityBillMissingInvoiceRepairPlan';
import { readFileSync } from 'node:fs';

const SEP = '2026-09-01';
const days = billingMonthCalendarDays(SEP);

function draft(
  customerId: string,
  amountPaise: number,
  overrides: Partial<CanonicalElectricityInvoiceDraft> = {},
): CanonicalElectricityInvoiceDraft {
  return {
    customerId,
    customerName: customerId,
    bookingId: `bk-${customerId}`,
    bedId: `bed-${customerId}`,
    amountPaise,
    unitsShare: 1,
    activeDays: 30,
    ...overrides,
  };
}

function existing(
  customerId: string,
  amountPaise: number,
  paidPaise = 0,
): ExistingElectricityInvoiceFact {
  return {
    invoiceId: `inv-${customerId}`,
    invoiceNumber: `ELE-${customerId}`,
    customerId,
    bookingId: `bk-${customerId}`,
    amountPaise,
    paidPaise,
    status: 'pending',
  };
}

test('joined before billing month → full-month occupancy days', () => {
  const [cov] = mergeRoomElectricityCoverage({
    roomId: 'r',
    billingMonth: SEP,
    segments: [
      {
        roomId: 'r',
        bookingId: 'bk',
        customerId: 'saswat',
        bedId: 'b3',
        startDate: '2026-08-08',
        endDateExclusive: null,
      },
    ],
  });
  assert.equal(cov.activeDays, 30);
  assert.deepEqual(cov.occupiedDates, days);
});

test('joined during billing month → only days present', () => {
  const [cov] = mergeRoomElectricityCoverage({
    roomId: 'r',
    billingMonth: SEP,
    segments: [
      {
        roomId: 'r',
        bookingId: 'bk',
        customerId: 'new',
        bedId: 'b1',
        startDate: '2026-09-10',
        endDateExclusive: null,
      },
    ],
  });
  assert.equal(cov.activeDays, 21);
  assert.equal(cov.occupiedDates[0], '2026-09-10');
});

test('left before billing month → zero September days after vacating clamp', () => {
  const end = resolveElectricityStayEndExclusive({
    stayRangeUpper: null,
    vacatingDate: '2026-08-07',
    reservationStatus: 'completed',
    bookingStatus: 'completed',
  });
  assert.equal(end, '2026-08-08');
  const coverage = mergeRoomElectricityCoverage({
    roomId: 'r',
    billingMonth: SEP,
    segments: [
      {
        roomId: 'r',
        bookingId: 'bk',
        customerId: 'former',
        bedId: 'b3',
        startDate: '2026-07-07',
        endDateExclusive: end,
      },
    ],
  });
  assert.equal(coverage.length, 0);
});

test('leaves during billing month → allocation only through departure boundary', () => {
  const end = resolveElectricityStayEndExclusive({
    stayRangeUpper: null,
    vacatingDate: '2026-09-09',
    reservationStatus: 'active',
    bookingStatus: 'confirmed',
  });
  assert.equal(end, '2026-09-10');
  const [cov] = mergeRoomElectricityCoverage({
    roomId: 'r',
    billingMonth: SEP,
    segments: [
      {
        roomId: 'r',
        bookingId: 'bk',
        customerId: 'saswat',
        bedId: 'b3',
        startDate: '2026-08-08',
        endDateExclusive: end,
      },
    ],
  });
  assert.equal(cov.activeDays, 9);
  assert.equal(cov.occupiedDates.at(-1), '2026-09-09');
});

test('three residents entire month → three-way daily allocation', () => {
  const occupants = ['a', 'b', 'c'].map((id) => ({
    bookingId: `bk-${id}`,
    customerId: id,
    bedCount: 1,
    weight: 30,
    occupiedDates: days,
  }));
  const allocation = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 139200,
    prepaidCreditPaise: 0,
    occupants,
    checkoutCollectedByCustomerId: new Map(),
    useProRata: true,
    activeBedCount: 3,
    billingDays: days,
  });
  assert.equal(allocation.invoices.length, 3);
  for (const inv of allocation.invoices) {
    assert.equal(inv.amountPaise, 46380);
  }
  const total = allocation.invoices.reduce((s, i) => s + i.amountPaise, 0);
  assert.ok(total + allocation.emptyDayPaise + allocation.dailyRoundingRemainderPaise <= 139200);
});

test('current snapshot former resident with open stay → vacating clamp zeros September', () => {
  const end = resolveElectricityStayEndExclusive({
    stayRangeUpper: null,
    vacatingDate: '2026-07-21',
    expectedCheckoutDate: '2026-07-21',
    reservationStatus: 'completed',
    bookingStatus: 'completed',
  });
  assert.equal(end, '2026-07-22');
});

test('same-room bed change → continuous room coverage', () => {
  const [cov] = mergeRoomElectricityCoverage({
    roomId: 'r',
    billingMonth: SEP,
    segments: [
      {
        roomId: 'r',
        bookingId: 'bk',
        customerId: 'r1',
        bedId: 'b3',
        startDate: SEP,
        endDateExclusive: '2026-09-15',
      },
      {
        roomId: 'r',
        bookingId: 'bk',
        customerId: 'r1',
        bedId: 'b1',
        startDate: '2026-09-15',
        endDateExclusive: null,
      },
    ],
  });
  assert.equal(cov.activeDays, 30);
});

test('cross-room transfer → exact room/day boundary', () => {
  const segments = [
    {
      roomId: 'old',
      bookingId: 'bk',
      customerId: 'r1',
      bedId: 'b1',
      startDate: SEP,
      endDateExclusive: '2026-09-12',
    },
    {
      roomId: 'new',
      bookingId: 'bk',
      customerId: 'r1',
      bedId: 'b2',
      startDate: '2026-09-12',
      endDateExclusive: null,
    },
  ];
  const [oldRoom] = mergeRoomElectricityCoverage({
    roomId: 'old',
    billingMonth: SEP,
    segments,
  });
  const [newRoom] = mergeRoomElectricityCoverage({
    roomId: 'new',
    billingMonth: SEP,
    segments,
  });
  assert.equal(oldRoom.occupiedDates.at(-1), '2026-09-11');
  assert.equal(newRoom.occupiedDates[0], '2026-09-12');
});

test('rejected incorrect invoice → reconcile updates unpaid amount in place', () => {
  const plan = planElectricityBillAllocationReconcile({
    roomTotalPaise: 139200,
    canonicalLines: [draft('saswat', 13914, { activeDays: 9 })],
    existingInvoices: [existing('saswat', 8352)],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.code, 'BILL_AMOUNT_MISMATCH');
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0]?.canonicalAmountPaise, 13914);
  assert.equal(plan.cancel.length, 0);
  assert.equal(plan.create.length, 0);
});

test('paid invoice → never silently rewritten', () => {
  const plan = planElectricityBillAllocationReconcile({
    roomTotalPaise: 139200,
    canonicalLines: [draft('a', 10000)],
    existingInvoices: [existing('a', 8000, 8000)],
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.kind, 'paid_conflict');
  assert.equal(plan.cancel.length, 0);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.create.length, 0);
});

test('incorrect existing + orphan former residents → generic reconcile', () => {
  const plan = planElectricityBillAllocationReconcile({
    roomTotalPaise: 139200,
    canonicalLines: [
      draft('dhruv', 50000),
      draft('ameen', 50000),
      draft('saswat', 13914),
    ],
    existingInvoices: [
      existing('dhruv', 32712),
      existing('ameen', 32712),
      existing('saswat', 8352),
      existing('kunal', 32712),
      existing('krishna', 32712),
    ],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.cancel.length, 2);
  assert.equal(plan.update.length, 3);
  assert.equal(plan.create.length, 0);
});

test('missing invoice → create only', () => {
  const plan = planElectricityBillAllocationReconcile({
    roomTotalPaise: 9000,
    canonicalLines: [draft('a', 3000), draft('b', 3000), draft('c', 3000)],
    existingInvoices: [existing('a', 3000)],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.create.length, 2);
  assert.equal(plan.cancel.length, 0);
});

test('retry / already correct → noop without duplicates', () => {
  const plan = planElectricityBillAllocationReconcile({
    roomTotalPaise: 9000,
    canonicalLines: [draft('a', 3000), draft('b', 3000), draft('c', 3000)],
    existingInvoices: [existing('a', 3000), existing('b', 3000), existing('c', 3000)],
  });
  assert.equal(plan.kind, 'noop');
  assert.equal(plan.cancel.length, 0);
  assert.equal(plan.create.length, 0);
});

test('allocation ≤ room total for Room 102 shaped Saswat case', () => {
  const end = resolveElectricityStayEndExclusive({
    stayRangeUpper: '2026-09-10',
    vacatingDate: '2026-09-09',
    reservationStatus: 'active',
    bookingStatus: 'confirmed',
  });
  const saswatDays = mergeRoomElectricityCoverage({
    roomId: '102',
    billingMonth: SEP,
    segments: [
      {
        roomId: '102',
        bookingId: 'bk-saswat',
        customerId: 'saswat',
        bedId: 'b3',
        startDate: '2026-08-08',
        endDateExclusive: end,
      },
    ],
  })[0]!.occupiedDates;
  const full = days;
  const occupants = [
    { bookingId: 'bk-d', customerId: 'dhruv', bedCount: 1, weight: 30, occupiedDates: full },
    { bookingId: 'bk-a', customerId: 'ameen', bedCount: 1, weight: 30, occupiedDates: full },
    {
      bookingId: 'bk-s',
      customerId: 'saswat',
      bedCount: 1,
      weight: saswatDays.length,
      occupiedDates: saswatDays,
    },
  ];
  // Former residents clamped out — must not appear.
  const allocation = allocateMonthlyElectricityInvoices({
    grossTotalPaise: 139200,
    prepaidCreditPaise: 0,
    occupants,
    checkoutCollectedByCustomerId: new Map(),
    useProRata: true,
    activeBedCount: 3,
    billingDays: days,
  });
  const byId = new Map(allocation.invoices.map((i) => [i.customerId, i.amountPaise]));
  assert.equal(byId.get('saswat'), 9 * Math.floor(4640 / 3)); // 13914
  assert.ok(!byId.has('kunal'));
  assert.ok(!byId.has('krishna'));
  const residentTotal = allocation.invoices.reduce((s, i) => s + i.amountPaise, 0);
  assert.ok(residentTotal <= 139200);
});

test('open-ended shorten predicate includes NULL uppers (vacating.ts)', () => {
  const src = readFileSync('src/services/vacating.ts', 'utf8');
  assert.match(src, /upper\(stay_range\) IS DISTINCT FROM/);
  assert.match(src, /upper\(stay_range\) IS NULL OR upper\(stay_range\) >/);
  assert.doesNotMatch(
    src,
    /AND status IN \('hold', 'active'\)\s+AND upper\(stay_range\) > \$\{stayRangeEndExclusive\}/,
  );
});
