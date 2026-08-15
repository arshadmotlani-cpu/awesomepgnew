import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { rentStatusToUnifiedStatus } from '@/src/lib/billing/invoiceStateMachine';
import { projectInvoice } from '@/src/services/rentInvoices';

describe('billing cycle transition invoice projection', () => {
  test('transition subtype has zero late fee and stays pending', () => {
    const view = projectInvoice({
      id: 'inv-1',
      invoiceNumber: 'R-TEST',
      bookingId: 'bk-1',
      customerId: 'c-1',
      bedId: 'bed-1',
      pgId: 'pg-1',
      billingMonth: '2026-08-01',
      dueDate: null,
      rentPaise: 50_000,
      paidPrincipalPaise: 0,
      paidLateFeePaise: 0,
      lateFeeLockedPaise: null,
      status: 'pending',
      paymentProofUrl: null,
      paymentId: null,
      paidAt: null,
      cancelledAt: null,
      cancellationReason: null,
      notes: 'Billing cycle transition rent — test',
      isAdhoc: true,
      invoiceSubtype: 'billing_cycle_transition',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      updatedAt: new Date('2026-08-01T00:00:00Z'),
    });

    assert.equal(view.accruedLateFeePaise, 0);
    assert.equal(view.effectiveStatus, 'pending');
    assert.equal(view.outstandingPaise, 50_000);
  });

  test('null due date maps to sent not overdue in unified status', () => {
    assert.equal(rentStatusToUnifiedStatus('pending', null), 'sent');
  });
});
