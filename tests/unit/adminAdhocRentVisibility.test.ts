/**
 * Admin visibility for pending adhoc rent — must not change billing amounts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminRentCollectionLabels,
  pendingRentInvoiceIdsFromPaymentReviews,
} from '@/src/lib/billing/adminRentCollectionPresentation';
import { diffInclusiveDays } from '@/src/lib/billing/adhocRentInvoiceNotes';
import { rentRowToQueueItem, buildCollectionsQueue } from '@/src/lib/billing/collectionsQueue';
import { buildResidentOperationsDashboard } from '@/src/lib/residents/residentOperationsDashboard';
import { filterRentAwaitingResidentPayment } from '@/src/services/financialSummaryService';
import { buildResidentBillRowsFromDetail } from '@/src/lib/residents/residentPortalBillRows';
import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

const SYED_NOTES =
  'Daily rent — ₹220/day × 10 days (2026-08-31 → 2026-09-09). Billing period: 31 Aug 2026 → 9 Sep 2026';

function adhocRow(
  over: Partial<AdminRentInvoiceRow> = {},
): AdminRentInvoiceRow {
  return {
    id: 'adhoc-19',
    invoiceNumber: 'RNT-2026-09-0019',
    bookingId: 'bk-syed',
    bookingCode: 'APG-SYED',
    customerId: 'cust-syed',
    customerFullName: 'Syed Ahmed',
    customerPhone: '9000000001',
    pgId: 'pg-1',
    pgName: 'Shantinagar',
    bedId: 'bed-1',
    bedCode: 'B4',
    roomNumber: '203',
    billingMonth: '2026-09-01',
    dueDate: '2026-09-05',
    rentPaise: 220_000,
    lateFeeBasePaise: 220_000,
    discountPaise: 0,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: null,
    status: 'pending',
    paidAt: null,
    paymentId: null,
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    notes: SYED_NOTES,
    paymentProvider: null,
    paymentRawPayload: null,
    paymentProofUrl: null,
    proofSubmittedAt: null,
    proofSnapshotOutstandingPaise: null,
    proofSnapshotLateFeePaise: null,
    proofSnapshotPrincipalDuePaise: null,
    cancelledAt: null,
    cancellationReason: null,
    isAdhoc: true,
    invoiceSubtype: 'standard',
    outstandingPaise: 220_000,
    effectiveStatus: 'pending',
    ...over,
  };
}

test('9 — 31 Aug through 9 Sep inclusive is 10 days and ₹2,200 at ₹220/day', () => {
  assert.equal(diffInclusiveDays('2026-08-31', '2026-09-09'), 10);
  assert.equal(220_00 * 10, 220_000);
});

test('1 — pending adhoc rent appears in Operations Rent due collections queue', () => {
  const row = adhocRow();
  assert.ok(rentRowToQueueItem(row, '2026-09-14'));
  const queue = buildCollectionsQueue({ rentRows: [row], electricityRows: [] });
  assert.equal(queue.length, 1);
  assert.equal(queue[0]!.kind, 'rent');
});

test('4 — pending adhoc appears in resident billing due rows', () => {
  const row = adhocRow();
  const { dueBillRows } = buildResidentBillRowsFromDetail([
    {
      bookingId: row.bookingId,
      rent: {
        ok: true,
        data: [
          {
            id: row.id,
            invoiceNumber: row.invoiceNumber,
            billingMonth: row.billingMonth,
            dueDate: row.dueDate!,
            rentPaise: row.rentPaise,
            lateFeeBasePaise: row.lateFeeBasePaise,
            discountPaise: 0,
            paidPrincipalPaise: 0,
            paidLateFeePaise: 0,
            lateFeeLockedPaise: null,
            status: 'pending',
            paidAt: null,
            paymentId: null,
            notes: row.notes,
            isAdhoc: true,
            invoiceSubtype: 'standard',
            paymentProofUrl: null,
            paymentProofTransactionRef: null,
            proofSubmittedAt: null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          },
        ],
      },
      electricity: { ok: true, data: [] },
    },
  ]);
  assert.equal(dueBillRows.length, 1);
  assert.ok(dueBillRows[0]!.amountPaise >= 220_000);
  assert.match(dueBillRows[0]!.label, /Adhoc rent/);
});

test('2 — pending adhoc included in admin open-rent awaiting filter', () => {
  const waiting = filterRentAwaitingResidentPayment([adhocRow()]);
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0]!.id, 'adhoc-19');
});

test('5 — same adhoc counted once in collections queue', () => {
  const queue = buildCollectionsQueue({ rentRows: [adhocRow()], electricityRows: [] });
  assert.equal(queue.length, 1);
  assert.equal(queue[0]!.amountPaise, 220_000);
});

test('6 — cancelled superseded monthly is not actionable rent due', () => {
  const cancelled = adhocRow({
    id: 'monthly-13',
    invoiceNumber: 'RNT-2026-09-0013',
    isAdhoc: false,
    outstandingPaise: 0,
    effectiveStatus: 'cancelled',
    status: 'cancelled',
    notes: 'Billing period: 1 Sept 2026 → 30 Sept 2026',
  });
  assert.equal(rentRowToQueueItem(cancelled, '2026-09-14'), null);
});

test('7 — paid adhoc leaves Rent due queue', () => {
  assert.equal(
    rentRowToQueueItem(
      adhocRow({ outstandingPaise: 0, effectiveStatus: 'paid', status: 'paid' }),
      '2026-09-14',
    ),
    null,
  );
});

test('8 — payment-review adhoc excluded from Rent due but other rent stays visible', () => {
  const adhocInReview = adhocRow({
    effectiveStatus: 'payment_in_progress',
    paymentProofUrl: 'https://proof',
    proofSubmittedAt: new Date(),
  });
  assert.equal(rentRowToQueueItem(adhocInReview, '2026-09-14'), null);

  const julyDue = adhocRow({
    id: 'jul-rent',
    invoiceNumber: 'RNT-JUL',
    isAdhoc: false,
    notes: 'Billing period: 1 Jul 2026 → 31 Jul 2026',
    billingMonth: '2026-07-01',
    outstandingPaise: 50_000,
    effectiveStatus: 'overdue',
    status: 'overdue',
  });

  const proofs = [
    { kind: 'rent', entityId: 'adhoc-19', customerId: 'cust-syed' },
  ] as unknown as PendingPaymentReviewItem[];

  const collections = buildCollectionsQueue({ rentRows: [julyDue], electricityRows: [] });
  const dashboard = buildResidentOperationsDashboard({
    unpaidBilling: collections,
    paymentProofs: proofs,
    kycPending: [],
    unassignedResidents: [],
    vacatingRows: [],
    checkoutRefunds: [],
    depositRefunds: [],
    residentRequests: [],
    moveInsToday: [],
    moveOutsToday: [],
    rentsDueToday: [],
    moveOutOpsCount: 0,
  });
  const rentDue = dashboard.queue.filter((q) => q.category === 'rent_due' || q.category === 'rent_overdue');
  assert.equal(rentDue.length, 1);
  assert.match(rentDue[0]!.issue, /2026-07/);
});

test('10 — non-overlapping monthly stays in queue alongside adhoc', () => {
  const july = adhocRow({
    id: 'jul',
    isAdhoc: false,
    billingMonth: '2026-07-01',
    notes: 'Billing period: 1 Jul 2026 → 31 Jul 2026',
    outstandingPaise: 100_000,
    effectiveStatus: 'overdue',
  });
  const queue = buildCollectionsQueue({ rentRows: [adhocRow(), july], electricityRows: [] });
  assert.equal(queue.length, 2);
});

test('label — adhoc uses canonical type fields not description parsing alone', () => {
  const labels = adminRentCollectionLabels({
    billingMonth: '2026-09-01',
    notes: SYED_NOTES,
    isAdhoc: true,
    invoiceSubtype: 'standard',
  });
  assert.match(labels.invoiceLabel, /^Adhoc rent · /);
  assert.match(labels.periodLabel, /31 August 2026/);
  assert.match(labels.periodLabel, /9 September 2026/);
  assert.equal(labels.categoryLabel, 'Adhoc rent');
});

test('electricity payment review must not hide unrelated adhoc rent due', () => {
  const queueItem = buildCollectionsQueue({ rentRows: [adhocRow()], electricityRows: [] })[0]!;
  const dashboard = buildResidentOperationsDashboard({
    unpaidBilling: [queueItem],
    paymentProofs: [
      {
        kind: 'electricity',
        entityId: 'elec-1',
        customerId: 'cust-syed',
      } as PendingPaymentReviewItem,
    ],
    kycPending: [],
    unassignedResidents: [],
    vacatingRows: [],
    checkoutRefunds: [],
    depositRefunds: [],
    residentRequests: [],
    moveInsToday: [],
    moveOutsToday: [],
    rentsDueToday: [],
    moveOutOpsCount: 0,
  });
  assert.ok(
    dashboard.queue.some((q) => q.category === 'rent_due' || q.category === 'rent_overdue'),
  );
});
