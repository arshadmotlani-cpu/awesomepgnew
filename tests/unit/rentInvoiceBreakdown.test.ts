import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRentInvoiceBreakdownFromContext } from '@/src/lib/billing/rentInvoiceBreakdown';

test('buildRentInvoiceBreakdownFromContext itemizes full-month rent', () => {
  const breakdown = buildRentInvoiceBreakdownFromContext({
    invoice: {
      id: 'inv-1',
      invoiceNumber: 'RNT-2026-07-0001',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      bedId: 'bed-1',
      pgId: 'pg-1',
      billingMonth: '2026-07-01',
      dueDate: '2026-07-05',
      rentPaise: 721_140,
      status: 'pending',
      paidPrincipalPaise: 0,
      paidLateFeePaise: 0,
      lateFeeLockedPaise: null,
      notes: null,
      paymentProofUrl: null,
      paymentId: null,
      paidAt: null,
      cancelledAt: null,
      cancellationReason: null,
      isAdhoc: false,
      createdAt: new Date('2026-07-01'),
      updatedAt: new Date('2026-07-01'),
    },
    roomNumber: '201',
    bedCode: 'B1',
    monthlyRentPaise: 721_140,
    rentPricingSource: 'bed_price',
    isPrivateRoom: false,
    asOf: '2026-07-01',
  });

  assert.equal(breakdown.finalRentPaise, 721_140);
  assert.equal(breakdown.monthlyRentPaise, 721_140);
  assert.equal(breakdown.balanceDuePaise, 721_140);
  assert.equal(breakdown.proration, null);
  assert.match(breakdown.billingMonthLabel, /July 2026/);
});

test('buildRentInvoiceBreakdownFromContext shows anniversary billing period from notes', () => {
  const breakdown = buildRentInvoiceBreakdownFromContext({
    invoice: {
      id: 'inv-2',
      invoiceNumber: 'RNT-2026-06-0002',
      bookingId: 'bk-2',
      customerId: 'cust-2',
      bedId: 'bed-2',
      pgId: 'pg-1',
      billingMonth: '2026-06-01',
      dueDate: '2026-06-05',
      rentPaise: 721_140,
      status: 'pending',
      paidPrincipalPaise: 0,
      paidLateFeePaise: 0,
      lateFeeLockedPaise: null,
      notes: 'Billing period: 4 May 2026 → 4 Jun 2026',
      paymentProofUrl: null,
      paymentId: null,
      paidAt: null,
      cancelledAt: null,
      cancellationReason: null,
      isAdhoc: false,
      createdAt: new Date('2026-06-01'),
      updatedAt: new Date('2026-06-01'),
    },
    roomNumber: '203',
    bedCode: 'B3',
    monthlyRentPaise: 721_140,
    rentPricingSource: 'bed_price',
    isPrivateRoom: false,
    asOf: '2026-07-01',
  });

  assert.equal(breakdown.proration, null);
  assert.match(breakdown.billingMonthLabel, /4 May 2026/);
  assert.match(breakdown.billingMonthLabel, /4 Jun 2026/);
  assert.equal(breakdown.finalRentPaise, 721_140);
});

test('buildRentInvoiceBreakdownFromContext labels private room occupancy', () => {
  const breakdown = buildRentInvoiceBreakdownFromContext({
    invoice: {
      id: 'inv-3',
      invoiceNumber: 'RNT-2026-07-0003',
      bookingId: 'bk-3',
      customerId: 'cust-3',
      bedId: 'bed-3',
      pgId: 'pg-1',
      billingMonth: '2026-07-01',
      dueDate: '2026-07-05',
      rentPaise: 721_140,
      status: 'pending',
      paidPrincipalPaise: 0,
      paidLateFeePaise: 0,
      lateFeeLockedPaise: null,
      notes: null,
      paymentProofUrl: null,
      paymentId: null,
      paidAt: null,
      cancelledAt: null,
      cancellationReason: null,
      isAdhoc: false,
      createdAt: new Date('2026-07-01'),
      updatedAt: new Date('2026-07-01'),
    },
    roomNumber: '201',
    bedCode: 'B1',
    monthlyRentPaise: 721_140,
    rentPricingSource: 'bed_price',
    isPrivateRoom: true,
  });

  assert.equal(breakdown.isPrivateRoom, true);
  assert.match(breakdown.occupancyLabel, /Private room/);
});
