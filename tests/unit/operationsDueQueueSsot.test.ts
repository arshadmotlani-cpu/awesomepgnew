/**
 * Operations Due queues must follow canonical invoice/payment projection SSOT.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCollectionsQueue,
  rentRowToQueueItem,
  electricityRowToQueueItem,
} from '@/src/lib/billing/collectionsQueue';
import { buildRentInvoiceProjectInput } from '@/src/lib/billing/rentInvoiceProjectInput';
import { projectInvoice } from '@/src/services/rentInvoices';
import { projectAdminRentInvoiceRow } from '@/src/services/residentFinancialEngine';
import {
  deriveAdminNavBadgesFromOperationsQueue,
  operationsTotalPendingCount,
} from '@/src/lib/operations/operationsQueueCounts';
import type { AdminElectricityInvoiceReminderRow, AdminRentInvoiceRow } from '@/src/db/queries/admin';

const TODAY = '2026-09-13';

function rentAdminRow(
  over: Partial<AdminRentInvoiceRow> & Pick<AdminRentInvoiceRow, 'id' | 'outstandingPaise' | 'effectiveStatus'>,
): AdminRentInvoiceRow {
  return {
    invoiceNumber: 'RNT-TEST',
    bookingId: 'bk-1',
    bookingCode: 'APG-1',
    customerId: 'c-1',
    customerFullName: 'Resident',
    customerPhone: '9000000000',
    pgId: 'pg-1',
    pgName: 'PG',
    bedId: 'bed-1',
    bedCode: 'B1',
    roomNumber: '101',
    billingMonth: '2026-09-01',
    dueDate: '2026-09-05',
    rentPaise: 10_000_00,
    lateFeeBasePaise: 10_000_00,
    discountPaise: 0,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: null,
    status: 'overdue',
    paidAt: null,
    paymentId: null,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    notes: null,
    paymentProvider: null,
    paymentRawPayload: null,
    paymentProofUrl: null,
    proofSubmittedAt: null,
    proofSnapshotOutstandingPaise: null,
    proofSnapshotLateFeePaise: null,
    proofSnapshotPrincipalDuePaise: null,
    cancelledAt: null,
    cancellationReason: null,
    isAdhoc: false,
    invoiceSubtype: 'standard',
    ...over,
  };
}

function elecRow(
  over: Partial<AdminElectricityInvoiceReminderRow> &
    Pick<AdminElectricityInvoiceReminderRow, 'id' | 'outstandingPaise'>,
): AdminElectricityInvoiceReminderRow {
  return {
    invoiceNumber: 'ELE-TEST',
    bookingId: 'bk-1',
    customerId: 'c-1',
    customerFullName: 'Resident',
    customerPhone: '9000000000',
    pgId: 'pg-1',
    pgName: 'PG',
    roomNumber: '101',
    bedCode: 'B1',
    billingMonth: '2026-09-01',
    dueDate: '2026-09-10',
    amountPaise: over.outstandingPaise,
    isOverdue: true,
    paymentProofUrl: null,
    effectiveStatus: 'pending',
    ...over,
  };
}

test('genuinely unpaid rent appears in Rent due queue', () => {
  const row = rentAdminRow({
    id: 'rent-unpaid',
    outstandingPaise: 5_000_00,
    effectiveStatus: 'overdue',
  });
  const item = rentRowToQueueItem(row, TODAY);
  assert.ok(item);
  assert.equal(item!.kind, 'rent');
});

test('paid/approved rent excluded from Rent due queue', () => {
  const row = rentAdminRow({
    id: 'rent-paid',
    outstandingPaise: 0,
    effectiveStatus: 'paid',
    status: 'paid',
  });
  assert.equal(rentRowToQueueItem(row, TODAY), null);
});

test('payment submitted awaiting review excluded from Rent due (payment_in_progress)', () => {
  const row = rentAdminRow({
    id: 'rent-review',
    outstandingPaise: 2_000_00,
    effectiveStatus: 'payment_in_progress',
    paymentProofUrl: 'https://proof',
    proofSubmittedAt: new Date('2026-09-12'),
    proofSnapshotOutstandingPaise: 2_000_00,
  });
  assert.equal(rentRowToQueueItem(row, TODAY), null);
});

test('economically settled partial rent excluded after payment freeze (phantom drift guard)', () => {
  const inv = {
    id: 'rent-settled',
    invoiceNumber: 'RNT-2026-09-0011',
    bookingId: 'bk-v',
    customerId: 'c-v',
    bedId: 'bed-v',
    pgId: 'pg-1',
    billingMonth: '2026-09-01',
    dueDate: '2026-09-05',
    rentPaise: 412_080,
    lateFeeBasePaise: 212_686,
    discountPaise: 0,
    paidPrincipalPaise: 402_110,
    paidLateFeePaise: 24_858,
    lateFeeLockedPaise: null,
    paymentProofUrl: null,
    paymentProofTransactionRef: null,
    proofSubmittedAt: null,
    proofSnapshotOutstandingPaise: null,
    proofSnapshotLateFeePaise: null,
    proofSnapshotPrincipalDuePaise: null,
    status: 'overdue' as const,
    paidAt: null,
    paymentId: null,
    notes: null,
    cancelledAt: null,
    cancellationReason: null,
    isAdhoc: false,
    invoiceSubtype: 'standard' as const,
    possibleDuplicate: false,
    duplicateOfIds: [] as string[],
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-10T12:00:00.000Z'),
  };
  const projected = projectAdminRentInvoiceRow(
    rentAdminRow({
      id: inv.id,
      outstandingPaise: 0,
      effectiveStatus: 'overdue',
      rentPaise: inv.rentPaise,
      lateFeeBasePaise: inv.lateFeeBasePaise,
      paidPrincipalPaise: inv.paidPrincipalPaise,
      paidLateFeePaise: inv.paidLateFeePaise,
      updatedAt: inv.updatedAt,
    }),
  );
  assert.equal(projected.outstandingPaise, 0);
  const queueItem = rentRowToQueueItem(
    {
      ...rentAdminRow({
        id: inv.id,
        outstandingPaise: projected.outstandingPaise,
        effectiveStatus: projected.effectiveStatus,
        rentPaise: inv.rentPaise,
        lateFeeBasePaise: inv.lateFeeBasePaise,
        paidPrincipalPaise: inv.paidPrincipalPaise,
        paidLateFeePaise: inv.paidLateFeePaise,
        updatedAt: inv.updatedAt,
      }),
    },
    TODAY,
  );
  assert.equal(queueItem, null);
});

test('genuinely unpaid electricity in Electricity due queue', () => {
  const row = elecRow({ id: 'elec-1', outstandingPaise: 4_500 });
  assert.ok(electricityRowToQueueItem(row, TODAY));
});

test('paid electricity excluded from Electricity due queue', () => {
  const row = elecRow({
    id: 'elec-paid',
    outstandingPaise: 0,
    effectiveStatus: 'paid',
  });
  assert.equal(electricityRowToQueueItem(row, TODAY), null);
});

test('cancelled rent excluded from Due queue', () => {
  const row = rentAdminRow({
    id: 'rent-cancel',
    outstandingPaise: 0,
    effectiveStatus: 'cancelled',
    status: 'cancelled',
  });
  assert.equal(rentRowToQueueItem(row, TODAY), null);
});

test('Operations badge equals sum of canonical actionable queue items', () => {
  const rentUnpaid = rentAdminRow({
    id: 'r1',
    outstandingPaise: 100,
    effectiveStatus: 'overdue',
  });
  const rentPaid = rentAdminRow({
    id: 'r2',
    outstandingPaise: 0,
    effectiveStatus: 'paid',
    status: 'paid',
  });
  const elecUnpaid = elecRow({ id: 'e1', outstandingPaise: 200 });
  const queue = buildCollectionsQueue({
    rentRows: [rentUnpaid, rentPaid],
    electricityRows: [elecUnpaid],
  });
  assert.equal(queue.length, 2);

  const filterCounts = [
    { id: 'rent_due' as const, label: 'Rent due', count: queue.filter((q) => q.kind === 'rent').length },
    {
      id: 'electricity_due' as const,
      label: 'Electricity due',
      count: queue.filter((q) => q.kind === 'electricity').length,
    },
  ];
  const totalCount = filterCounts.reduce((s, c) => s + c.count, 0);
  const unified = {
    items: [],
    filter: 'rent_due' as const,
    filterCounts,
    paymentReviews: [],
    focusReviewKey: null,
    totalCount,
  };
  assert.equal(operationsTotalPendingCount(unified), 2);
  assert.equal(deriveAdminNavBadgesFromOperationsQueue(unified).operations, 2);
});

test('projection change to zero outstanding removes rent from collections composer', () => {
  const before = projectInvoice(
    buildRentInvoiceProjectInput({
      id: 'x',
      invoiceNumber: 'RNT-X',
      bookingId: 'b',
      customerId: 'c',
      bedId: 'bed',
      pgId: 'pg',
      billingMonth: '2026-09-01',
      dueDate: '2026-09-05',
      rentPaise: 412_080,
      lateFeeBasePaise: 212_686,
      discountPaise: 0,
      paidPrincipalPaise: 402_110,
      paidLateFeePaise: 24_858,
      lateFeeLockedPaise: null,
      paymentProofUrl: null,
      paymentProofTransactionRef: null,
      proofSubmittedAt: null,
      proofSnapshotOutstandingPaise: null,
      proofSnapshotLateFeePaise: null,
      proofSnapshotPrincipalDuePaise: null,
      status: 'overdue',
      paidAt: null,
      paymentId: null,
      notes: null,
      cancelledAt: null,
      cancellationReason: null,
      isAdhoc: false,
      invoiceSubtype: 'standard',
      possibleDuplicate: false,
      duplicateOfIds: [],
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date('2026-09-10'),
    }),
    new Date('2026-12-31'),
  );
  assert.equal(before.outstandingPaise, 0);
  const row = rentAdminRow({
    id: 'x',
    outstandingPaise: before.outstandingPaise,
    effectiveStatus: before.effectiveStatus,
    rentPaise: 412_080,
    lateFeeBasePaise: 212_686,
    paidPrincipalPaise: 402_110,
    paidLateFeePaise: 24_858,
    updatedAt: new Date('2026-09-10'),
  });
  assert.equal(rentRowToQueueItem(row, TODAY), null);
});
