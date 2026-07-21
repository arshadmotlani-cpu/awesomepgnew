import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeMoneySlice,
  unallocatedPaymentPaise,
  validatePaymentAllocation,
} from '@/src/lib/billing/bookingMoneyBalances';

test('computeMoneySlice derives outstanding from required minus received', () => {
  const slice = computeMoneySlice(412_000, 206_000);
  assert.equal(slice.requiredPaise, 412_000);
  assert.equal(slice.receivedPaise, 206_000);
  assert.equal(slice.outstandingPaise, 206_000);
});

test('validatePaymentAllocation accepts ₹6180 → rent 4120 + deposit 2060', () => {
  const result = validatePaymentAllocation({
    allocation: {
      confirmedReceivedPaise: 618_000,
      rentAllocatedPaise: 412_000,
      depositAllocatedPaise: 206_000,
    },
    rentOutstandingBeforePaise: 412_000,
    depositOutstandingBeforePaise: 412_000,
  });
  assert.equal(result.ok, true);
});

test('validatePaymentAllocation rejects allocation exceeding confirmed received', () => {
  const result = validatePaymentAllocation({
    allocation: {
      confirmedReceivedPaise: 200_000,
      rentAllocatedPaise: 150_000,
      depositAllocatedPaise: 100_000,
    },
    rentOutstandingBeforePaise: 412_000,
    depositOutstandingBeforePaise: 412_000,
  });
  assert.equal(result.ok, false);
});

test('validatePaymentAllocation rejects deposit above outstanding', () => {
  const result = validatePaymentAllocation({
    allocation: {
      confirmedReceivedPaise: 200_000,
      rentAllocatedPaise: 0,
      depositAllocatedPaise: 200_000,
    },
    rentOutstandingBeforePaise: 412_000,
    depositOutstandingBeforePaise: 100_000,
  });
  assert.equal(result.ok, false);
});

test('unallocatedPaymentPaise returns remainder after rent and deposit', () => {
  assert.equal(
    unallocatedPaymentPaise({
      confirmedReceivedPaise: 618_000,
      rentAllocatedPaise: 412_000,
      depositAllocatedPaise: 206_000,
    }),
    0,
  );
  assert.equal(
    unallocatedPaymentPaise({
      confirmedReceivedPaise: 200_000,
      rentAllocatedPaise: 200_000,
      depositAllocatedPaise: 0,
    }),
    0,
  );
});
