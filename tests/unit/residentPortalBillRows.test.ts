import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLateFeeCountdown } from '@/src/lib/billing/lateFeeCountdown';
import { buildResidentBillRowsFromDetail } from '@/src/lib/residents/residentPortalBillRows';

const baseRentInvoice = {
  id: 'inv-1',
  invoiceNumber: 'RNT-2026-09-0001',
  bookingId: 'booking-1',
  bookingCode: 'APG-2026-0001',
  billingMonth: '2026-09-01',
  dueDate: '2026-09-07',
  rentPaise: 5_000_00,
  discountPaise: 0,
  promoCode: null,
  paidPrincipalPaise: 0,
  paidLateFeePaise: 0,
  lateFeeLockedPaise: null,
  status: 'pending' as const,
  paidAt: null,
  invoiceSubtype: 'standard' as const,
  notes: null,
  paymentProofUrl: null,
  proofSubmittedAt: null,
  proofSnapshotOutstandingPaise: null,
  proofSnapshotLateFeePaise: null,
  proofSnapshotPrincipalDuePaise: null,
  paymentId: null,
  isAdhoc: false,
  createdAt: new Date('2026-08-31T00:00:00.000Z'),
  updatedAt: new Date('2026-08-31T00:00:00.000Z'),
};

test('pending rent due rows expose ISO rentIssueDate for LateFeeCountdown', () => {
  const { dueBillRows } = buildResidentBillRowsFromDetail([
    {
      bookingId: 'booking-1',
      rent: { ok: true, data: [baseRentInvoice] },
      electricity: { ok: true, data: [] },
    },
  ]);

  assert.equal(dueBillRows.length, 1);
  const issueDate = dueBillRows[0]?.rentIssueDate;
  assert.equal(issueDate, '2026-08-31');
  assert.doesNotThrow(() => buildLateFeeCountdown(issueDate!, '2026-09-01'));
});

test('payment_in_progress rent rows skip rentIssueDate (no countdown on approval queue)', () => {
  const { pendingApprovalRows, dueBillRows } = buildResidentBillRowsFromDetail([
    {
      bookingId: 'booking-1',
      rent: {
        ok: true,
        data: [{ ...baseRentInvoice, id: 'inv-2', status: 'payment_in_progress' }],
      },
      electricity: { ok: true, data: [] },
    },
  ]);

  assert.equal(dueBillRows.length, 0);
  assert.equal(pendingApprovalRows.length, 1);
  assert.equal(pendingApprovalRows[0]?.rentIssueDate, undefined);
});
