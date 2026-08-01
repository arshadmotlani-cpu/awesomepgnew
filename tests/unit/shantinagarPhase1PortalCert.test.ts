import test from 'node:test';
import assert from 'node:assert/strict';
import { computeResidentTotalDuePaise } from '@/src/lib/residents/residentPortalDisplay';

test('certification total due rejects any 1 paise drift', () => {
  const portal = computeResidentTotalDuePaise([
    { amountPaise: 10_000_00, href: '/pay/1' },
    { amountPaise: 500_00, href: '/pay/2' },
  ]);
  const backend = 10_500_00;
  assert.notEqual(portal, backend - 1);
  assert.equal(portal, backend);
});
