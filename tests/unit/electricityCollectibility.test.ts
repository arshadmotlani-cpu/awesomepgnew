import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPaidElectricityBookingMonthKeys,
  electricityBookingMonthKey,
  isElectricityAwaitingAdminApproval,
  isElectricityAwaitingResidentPayment,
} from '@/src/lib/billing/electricityCollectibility';

const base = {
  id: 'inv-1',
  status: 'pending',
  paymentProofUrl: null,
  outstandingPaise: 82600,
  effectiveStatus: 'pending',
  supersededByInvoiceId: null,
  bookingId: 'booking-1',
  billingMonth: '2026-06-01',
};

test('electricity collectibility excludes proof-pending and paid-month siblings', () => {
  assert.equal(isElectricityAwaitingResidentPayment(base), true);
  assert.equal(
    isElectricityAwaitingResidentPayment({ ...base, paymentProofUrl: 'https://proof' }),
    false,
  );
  assert.equal(isElectricityAwaitingAdminApproval({ ...base, paymentProofUrl: 'https://proof' }), true);
  assert.equal(
    isElectricityAwaitingResidentPayment(
      base,
      buildPaidElectricityBookingMonthKeys([{ bookingId: 'booking-1', billingMonth: '2026-06-01' }]),
    ),
    false,
  );
  assert.equal(
    electricityBookingMonthKey('booking-1', '2026-06-01'),
    'booking-1:2026-06-01',
  );
});
