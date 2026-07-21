import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestPaymentAllocation } from '@/src/services/paymentAllocation';
import { normalizeOverpaymentDisposition } from '@/src/services/bookingOverpayment';

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

test('normalizeOverpaymentDisposition maps new allocation dispositions', () => {
  assert.equal(normalizeOverpaymentDisposition('allocate_deposit'), 'allocate_deposit');
  assert.equal(normalizeOverpaymentDisposition('allocate_rent'), 'allocate_rent');
  assert.equal(normalizeOverpaymentDisposition('allocate_electricity'), 'allocate_electricity');
  assert.equal(normalizeOverpaymentDisposition('advance_credit'), 'advance_credit');
  assert.equal(normalizeOverpaymentDisposition('refund_later'), 'refund_later');
  assert.equal(normalizeOverpaymentDisposition('wallet_credit'), 'allocate_deposit');
});
