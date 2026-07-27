import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectionsBucketLabel,
  invoiceLifecycleLabel,
  lifecycleLabelToBucket,
} from '../../src/lib/collections/invoiceLifecycleLabel';

test('invoiceLifecycleLabel maps RFE effectiveStatus to product labels', () => {
  assert.equal(invoiceLifecycleLabel({ isUpcoming: true }), 'Upcoming');
  assert.equal(invoiceLifecycleLabel({ effectiveStatus: 'paid' }), 'Paid');
  assert.equal(invoiceLifecycleLabel({ effectiveStatus: 'partial' }), 'Partially Paid');
  assert.equal(invoiceLifecycleLabel({ effectiveStatus: 'overdue' }), 'Overdue');
  assert.equal(invoiceLifecycleLabel({ effectiveStatus: 'pending' }), 'Awaiting Payment');
  assert.equal(invoiceLifecycleLabel({ status: 'sent' }), 'Awaiting Payment');
  assert.equal(invoiceLifecycleLabel({ status: 'generated' }), 'Generated');
  assert.equal(
    invoiceLifecycleLabel({ effectiveStatus: 'payment_in_progress' }),
    'Under Verification',
  );
  assert.equal(
    invoiceLifecycleLabel({ effectiveStatus: 'payment_in_progress', inProofQueue: false }),
    'Payment Submitted',
  );
  assert.equal(invoiceLifecycleLabel({ status: 'cancelled' }), 'Cancelled');
  assert.equal(invoiceLifecycleLabel({ effectiveStatus: 'expired' }), 'Expired');
});

test('lifecycleLabelToBucket routes labels into dashboard buckets', () => {
  assert.equal(
    lifecycleLabelToBucket({ label: 'Upcoming', todayIso: '2026-07-28' }),
    'upcoming',
  );
  assert.equal(
    lifecycleLabelToBucket({
      label: 'Paid',
      paidAtIsoDay: '2026-07-28',
      todayIso: '2026-07-28',
    }),
    'paid_today',
  );
  assert.equal(
    lifecycleLabelToBucket({ label: 'Paid', paidAtIsoDay: '2026-07-27', todayIso: '2026-07-28' }),
    null,
  );
  assert.equal(
    lifecycleLabelToBucket({ label: 'Under Verification', todayIso: '2026-07-28' }),
    'awaiting',
  );
  assert.equal(
    lifecycleLabelToBucket({
      label: 'Awaiting Payment',
      dueDate: '2026-07-28',
      todayIso: '2026-07-28',
    }),
    'due_today',
  );
  assert.equal(
    lifecycleLabelToBucket({
      label: 'Awaiting Payment',
      dueDate: '2026-07-20',
      todayIso: '2026-07-28',
    }),
    'overdue',
  );
});

test('collectionsBucketLabel is stable', () => {
  assert.equal(collectionsBucketLabel('overdue'), 'Overdue');
  assert.equal(collectionsBucketLabel('awaiting'), 'Awaiting Verification');
  assert.equal(collectionsBucketLabel('upcoming'), 'Upcoming (7d)');
});
