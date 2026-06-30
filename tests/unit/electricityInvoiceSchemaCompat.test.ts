import test from 'node:test';
import assert from 'node:assert/strict';
import {
  asElectricityInvoiceRow,
  electricityInvoiceLegacySelect,
} from '@/src/lib/db/electricityInvoiceSelect';

test('legacy select omits migration 0087 dedup columns', () => {
  const keys = Object.keys(electricityInvoiceLegacySelect);
  assert.equal(keys.includes('roomId'), false);
  assert.equal(keys.includes('supersededByInvoiceId'), false);
  assert.equal(keys.includes('duplicateDetectedAt'), false);
  assert.equal(keys.includes('status'), true);
  assert.equal(keys.includes('cancelledAt'), true);
});

test('asElectricityInvoiceRow fills dedup defaults for legacy rows', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const row = asElectricityInvoiceRow(
    {
      id: 'inv-1',
      invoiceNumber: 'ELEC-2026-06-0001',
      electricityBillId: 'bill-1',
      bookingId: 'book-1',
      customerId: 'cust-1',
      bedId: 'bed-1',
      billingMonth: '2026-06-01',
      dueDate: '2026-06-04',
      amountPaise: 50000,
      paidPaise: 0,
      lateFeeLockedPaise: null,
      status: 'pending',
      paymentId: null,
      paidAt: null,
      paymentProofUrl: null,
      unitsShare: '1',
      activeDays: 30,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    },
    { roomId: 'room-1' },
  );
  assert.equal(row.roomId, 'room-1');
  assert.equal(row.supersededByInvoiceId, null);
  assert.equal(row.duplicateDetectedAt, null);
});
