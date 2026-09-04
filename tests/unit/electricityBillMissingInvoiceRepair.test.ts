import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  isBillWithoutInvoicesCondition,
  planElectricityBillMissingInvoiceRepair,
  type CanonicalElectricityInvoiceDraft,
  type ExistingElectricityInvoiceFact,
} from '@/src/lib/billing/electricityBillMissingInvoiceRepairPlan';
import { mergeRoomElectricityCoverage } from '@/src/lib/billing/roomElectricityOccupancyCoverage';

const roomTotal = 13500; // ₹135

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
    unitsShare: 3,
    activeDays: 10,
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
    invoiceNumber: `ELE-2026-09-${customerId}`,
    customerId,
    bookingId: `bk-${customerId}`,
    amountPaise,
    paidPaise,
    status: 'pending',
  };
}

test('1 — bill exists + zero invoices → creates invoices', () => {
  const plan = planElectricityBillMissingInvoiceRepair({
    roomTotalPaise: roomTotal,
    canonicalLines: [draft('a', 4500), draft('b', 4500), draft('c', 4500)],
    existingInvoices: [],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.kind, 'create_missing');
  assert.equal(plan.create.length, 3);
  assert.equal(plan.proposedCreateTotalPaise, roomTotal);
});

test('2 — bill exists + partial invoices → creates only missing', () => {
  const plan = planElectricityBillMissingInvoiceRepair({
    roomTotalPaise: roomTotal,
    canonicalLines: [draft('a', 4500), draft('b', 4500), draft('c', 4500)],
    existingInvoices: [existing('a', 4500)],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.kind, 'create_missing');
  assert.equal(plan.create.length, 2);
  assert.deepEqual(
    plan.create.map((c) => c.customerId).sort(),
    ['b', 'c'],
  );
  assert.equal(plan.preserve.length, 1);
});

test('3 — bill exists + all invoices → no-op', () => {
  const plan = planElectricityBillMissingInvoiceRepair({
    roomTotalPaise: roomTotal,
    canonicalLines: [draft('a', 4500), draft('b', 4500), draft('c', 4500)],
    existingInvoices: [existing('a', 4500), existing('b', 4500), existing('c', 4500)],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.kind, 'noop');
  assert.equal(plan.create.length, 0);
});

test('4–5 — existing paid invoice and payment preserved', () => {
  const plan = planElectricityBillMissingInvoiceRepair({
    roomTotalPaise: roomTotal,
    canonicalLines: [draft('a', 4500), draft('b', 9000)],
    existingInvoices: [existing('a', 4500, 4500)],
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.preserve[0]?.paidPaise, 4500);
  assert.equal(plan.create.length, 1);
  assert.equal(plan.create[0]?.customerId, 'b');
});

test('6 — retry after full fan-out is idempotent no-op', () => {
  const first = planElectricityBillMissingInvoiceRepair({
    roomTotalPaise: roomTotal,
    canonicalLines: [draft('a', 13500)],
    existingInvoices: [],
  });
  assert.equal(first.kind, 'create_missing');
  const second = planElectricityBillMissingInvoiceRepair({
    roomTotalPaise: roomTotal,
    canonicalLines: [draft('a', 13500)],
    existingInvoices: [existing('a', 13500)],
  });
  assert.equal(second.kind, 'noop');
});

test('7–8 — historical occupancy: left before month excluded; mid-month join prorated days', () => {
  const leftBefore = mergeRoomElectricityCoverage({
    roomId: 'r1',
    billingMonth: '2026-09-01',
    segments: [
      {
        roomId: 'r1',
        bookingId: 'bk-left',
        customerId: 'left',
        bedId: 'b1',
        startDate: '2026-08-01',
        endDateExclusive: '2026-09-01',
      },
    ],
  });
  assert.equal(leftBefore.length, 0);

  const midJoin = mergeRoomElectricityCoverage({
    roomId: 'r1',
    billingMonth: '2026-09-01',
    segments: [
      {
        roomId: 'r1',
        bookingId: 'bk-join',
        customerId: 'join',
        bedId: 'b1',
        startDate: '2026-09-16',
        endDateExclusive: null,
      },
    ],
  });
  assert.equal(midJoin[0]?.activeDays, 15);
});

test('9–10 — empty days and same-room bed change continuous', () => {
  const emptyDays = mergeRoomElectricityCoverage({
    roomId: 'r1',
    billingMonth: '2026-09-01',
    segments: [],
  });
  assert.equal(emptyDays.length, 0);

  const sameRoom = mergeRoomElectricityCoverage({
    roomId: 'r1',
    billingMonth: '2026-09-01',
    segments: [
      {
        roomId: 'r1',
        bookingId: 'bk',
        customerId: 'c1',
        bedId: 'b3',
        startDate: '2026-09-01',
        endDateExclusive: '2026-09-10',
      },
      {
        roomId: 'r1',
        bookingId: 'bk',
        customerId: 'c1',
        bedId: 'b1',
        startDate: '2026-09-10',
        endDateExclusive: null,
      },
    ],
  });
  assert.equal(sameRoom[0]?.activeDays, 30);
  assert.equal(sameRoom[0]?.intervals.length, 1);
});

test('11 — cross-room transfer splits at boundary', () => {
  const segments = [
    {
      roomId: 'old',
      bookingId: 'bk',
      customerId: 'c1',
      bedId: 'b-old',
      startDate: '2026-09-01',
      endDateExclusive: '2026-09-11',
    },
    {
      roomId: 'new',
      bookingId: 'bk',
      customerId: 'c1',
      bedId: 'b-new',
      startDate: '2026-09-11',
      endDateExclusive: null,
    },
  ];
  const oldRoom = mergeRoomElectricityCoverage({
    roomId: 'old',
    billingMonth: '2026-09-01',
    segments,
  });
  const newRoom = mergeRoomElectricityCoverage({
    roomId: 'new',
    billingMonth: '2026-09-01',
    segments,
  });
  assert.equal(oldRoom[0]?.activeDays, 10);
  assert.equal(newRoom[0]?.activeDays, 20);
});

test('12 — allocation never exceeds room total', () => {
  const plan = planElectricityBillMissingInvoiceRepair({
    roomTotalPaise: roomTotal,
    canonicalLines: [draft('a', 8000), draft('b', 8000)],
    existingInvoices: [],
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.kind, 'mismatch');
  assert.match(plan.mismatchReasons.join(' '), /exceeds room total/i);
});

test('13 — Room 402 meter math 850→859 = 9 × ₹15 = ₹135', () => {
  const units = 859 - 850;
  assert.equal(units, 9);
  assert.equal(units * 1500, 13500);
  assert.equal(
    isBillWithoutInvoicesCondition({
      roomTotalPaise: 13500,
      existingActiveInvoiceCount: 0,
      historicalOccupantCount: 3,
    }),
    true,
  );
});

test('14 — unpaid amount mismatch fails closed instead of inventing money', () => {
  const plan = planElectricityBillMissingInvoiceRepair({
    roomTotalPaise: roomTotal,
    canonicalLines: [draft('a', 4500)],
    existingInvoices: [existing('a', 3000)],
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.create.length, 0);
});

test('repair uses bill prepaid credit not live room balance for allocation', () => {
  const service = readFileSync('src/services/repairElectricityBillMissingInvoices.ts', 'utf8');
  assert.match(service, /prepaidCreditAppliedPaise/);
  assert.match(service, /storedPrepaidPaise/);
  assert.match(service, /prepaidForAllocation/);
  // Live room prepaid may be restored after reversing incorrect apply — never used as allocation input.
  assert.match(service, /prepaidCreditPaise: Math\.max\(0, input\.prepaidCreditPaise\)/);
});

test('15–16 — repair service is generic; no resident SQL; meters unchanged', () => {
  const service = readFileSync('src/services/repairElectricityBillMissingInvoices.ts', 'utf8');
  assert.match(service, /repairElectricityBillMissingInvoices/);
  assert.match(service, /previewElectricityBillMissingInvoices/);
  assert.match(service, /loadRoomElectricityOccupantsForMonth/);
  assert.match(service, /meterFactsUnchanged: true/);
  assert.doesNotMatch(service, /WHERE.*full_name ILIKE/);
  assert.doesNotMatch(service, /room_number = '402'/);
  assert.doesNotMatch(service, /UPDATE electricity_bills[\s\S]*previous_reading/);
});
