import test from 'node:test';
import assert from 'node:assert/strict';
import { firstOfMonth } from '@/src/services/billing';

import { computeResidentTotalDuePaise } from '@/src/lib/residents/residentPortalDisplay';

test('cert current-month check normalizes billing month Date vs string', () => {
  const billingMonth = '2026-08-01';
  const latestRentBillingMonth = new Date('2026-08-01T00:00:00.000Z');
  assert.equal(firstOfMonth(latestRentBillingMonth), billingMonth);
  assert.notEqual(latestRentBillingMonth as unknown as string, billingMonth);
});

test('certification total due rejects any 1 paise drift', () => {
  const portal = computeResidentTotalDuePaise([
    { amountPaise: 10_000_00, href: '/pay/1' },
    { amountPaise: 500_00, href: '/pay/2' },
  ]);
  const backend = 10_500_00;
  assert.notEqual(portal, backend - 1);
  assert.equal(portal, backend);
});
