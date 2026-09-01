import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeElectricityLateFee,
  computeLateFee,
} from '../../src/services/billing';
import {
  applyLateFeePolicy,
  capLateFeeAtPrincipalPercent,
  computeLateFeeWithPolicy,
  lateFeeCapPaise,
  legacyLateFeePaise,
  type LateFeePolicySnapshot,
} from '../../src/services/lateFeePolicy';
import { projectElectricityInvoice } from '../../src/services/electricityBilling';
import {
  projectInvoice,
} from '../../src/services/rentInvoices';
import type { RentInvoice } from '../../src/db/schema';

const percent1: LateFeePolicySnapshot = {
  type: 'percent_of_principal',
  amountPaise: null,
  percentBps: 100,
  graceDays: 0,
  maxFeePaise: null,
  appliesTo: 'both',
};

test('lateFeeCapPaise is 10% of principal floored', () => {
  assert.equal(lateFeeCapPaise(500_000), 50_000);
  assert.equal(lateFeeCapPaise(286_000), 28_600);
  assert.equal(lateFeeCapPaise(0), 0);
});

test('rent below cap — existing 1%/day unchanged', () => {
  const rent = 500_000;
  const issueDate = '2026-08-01';
  const today = '2026-08-10'; // 5 chargeable days after grace → 5%
  assert.equal(computeLateFee({ rentPaise: rent, issueDate, today }), 25_000);
  assert.equal(
    computeLateFeeWithPolicy({
      principalPaise: rent,
      issueDate,
      today,
      policy: percent1,
    }),
    25_000,
  );
});

test('rent reaches exactly 10% at 10 chargeable days', () => {
  const rent = 500_000;
  const issueDate = '2026-08-01';
  const today = '2026-08-15'; // 10 chargeable days
  assert.equal(computeLateFee({ rentPaise: rent, issueDate, today }), 50_000);
  assert.equal(lateFeeCapPaise(rent), 50_000);
});

test('rent unpaid 30/60/120 days — late fee frozen at 10%', () => {
  const rent = 500_000;
  const issueDate = '2026-08-01';
  const cap = 50_000;
  for (const today of ['2026-08-21', '2026-09-01', '2026-10-30', '2026-12-01']) {
    assert.equal(computeLateFee({ rentPaise: rent, issueDate, today }), cap);
  }
});

test('electricity below cap unchanged', () => {
  const amount = 286_000;
  const issueDate = '2026-07-01';
  const today = '2026-07-10'; // 5 chargeable days
  assert.equal(
    computeElectricityLateFee({ amountPaise: amount, issueDate, today }),
    14_300,
  );
});

test('electricity reaches 10% and stays capped', () => {
  const amount = 286_000;
  const cap = 28_600;
  const issueDate = '2026-07-01';
  assert.equal(
    computeElectricityLateFee({ amountPaise: amount, issueDate, today: '2026-07-15' }),
    cap,
  );
  assert.equal(
    computeElectricityLateFee({ amountPaise: amount, issueDate, today: '2026-09-01' }),
    cap,
  );
});

test('late fee is not compounded — cap is single lifetime maximum', () => {
  const principal = 500_000;
  const day10 = legacyLateFeePaise(principal, 10);
  const day100 = legacyLateFeePaise(principal, 100);
  assert.equal(day10, 50_000);
  assert.equal(day100, 50_000);
  assert.equal(day100, day10);
});

test('policy maxFeePaise cannot exceed 10% hard cap', () => {
  const highCap: LateFeePolicySnapshot = { ...percent1, maxFeePaise: 100_000 };
  const rent = 500_000;
  assert.equal(
    applyLateFeePolicy({ principalPaise: rent, overdueDays: 20, policy: highCap }),
    50_000,
  );
});

test('paid rent invoice projection unaffected — uses locked late fee', () => {
  const invoice = {
    id: 'inv-1',
    bookingId: 'b1',
    customerId: 'c1',
    rentPaise: 500_000,
    discountPaise: 0,
    paidPrincipalPaise: 500_000,
    paidLateFeePaise: 60_000,
    lateFeeLockedPaise: 60_000,
    status: 'paid' as const,
    billingMonth: '2026-07-01',
    createdAt: new Date('2026-07-01'),
  } satisfies Partial<RentInvoice> as RentInvoice;

  const projected = projectInvoice(invoice);
  assert.equal(projected.accruedLateFeePaise, 60_000);
  assert.equal(projected.outstandingPaise, 0);
});

test('projectElectricityInvoice accrues zero late fee on open invoices (deadline only)', () => {
  const projected = projectElectricityInvoice({
    id: 'e1',
    amountPaise: 286_000,
    paidPaise: 0,
    status: 'overdue',
    dueDate: '2026-07-05',
    createdAt: new Date('2026-07-01'),
    lateFeeLockedPaise: null,
    lateFeeWaived: false,
    electricityBillId: 'bill-1',
    bookingId: 'b1',
    customerId: 'c1',
    invoiceNumber: 'ELE-TEST',
    billingMonth: '2026-07-01',
    roomId: 'r1',
    unitsShare: '1',
    pgId: 'pg1',
    financialInvoiceId: null,
    supersededByInvoiceId: null,
    updatedAt: new Date(),
  } as Parameters<typeof projectElectricityInvoice>[0], '2026-10-01');

  assert.equal(projected.accruedLateFeePaise, 0);
  assert.equal(projected.outstandingPaise, 286_000);
});

test('proof snapshot late fee capped in rent projection', () => {
  const invoice = {
    id: 'inv-2',
    bookingId: 'b1',
    customerId: 'c1',
    rentPaise: 500_000,
    discountPaise: 0,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: null,
    status: 'payment_in_progress' as const,
    billingMonth: '2026-08-01',
    createdAt: new Date('2026-08-01'),
    proofSubmittedAt: new Date('2026-08-15'),
    proofSnapshotLateFeePaise: 80_000,
    proofSnapshotOutstandingPaise: 580_000,
    proofSnapshotPrincipalDuePaise: 500_000,
    paymentProofUrl: 'https://example.com/proof.jpg',
  } satisfies Partial<RentInvoice> as RentInvoice;

  const projected = projectInvoice(invoice);
  assert.equal(projected.accruedLateFeePaise, 50_000);
  assert.equal(projected.outstandingPaise, 550_000);
});

test('capLateFeeAtPrincipalPercent helper', () => {
  assert.equal(capLateFeeAtPrincipalPercent(500_000, 80_000), 50_000);
  assert.equal(capLateFeeAtPrincipalPercent(500_000, 30_000), 30_000);
});
