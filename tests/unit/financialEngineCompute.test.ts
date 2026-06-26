import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeRentInvoiceOutstandingPaise,
  computeRentInvoiceEffectiveStatus,
} from '../../src/services/residentFinancialEngine';
import type { RentInvoice } from '../../src/db/schema/rentInvoices';

function sampleInvoice(overrides: Partial<RentInvoice> = {}): RentInvoice {
  return {
    id: 'inv-1',
    invoiceNumber: 'RNT-001',
    bookingId: 'bk-1',
    customerId: 'cust-1',
    bedId: 'bed-1',
    pgId: 'pg-1',
    billingMonth: '2026-06-01',
    dueDate: '2026-06-05',
    rentPaise: 50_000,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: null,
    status: 'pending',
    paymentId: null,
    paymentProofUrl: null,
    paidAt: null,
    isAdhoc: false,
    notes: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date('2026-06-01'),
    updatedAt: new Date('2026-06-01'),
    ...overrides,
  } as RentInvoice;
}

test('computeRentInvoiceOutstandingPaise delegates to engine projection', () => {
  const outstanding = computeRentInvoiceOutstandingPaise(sampleInvoice());
  assert.ok(outstanding >= 50_000);
  assert.equal(computeRentInvoiceEffectiveStatus(sampleInvoice({ status: 'paid' })), 'paid');
});
