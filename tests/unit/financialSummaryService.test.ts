import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeOutstandingMoneyFromInvoices,
  filterElectricityAwaitingResidentPayment,
  filterRentAwaitingResidentPayment,
} from '../../src/services/financialSummaryService';
import type {
  AdminElectricityInvoiceReminderRow,
  AdminRentInvoiceRow,
} from '../../src/db/queries/admin';

function rentRow(
  overrides: Partial<AdminRentInvoiceRow> & { id: string; outstandingPaise: number },
): AdminRentInvoiceRow {
  return {
    invoiceNumber: 'R-1',
    bookingId: 'b1',
    bookingCode: 'BK1',
    customerId: 'c1',
    customerFullName: 'Test',
    customerPhone: '999',
    pgId: 'pg1',
    pgName: 'PG',
    bedId: 'bed1',
    bedCode: 'A1',
    roomNumber: '101',
    billingMonth: '2026-07-01',
    dueDate: '2026-07-05',
    rentPaise: 10_000,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: 0,
    status: 'pending',
    paidAt: null,
    createdAt: new Date(),
    notes: null,
    paymentProvider: null,
    paymentProofUrl: null,
    effectiveStatus: 'pending',
    ...overrides,
  };
}

function elecRow(
  overrides: Partial<AdminElectricityInvoiceReminderRow> & { id: string; outstandingPaise: number },
): AdminElectricityInvoiceReminderRow {
  return {
    invoiceNumber: 'E-1',
    customerId: 'c1',
    customerFullName: 'Test',
    customerPhone: '999',
    pgId: 'pg1',
    pgName: 'PG',
    roomNumber: '101',
    billingMonth: '2026-07-01',
    dueDate: '2026-07-05',
    amountPaise: 2_000,
    effectiveStatus: 'pending',
    isOverdue: false,
    bookingId: 'b1',
    ...overrides,
  };
}

test('filterRentAwaitingResidentPayment excludes paid, cancelled, and payment_in_progress', () => {
  const rows = [
    rentRow({ id: '1', outstandingPaise: 5_000, effectiveStatus: 'pending' }),
    rentRow({ id: '2', outstandingPaise: 0, effectiveStatus: 'paid' }),
    rentRow({ id: '3', outstandingPaise: 1_000, effectiveStatus: 'payment_in_progress' }),
    rentRow({ id: '4', outstandingPaise: 2_000, effectiveStatus: 'overdue' }),
  ];
  const waiting = filterRentAwaitingResidentPayment(rows);
  assert.deepEqual(
    waiting.map((r) => r.id),
    ['1', '4'],
  );
});

test('filterElectricityAwaitingResidentPayment excludes proof-uploaded invoices', () => {
  const rows = [
    elecRow({ id: '1', outstandingPaise: 2_000 }),
    elecRow({ id: '2', outstandingPaise: 2_000, paymentProofUrl: 'https://proof' }),
  ];
  const waiting = filterElectricityAwaitingResidentPayment(rows);
  assert.deepEqual(waiting.map((r) => r.id), ['1']);
});

test('computeOutstandingMoneyFromInvoices sums only waiting rent and electricity', () => {
  const snapshot = {
    rentWaiting: [
      rentRow({ id: '1', outstandingPaise: 10_000 }),
      rentRow({ id: '2', outstandingPaise: 5_000 }),
    ],
    electricityWaiting: [elecRow({ id: 'e1', outstandingPaise: 3_000 })],
  };
  const result = computeOutstandingMoneyFromInvoices(snapshot);
  assert.equal(result.pendingRentInvoices, 2);
  assert.equal(result.pendingRentInvoicesPaise, 15_000);
  assert.equal(result.pendingElectricityInvoices, 1);
  assert.equal(result.pendingElectricityInvoicesPaise, 3_000);
  assert.equal(result.totalOutstandingPaise, 18_000);
});
