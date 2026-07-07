import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildRentProofFinancialSnapshot,
  projectInvoice,
  rentProofApprovalAmountPaise,
} from '@/src/services/rentInvoices';

const baseInvoice = {
  id: 'inv-1',
  bookingId: 'bk-1',
  customerId: 'cust-1',
  pgId: 'pg-1',
  bedId: 'bed-1',
  invoiceNumber: 'RNT-2026-07-0001',
  billingMonth: '2026-07-01',
  dueDate: '2026-07-05',
  rentPaise: 463_600,
  discountPaise: 0,
  promoCode: null,
  paidPrincipalPaise: 0,
  paidLateFeePaise: 0,
  lateFeeLockedPaise: null,
  paymentId: null,
  paidAt: null,
  paymentProofUrl: null,
  notes: null,
  cancelledAt: null,
  cancellationReason: null,
  isAdhoc: false,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  proofSubmittedAt: null,
  proofSnapshotOutstandingPaise: null,
  proofSnapshotLateFeePaise: null,
  proofSnapshotPrincipalDuePaise: null,
} as const;

describe('rent proof financial snapshot', () => {
  test('live accrual grows after grace; snapshot freezes at submit time', () => {
    const beforeProof = projectInvoice(
      { ...baseInvoice, status: 'pending' },
      '2026-07-05',
    );
    assert.equal(beforeProof.accruedLateFeePaise, 0);
    assert.equal(beforeProof.outstandingPaise, 463_600);

    const atSubmit = projectInvoice(
      { ...baseInvoice, status: 'pending' },
      '2026-07-07',
    );
    assert.equal(atSubmit.accruedLateFeePaise, 9_272);
    assert.equal(atSubmit.outstandingPaise, 472_872);

    const snapshot = buildRentProofFinancialSnapshot(
      { ...baseInvoice, status: 'pending' },
      new Date('2026-07-07T10:00:00.000Z'),
    );
    assert.equal(snapshot.proofSnapshotOutstandingPaise, 472_872);
    assert.equal(snapshot.proofSnapshotLateFeePaise, 9_272);
    assert.equal(snapshot.proofSnapshotPrincipalDuePaise, 463_600);

    const frozenDuringReview = projectInvoice({
      ...baseInvoice,
      status: 'payment_in_progress',
      paymentProofUrl: 'proofs/rent.jpg',
      proofSubmittedAt: snapshot.proofSubmittedAt,
      proofSnapshotOutstandingPaise: snapshot.proofSnapshotOutstandingPaise,
      proofSnapshotLateFeePaise: snapshot.proofSnapshotLateFeePaise,
      proofSnapshotPrincipalDuePaise: snapshot.proofSnapshotPrincipalDuePaise,
    }, '2026-07-15');

    assert.equal(frozenDuringReview.outstandingPaise, 472_872);
    assert.equal(frozenDuringReview.accruedLateFeePaise, 9_272);
    assert.equal(frozenDuringReview.effectiveStatus, 'payment_in_progress');

    const liveWouldHaveGrown = projectInvoice(
      {
        ...baseInvoice,
        status: 'payment_in_progress',
        paymentProofUrl: 'proofs/rent.jpg',
      },
      '2026-07-15',
      { bypassProofSnapshot: true },
    );
    assert.ok(liveWouldHaveGrown.outstandingPaise > frozenDuringReview.outstandingPaise);
  });

  test('approval amount uses frozen snapshot not later accrual', () => {
    const invoice = {
      ...baseInvoice,
      status: 'payment_in_progress' as const,
      paymentProofUrl: 'proofs/rent.jpg',
      proofSubmittedAt: new Date('2026-07-07'),
      proofSnapshotOutstandingPaise: 472_872,
      proofSnapshotLateFeePaise: 9_272,
      proofSnapshotPrincipalDuePaise: 463_600,
    };
    assert.equal(rentProofApprovalAmountPaise(invoice), 472_872);
  });

  test('pre-proof invoices still accrue live', () => {
    const live = projectInvoice({ ...baseInvoice, status: 'overdue' }, '2026-07-10');
    assert.equal(live.accruedLateFeePaise, 23_180);
    assert.equal(live.outstandingPaise, 486_780);
  });
});
