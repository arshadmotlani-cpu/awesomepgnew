import assert from 'node:assert/strict';
import test from 'node:test';
import { projectInvoice } from '../../src/services/rentInvoices';
import { rejectionReasonLabel } from '../../src/lib/approvals/paymentProofRejectionReasons';
import type { PaymentProofRejection } from '../../src/db/schema/paymentProofRejections';

function rejectionFor(
  rejections: Map<string, PaymentProofRejection>,
  entityType: string,
  entityId: string,
): PaymentProofRejection | undefined {
  return rejections.get(`${entityType}:${entityId}`);
}

function rentRowStatus(input: {
  paymentProofUrl: string | null;
  status: 'pending' | 'overdue' | 'payment_in_progress';
  billingMonth?: string;
  dueDate?: string;
  rejection?: PaymentProofRejection;
}): 'Rejected' | 'Waiting for admin approval' | 'Due' | 'Overdue' {
  const projected = projectInvoice({
    id: 'inv-1',
    bookingId: 'b-1',
    billingMonth: input.billingMonth ?? '2026-07-01',
    dueDate: input.dueDate ?? '2026-07-05',
    rentPaise: 500_000,
    discountPaise: 0,
    promoCode: null,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: null,
    status: input.status,
    paidAt: null,
    cancelledAt: null,
    cancellationReason: null,
    customerId: 'c-1',
    bedId: 'bed-1',
    pgId: 'pg-1',
    paymentId: null,
    paymentProofUrl: input.paymentProofUrl,
    isAdhoc: false,
    invoiceNumber: 'R-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (input.rejection && !input.paymentProofUrl) {
    return 'Rejected';
  }
  if (projected.effectiveStatus === 'payment_in_progress') {
    return 'Waiting for admin approval';
  }
  return projected.effectiveStatus === 'overdue' ? 'Overdue' : 'Due';
}

test('active rejection without proof shows Rejected status', () => {
  const rejection: PaymentProofRejection = {
    id: 'rej-1',
    reviewKey: 'rent:inv-1',
    entityType: 'rent_invoice',
    entityId: 'inv-1',
    customerId: 'c-1',
    pgId: 'pg-1',
    bookingId: 'b-1',
    reasonCode: 'not_clear',
    reasonLabel: rejectionReasonLabel('not_clear'),
    reasonDetail: null,
    adminNote: null,
    residentMessage: 'Please upload a clearer screenshot.',
    rejectedByAdminId: 'admin-1',
    rejectedAt: new Date(),
    whatsappSent: true,
    whatsappMessagePreview: 'Please upload',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const map = new Map([['rent_invoice:inv-1', rejection]]);
  const found = rejectionFor(map, 'rent_invoice', 'inv-1');
  assert.ok(found);

  assert.equal(
    rentRowStatus({
      paymentProofUrl: null,
      status: 'pending',
      rejection: found,
    }),
    'Rejected',
  );
});

test('proof awaiting approval takes precedence over stale rejection map entry', () => {
  assert.equal(
    rentRowStatus({
      paymentProofUrl: 'https://example.com/proof.png',
      status: 'payment_in_progress',
    }),
    'Waiting for admin approval',
  );
});

test('no rejection and no proof shows Due or Overdue', () => {
  assert.equal(
    rentRowStatus({
      paymentProofUrl: null,
      status: 'pending',
      billingMonth: '2099-01-01',
      dueDate: '2099-01-05',
    }),
    'Due',
  );
  assert.equal(
    rentRowStatus({
      paymentProofUrl: null,
      status: 'overdue',
      billingMonth: '2020-01-01',
      dueDate: '2020-01-05',
    }),
    'Overdue',
  );
});
