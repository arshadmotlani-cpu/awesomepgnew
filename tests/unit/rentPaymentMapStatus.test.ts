import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateRentPaymentMapSummary,
  classifyRentPaymentMapBed,
  rentPaymentMapBedHref,
} from '@/src/lib/billing/rentPaymentMapStatus';

test('classifyRentPaymentMapBed — available when not occupied in month', () => {
  assert.equal(
    classifyRentPaymentMapBed({ isOccupiedInMonth: false }),
    'available',
  );
});

test('classifyRentPaymentMapBed — paid when projected paid', () => {
  assert.equal(
    classifyRentPaymentMapBed({
      isOccupiedInMonth: true,
      projected: { effectiveStatus: 'paid', outstandingPaise: 0 },
    }),
    'paid',
  );
});

test('classifyRentPaymentMapBed — paid when outstanding is zero', () => {
  assert.equal(
    classifyRentPaymentMapBed({
      isOccupiedInMonth: true,
      projected: { effectiveStatus: 'pending', outstandingPaise: 0 },
    }),
    'paid',
  );
});

test('classifyRentPaymentMapBed — payment submitted when proof in progress', () => {
  assert.equal(
    classifyRentPaymentMapBed({
      isOccupiedInMonth: true,
      projected: { effectiveStatus: 'payment_in_progress', outstandingPaise: 500000 },
    }),
    'payment_submitted',
  );
});

test('classifyRentPaymentMapBed — not paid when pending with outstanding', () => {
  assert.equal(
    classifyRentPaymentMapBed({
      isOccupiedInMonth: true,
      projected: { effectiveStatus: 'pending', outstandingPaise: 1200000 },
    }),
    'not_paid',
  );
});

test('classifyRentPaymentMapBed — not paid when overdue', () => {
  assert.equal(
    classifyRentPaymentMapBed({
      isOccupiedInMonth: true,
      projected: { effectiveStatus: 'overdue', outstandingPaise: 1200000 },
    }),
    'not_paid',
  );
});

test('classifyRentPaymentMapBed — rejected proof without URL is not paid', () => {
  assert.equal(
    classifyRentPaymentMapBed({
      isOccupiedInMonth: true,
      projected: { effectiveStatus: 'pending', outstandingPaise: 1200000 },
      hasActiveRejectionWithoutProof: true,
      paymentProofUrl: null,
    }),
    'not_paid',
  );
});

test('classifyRentPaymentMapBed — occupied without invoice is not paid', () => {
  assert.equal(
    classifyRentPaymentMapBed({
      isOccupiedInMonth: true,
      projected: null,
    }),
    'not_paid',
  );
});

test('rentPaymentMapBedHref — paid opens canonical invoice', () => {
  const href = rentPaymentMapBedHref({
    status: 'paid',
    pgId: 'pg-1',
    bedId: 'bed-1',
    invoiceId: 'inv-1',
    customerId: 'cust-1',
  });
  assert.match(href, /\/admin\/invoices\/inv-1/);
  assert.match(href, /customerId=cust-1/);
});

test('rentPaymentMapBedHref — submitted opens payment review', () => {
  const href = rentPaymentMapBedHref({
    status: 'payment_submitted',
    pgId: 'pg-1',
    bedId: 'bed-1',
    invoiceId: 'inv-2',
    customerId: 'cust-1',
  });
  assert.equal(href, '/admin/payment-review/rent-inv-2');
});

test('rentPaymentMapBedHref — not paid opens resident open bills', () => {
  const href = rentPaymentMapBedHref({
    status: 'not_paid',
    pgId: 'pg-1',
    bedId: 'bed-1',
    customerId: 'cust-3',
  });
  assert.equal(href, '/admin/residents/cust-3#open-bills');
});

test('rentPaymentMapBedHref — available opens bed command center', () => {
  const href = rentPaymentMapBedHref({
    status: 'available',
    pgId: 'pg-1',
    bedId: 'bed-9',
  });
  assert.equal(href, '/admin/beds?pgId=pg-1&bedId=bed-9');
});

test('aggregateRentPaymentMapSummary matches displayed beds', () => {
  const summary = aggregateRentPaymentMapSummary([
    { status: 'paid' },
    { status: 'paid' },
    { status: 'payment_submitted' },
    { status: 'not_paid' },
    { status: 'available' },
    { status: 'available' },
  ]);
  assert.deepEqual(summary, {
    totalOccupied: 4,
    paid: 2,
    paymentSubmitted: 1,
    notPaid: 1,
    availableBeds: 2,
  });
});
