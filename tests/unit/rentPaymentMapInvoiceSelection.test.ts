import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRentInvoiceProjectInput } from '@/src/lib/billing/rentInvoiceProjectInput';
import {
  pickRentInvoiceForPaymentMap,
  RENT_PAYMENT_MAP_RENT_INVOICE_DB_STATUSES,
} from '@/src/lib/billing/rentPaymentMapInvoiceSelection';
import {
  classifyRentPaymentMapBed,
  aggregateRentPaymentMapSummary,
} from '@/src/lib/billing/rentPaymentMapStatus';
import { projectInvoice } from '@/src/services/rentInvoices';
import type { RentInvoice } from '@/src/db/schema';

const OCT = '2026-10-01';
const SEP = '2026-09-01';

function octInvoice(over: Partial<RentInvoice> = {}): ReturnType<typeof buildRentInvoiceProjectInput> {
  return buildRentInvoiceProjectInput({
    id: over.id ?? 'inv-oct',
    invoiceNumber: over.invoiceNumber ?? 'RNT-OCT-1',
    bookingId: 'bk-1',
    customerId: 'c-1',
    bedId: 'bed-1',
    pgId: 'pg-1',
    billingMonth: OCT,
    dueDate: '2026-10-05',
    rentPaise: 5_000_00,
    lateFeeBasePaise: 5_000_00,
    discountPaise: 0,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: null,
    status: 'pending',
    paidAt: null,
    paymentId: null,
    paymentProofUrl: null,
    proofSubmittedAt: null,
    proofSnapshotOutstandingPaise: null,
    proofSnapshotLateFeePaise: null,
    proofSnapshotPrincipalDuePaise: null,
    notes: null,
    cancelledAt: null,
    cancellationReason: null,
    isAdhoc: false,
    invoiceSubtype: 'standard',
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    ...over,
  });
}

test('RENT_PAYMENT_MAP_RENT_INVOICE_DB_STATUSES includes paid', () => {
  assert.ok(RENT_PAYMENT_MAP_RENT_INVOICE_DB_STATUSES.includes('paid'));
});

test('October invoice fully paid → pick + classify PAID', () => {
  const paid = octInvoice({
    id: 'inv-paid',
    status: 'paid',
    paidPrincipalPaise: 5_000_00,
    paidAt: new Date('2026-10-04'),
  });
  const picked = pickRentInvoiceForPaymentMap([paid]);
  assert.equal(picked?.id, 'inv-paid');
  const projected = projectInvoice(picked!);
  assert.equal(
    classifyRentPaymentMapBed({ isOccupiedInMonth: true, projected }),
    'paid',
  );
});

test('October invoice partially paid → PARTIALLY PAID', () => {
  const partial = octInvoice({
    status: 'overdue',
    paidPrincipalPaise: 2_000_00,
  });
  const projected = projectInvoice(partial);
  assert.equal(projected.effectiveStatus, 'partial');
  assert.equal(
    classifyRentPaymentMapBed({ isOccupiedInMonth: true, projected }),
    'partially_paid',
  );
});

test('October payment in progress → PAYMENT SUBMITTED', () => {
  const inProgress = octInvoice({
    status: 'payment_in_progress',
    paymentProofUrl: 'https://proof',
    proofSubmittedAt: new Date('2026-10-03'),
    proofSnapshotOutstandingPaise: 5_000_00,
    proofSnapshotLateFeePaise: 0,
    proofSnapshotPrincipalDuePaise: 5_000_00,
  });
  const projected = projectInvoice(inProgress);
  assert.equal(
    classifyRentPaymentMapBed({ isOccupiedInMonth: true, projected }),
    'payment_submitted',
  );
});

test('October invoice with no payment → NOT PAID', () => {
  const projected = projectInvoice(octInvoice());
  assert.equal(
    classifyRentPaymentMapBed({ isOccupiedInMonth: true, projected }),
    'not_paid',
  );
});

test('Paid October invoice is picked even when outstanding filter would skip it', () => {
  const paid = octInvoice({ id: 'inv-paid', status: 'paid', paidPrincipalPaise: 5_000_00 });
  assert.equal(pickRentInvoiceForPaymentMap([paid])?.id, 'inv-paid');
});

test('Open invoice wins over paid when both exist for same month', () => {
  const paid = octInvoice({ id: 'paid', status: 'paid', paidPrincipalPaise: 5_000_00 });
  const open = octInvoice({ id: 'open', status: 'pending' });
  const picked = pickRentInvoiceForPaymentMap([paid, open]);
  assert.equal(picked?.id, 'open');
});

test('September billing month invoice does not satisfy October pick alone', () => {
  const sep = octInvoice({ id: 'sep', billingMonth: SEP, dueDate: '2026-09-05' });
  assert.equal(pickRentInvoiceForPaymentMap([sep])?.billingMonth, SEP);
});

test('Cancelled invoice is not picked', () => {
  const cancelled = octInvoice({ status: 'cancelled', cancelledAt: new Date() });
  assert.equal(pickRentInvoiceForPaymentMap([cancelled]), undefined);
});

test('Payment for another month does not change October classification when only Sep invoice given', () => {
  const sepPaid = octInvoice({
    id: 'sep-paid',
    billingMonth: SEP,
    status: 'paid',
    paidPrincipalPaise: 5_000_00,
  });
  const picked = pickRentInvoiceForPaymentMap([sepPaid]);
  assert.equal(picked?.billingMonth, SEP);
});

test('aggregate summary counts partially paid separately', () => {
  const summary = aggregateRentPaymentMapSummary([
    { status: 'paid' },
    { status: 'partially_paid' },
    { status: 'payment_submitted' },
    { status: 'not_paid' },
  ]);
  assert.deepEqual(summary, {
    totalOccupied: 4,
    paid: 1,
    paymentSubmitted: 1,
    partiallyPaid: 1,
    notPaid: 1,
    availableBeds: 0,
  });
});

test('billing month association uses invoice billingMonth not payment date', () => {
  const paidEarly = octInvoice({
    status: 'paid',
    paidPrincipalPaise: 5_000_00,
    paidAt: new Date('2026-09-30'),
  });
  const projected = projectInvoice(paidEarly);
  assert.equal(projected.effectiveStatus, 'paid');
  assert.equal(
    classifyRentPaymentMapBed({ isOccupiedInMonth: true, projected }),
    'paid',
  );
});
