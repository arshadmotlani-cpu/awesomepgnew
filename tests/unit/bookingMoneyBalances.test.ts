import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeMoneySlice,
  totalAllocatedPaise,
  unallocatedPaymentPaise,
  validatePaymentAllocation,
} from '@/src/lib/billing/bookingMoneyBalances';
import { suggestPaymentAllocation } from '@/src/services/paymentAllocation';

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
      electricityAllocatedPaise: 0,
      otherAllocatedPaise: 0,
    },
    rentOutstandingBeforePaise: 412_000,
    depositOutstandingBeforePaise: 412_000,
  });
  assert.equal(result.ok, true);
});

test('validatePaymentAllocation accepts deposit-only ₹2000', () => {
  const result = validatePaymentAllocation({
    allocation: {
      confirmedReceivedPaise: 200_000,
      rentAllocatedPaise: 0,
      depositAllocatedPaise: 200_000,
      electricityAllocatedPaise: 0,
      otherAllocatedPaise: 0,
    },
    rentOutstandingBeforePaise: 412_000,
    depositOutstandingBeforePaise: 412_000,
  });
  assert.equal(result.ok, true);
});

test('validatePaymentAllocation accepts rent-only ₹2000', () => {
  const result = validatePaymentAllocation({
    allocation: {
      confirmedReceivedPaise: 200_000,
      rentAllocatedPaise: 200_000,
      depositAllocatedPaise: 0,
      electricityAllocatedPaise: 0,
      otherAllocatedPaise: 0,
    },
    rentOutstandingBeforePaise: 412_000,
    depositOutstandingBeforePaise: 412_000,
    allowRentPrepay: true,
  });
  assert.equal(result.ok, true);
});

test('validatePaymentAllocation accepts mixed ₹2000 rent + deposit', () => {
  const result = validatePaymentAllocation({
    allocation: {
      confirmedReceivedPaise: 200_000,
      rentAllocatedPaise: 100_000,
      depositAllocatedPaise: 100_000,
      electricityAllocatedPaise: 0,
      otherAllocatedPaise: 0,
    },
    rentOutstandingBeforePaise: 412_000,
    depositOutstandingBeforePaise: 412_000,
    allowRentPrepay: true,
  });
  assert.equal(result.ok, true);
});

test('validatePaymentAllocation rejects allocation exceeding confirmed received', () => {
  const result = validatePaymentAllocation({
    allocation: {
      confirmedReceivedPaise: 200_000,
      rentAllocatedPaise: 150_000,
      depositAllocatedPaise: 100_000,
      electricityAllocatedPaise: 0,
      otherAllocatedPaise: 0,
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
      electricityAllocatedPaise: 0,
      otherAllocatedPaise: 0,
    },
    rentOutstandingBeforePaise: 412_000,
    depositOutstandingBeforePaise: 100_000,
  });
  assert.equal(result.ok, false);
});

test('validatePaymentAllocation rejects electricity above outstanding', () => {
  const result = validatePaymentAllocation({
    allocation: {
      confirmedReceivedPaise: 500_000,
      rentAllocatedPaise: 0,
      depositAllocatedPaise: 0,
      electricityAllocatedPaise: 300_000,
      otherAllocatedPaise: 0,
    },
    rentOutstandingBeforePaise: 0,
    depositOutstandingBeforePaise: 0,
    electricityOutstandingBeforePaise: 200_000,
  });
  assert.equal(result.ok, false);
});

test('unallocatedPaymentPaise returns remainder after all categories', () => {
  assert.equal(
    unallocatedPaymentPaise({
      confirmedReceivedPaise: 618_000,
      rentAllocatedPaise: 412_000,
      depositAllocatedPaise: 206_000,
      electricityAllocatedPaise: 0,
      otherAllocatedPaise: 0,
    }),
    0,
  );
  assert.equal(
    unallocatedPaymentPaise({
      confirmedReceivedPaise: 200_000,
      rentAllocatedPaise: 200_000,
      depositAllocatedPaise: 0,
      electricityAllocatedPaise: 0,
      otherAllocatedPaise: 0,
    }),
    0,
  );
});

test('totalAllocatedPaise sums rent deposit electricity other', () => {
  assert.equal(
    totalAllocatedPaise({
      confirmedReceivedPaise: 10_000,
      rentAllocatedPaise: 4_000,
      depositAllocatedPaise: 3_000,
      electricityAllocatedPaise: 2_000,
      otherAllocatedPaise: 1_000,
    }),
    10_000,
  );
});

test('suggestPaymentAllocation defaults to zero — admin decides', () => {
  const suggestion = suggestPaymentAllocation({
    confirmedReceivedPaise: 618_000,
    rentOutstandingPaise: 412_000,
    depositOutstandingPaise: 412_000,
  });
  assert.equal(suggestion.confirmedReceivedPaise, 618_000);
  assert.equal(suggestion.rentAllocatedPaise, 0);
  assert.equal(suggestion.depositAllocatedPaise, 0);
  assert.equal(suggestion.electricityAllocatedPaise, 0);
  assert.equal(suggestion.otherAllocatedPaise, 0);
});
