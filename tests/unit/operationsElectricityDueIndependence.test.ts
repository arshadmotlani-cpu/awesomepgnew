import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCollectionsQueue,
  electricityRowToQueueItem,
  rentRowToQueueItem,
} from '@/src/lib/billing/collectionsQueue';
import { OPS_QUEUE_FILTERS } from '@/src/lib/operations/operationsFilterLinks';
import type { AdminElectricityInvoiceReminderRow } from '@/src/db/queries/admin';
import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';

function sampleRent(overrides: Partial<AdminRentInvoiceRow> = {}): AdminRentInvoiceRow {
  return {
    id: 'rent-1',
    bookingId: 'booking-1',
    customerId: 'cust-1',
    customerFullName: 'Manjusha Bhosale',
    customerPhone: '9000000000',
    pgId: 'pg-1',
    pgName: 'SHANTINAGAR',
    roomNumber: '203',
    bedCode: 'A',
    invoiceNumber: 'R-1',
    billingMonth: '2026-08-01',
    dueDate: '2026-08-10',
    outstandingPaise: 545_000,
    effectiveStatus: 'pending',
    ...overrides,
  };
}

function sampleElec(overrides: Partial<AdminElectricityInvoiceReminderRow> = {}): AdminElectricityInvoiceReminderRow {
  return {
    id: 'elec-inv-1',
    bookingId: 'booking-1',
    customerId: 'cust-1',
    customerFullName: 'Manjusha Bhosale',
    customerPhone: '9000000000',
    pgId: 'pg-1',
    pgName: 'SHANTINAGAR',
    roomNumber: '203',
    bedCode: 'A',
    invoiceNumber: 'ELE-1',
    billingMonth: '2026-08-01',
    dueDate: '2026-08-10',
    outstandingPaise: 82600,
    effectiveStatus: 'pending',
    isOverdue: false,
    paymentProofUrl: null,
    ...overrides,
  };
}

describe('operations electricity due independence', () => {
  it('A: rent unpaid + electricity not generated → rent queue only', () => {
    const queue = buildCollectionsQueue({
      rentRows: [sampleRent()],
      electricityRows: [],
    });
    assert.equal(queue.length, 1);
    assert.equal(queue[0].kind, 'rent');
  });

  it('B: rent unpaid + electricity generated unpaid → both queues', () => {
    const queue = buildCollectionsQueue({
      rentRows: [sampleRent()],
      electricityRows: [sampleElec()],
    });
    assert.equal(queue.length, 2);
    assert.deepEqual(queue.map((q) => q.kind).sort(), ['electricity', 'rent']);
  });

  it('C: rent paid + electricity generated unpaid → electricity only', () => {
    const queue = buildCollectionsQueue({
      rentRows: [],
      electricityRows: [sampleElec()],
    });
    assert.equal(queue.length, 1);
    assert.equal(queue[0].kind, 'electricity');
    assert.equal(rentRowToQueueItem(sampleRent({ outstandingPaise: 0, effectiveStatus: 'paid' }), '2026-08-01'), null);
  });

  it('D: both paid → no collection queue items', () => {
    const queue = buildCollectionsQueue({
      rentRows: [sampleRent({ outstandingPaise: 0, effectiveStatus: 'paid' })],
      electricityRows: [sampleElec({ outstandingPaise: 0, effectiveStatus: 'paid' })],
    });
    assert.equal(queue.length, 0);
  });

  it('unpaid electricity without generated invoice row is not in electricity due', () => {
    assert.equal(electricityRowToQueueItem(sampleElec({ outstandingPaise: 0 }), '2026-08-01'), null);
    assert.equal(
      electricityRowToQueueItem(sampleElec({ bookingId: null as unknown as string }), '2026-08-01'),
      null,
    );
  });
});

describe('operations queue filters', () => {
  it('does not include electricity bills pending tab', () => {
    assert.equal(OPS_QUEUE_FILTERS.includes('electricity_billing_pending' as never), false);
    const unifiedSrc = readFileSync(
      join(process.cwd(), 'src/services/unifiedOperationsQueue.ts'),
      'utf8',
    );
    assert.doesNotMatch(unifiedSrc, /electricity_billing_pending/);
    assert.doesNotMatch(unifiedSrc, /appendElectricityBillingPendingItems/);
    assert.doesNotMatch(unifiedSrc, /listRoomsMissingElectricityBill/);
  });
});
