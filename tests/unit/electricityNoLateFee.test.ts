import assert from 'node:assert/strict';
import test from 'node:test';
import { buildElectricityDueCountdown } from '@/src/lib/billing/electricityDueCountdown';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';

test('electricity projection accrues zero late fee on pending invoices', () => {
  const view = projectElectricityInvoice(
    {
      status: 'pending',
      amountPaise: 500_00,
      dueDate: '2026-09-07',
      paidPaise: 0,
      lateFeeLockedPaise: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    },
    '2026-09-10',
  );
  assert.equal(view.accruedLateFeePaise, 0);
  assert.equal(view.outstandingPaise, 500_00);
  assert.equal(view.effectiveStatus, 'overdue');
});

test('electricity due countdown shows deadline without late-fee percent', () => {
  const state = buildElectricityDueCountdown('2026-09-07', '2026-09-05');
  assert.match(state.message, /Payment due in/);
  assert.equal(state.isOverdue, false);
});
