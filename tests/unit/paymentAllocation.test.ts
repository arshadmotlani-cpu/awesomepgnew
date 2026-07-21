import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestPaymentAllocation } from '@/src/services/paymentAllocation';

test('suggestPaymentAllocation defaults to zero rent and deposit — admin decides', () => {
  const suggestion = suggestPaymentAllocation({
    confirmedReceivedPaise: 618_000,
    rentOutstandingPaise: 412_000,
    depositOutstandingPaise: 412_000,
  });
  assert.equal(suggestion.confirmedReceivedPaise, 618_000);
  assert.equal(suggestion.rentAllocatedPaise, 0);
  assert.equal(suggestion.depositAllocatedPaise, 0);
});
