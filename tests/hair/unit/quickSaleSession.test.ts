import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuickSaleSessionSnapshot } from '../../../src/hair/lib/quickSaleSession.ts';

test('QuickSaleSessionSnapshot shape includes staffNames', () => {
  const snapshot: QuickSaleSessionSnapshot = {
    v: 1,
    customer: {
      id: 'c1',
      fullName: 'Jane',
      customerCode: 'FYH001',
      phone: '9876543210',
      walletBalancePaise: 0,
    },
    appointmentId: null,
    tab: 'service',
    catalogQ: 'trim',
    lines: [],
    payments: [],
    flags: {},
    holdInvoiceId: null,
    staffNames: { s1: 'Rahul' },
  };
  assert.equal(snapshot.staffNames.s1, 'Rahul');
  assert.equal(JSON.parse(JSON.stringify(snapshot)).v, 1);
});
