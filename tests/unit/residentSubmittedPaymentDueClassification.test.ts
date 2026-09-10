/**
 * Resident portal Due/Payable classification — submitted payments must not appear as actionable due.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { computeResidentTotalDuePaise } from '@/src/lib/residents/residentPortalDisplay';
import { buildResidentBillRowsFromDetail } from '@/src/lib/residents/residentPortalBillRows';
import {
  buildResidentPayableNowRows,
  computeResidentPayableNowTotalPaise,
} from '@/src/lib/residents/residentPayableNowProjection';
import { isPortalPayableInvoiceStatus, sumPortalPayableOutstandingPaise } from '@/src/lib/billing/expectedRentInvoiceAmount';
import { projectInvoice } from '@/src/services/rentInvoices';

const TRANSITION_RENT = 288_456;
const PRIOR_PRINCIPAL = 271_973;
const REMAINING = TRANSITION_RENT - PRIOR_PRINCIPAL;

const baseTransitionInvoice = {
  id: 'inv-transition',
  invoiceNumber: 'RNT-2026-08-0022',
  bookingId: 'booking-1',
  bookingCode: 'APG-2026-0094',
  billingMonth: '2026-09-01',
  dueDate: null,
  rentPaise: TRANSITION_RENT,
  discountPaise: 0,
  promoCode: null,
  paidPrincipalPaise: 0,
  paidLateFeePaise: 0,
  lateFeeLockedPaise: null,
  status: 'pending' as const,
  paidAt: null,
  invoiceSubtype: 'billing_cycle_transition' as const,
  notes:
    'Billing cycle transition rent — Prorated bridge rent for 21/30 days (2026-09-10 → 2026-09-30)',
  paymentProofUrl: null,
  paymentProofTransactionRef: null,
  proofSubmittedAt: null,
  proofSnapshotOutstandingPaise: null,
  proofSnapshotLateFeePaise: null,
  proofSnapshotPrincipalDuePaise: null,
  paymentId: null,
  isAdhoc: true,
  createdAt: new Date('2026-09-09T07:00:00Z'),
  updatedAt: new Date('2026-09-09T07:00:00Z'),
};

function buildRows(invoice: typeof baseTransitionInvoice) {
  return buildResidentBillRowsFromDetail([
    {
      bookingId: 'booking-1',
      rent: { ok: true, data: [invoice] },
      electricity: { ok: true, data: [] },
    },
  ]);
}

test('unpaid billing transition invoice appears in Due with pay link', () => {
  const { dueBillRows, pendingApprovalRows } = buildRows(baseTransitionInvoice);
  assert.equal(dueBillRows.length, 1);
  assert.equal(pendingApprovalRows.length, 0);
  assert.equal(dueBillRows[0]?.amountPaise, TRANSITION_RENT);
  assert.ok(dueBillRows[0]?.href);
  assert.equal(computeResidentTotalDuePaise(dueBillRows), TRANSITION_RENT);
});

test('partial transition with submitted proof is not actionable Due (payment verification pending)', () => {
  const submitted = {
    ...baseTransitionInvoice,
    paidPrincipalPaise: PRIOR_PRINCIPAL,
    status: 'pending' as const,
    paymentProofTransactionRef: 'UPI123456789',
    proofSubmittedAt: new Date('2026-09-09T10:30:00Z'),
    proofSnapshotOutstandingPaise: REMAINING,
    proofSnapshotLateFeePaise: 0,
    proofSnapshotPrincipalDuePaise: REMAINING,
  };
  const projected = projectInvoice(submitted);
  assert.equal(projected.effectiveStatus, 'payment_in_progress');
  assert.equal(projected.outstandingPaise, REMAINING);

  const { dueBillRows, pendingApprovalRows } = buildRows(submitted);
  assert.equal(dueBillRows.length, 0);
  assert.equal(pendingApprovalRows.length, 1);
  assert.equal(pendingApprovalRows[0]?.amountPaise, REMAINING);
  assert.equal(pendingApprovalRows[0]?.href, null);
  assert.equal(pendingApprovalRows[0]?.status, 'Payment verification pending');
  assert.equal(computeResidentTotalDuePaise(dueBillRows), 0);

  const payables = buildResidentPayableNowRows({
    dueRows: dueBillRows,
    bookingId: 'booking-1',
  });
  assert.equal(computeResidentPayableNowTotalPaise(payables), 0);
});

test('payment_in_progress transition excludes from portal payable SSOT', () => {
  const projected = projectInvoice({
    ...baseTransitionInvoice,
    paidPrincipalPaise: PRIOR_PRINCIPAL,
    status: 'payment_in_progress',
    paymentProofTransactionRef: 'UPI123456789',
    proofSubmittedAt: new Date('2026-09-09T10:30:00Z'),
    proofSnapshotOutstandingPaise: REMAINING,
    proofSnapshotLateFeePaise: 0,
    proofSnapshotPrincipalDuePaise: REMAINING,
  });
  assert.equal(isPortalPayableInvoiceStatus(projected.effectiveStatus), false);
  assert.equal(
    sumPortalPayableOutstandingPaise([
      { outstandingPaise: projected.outstandingPaise, effectiveStatus: projected.effectiveStatus },
    ]),
    0,
  );
});

test('approved paid transition is not in Due', () => {
  const paid = {
    ...baseTransitionInvoice,
    paidPrincipalPaise: TRANSITION_RENT,
    status: 'paid' as const,
    paidAt: new Date('2026-09-09T12:00:00Z'),
    paymentId: 'pay-1',
  };
  const { dueBillRows, pendingApprovalRows, paidBillRows } = buildRows(paid);
  assert.equal(dueBillRows.length, 0);
  assert.equal(pendingApprovalRows.length, 0);
  assert.equal(paidBillRows.length, 1);
});

test('duplicate proof submission remains idempotent at projection layer', () => {
  const submitted = {
    ...baseTransitionInvoice,
    paidPrincipalPaise: PRIOR_PRINCIPAL,
    status: 'payment_in_progress' as const,
    paymentProofTransactionRef: 'UPI123456789',
    proofSubmittedAt: new Date('2026-09-09T10:30:00Z'),
    proofSnapshotOutstandingPaise: REMAINING,
    proofSnapshotLateFeePaise: 0,
    proofSnapshotPrincipalDuePaise: REMAINING,
  };
  const first = buildRows(submitted);
  const second = buildRows(submitted);
  assert.deepEqual(
    first.pendingApprovalRows.map((r) => r.key),
    second.pendingApprovalRows.map((r) => r.key),
  );
  assert.equal(first.dueBillRows.length, 0);
  assert.equal(second.dueBillRows.length, 0);
});
