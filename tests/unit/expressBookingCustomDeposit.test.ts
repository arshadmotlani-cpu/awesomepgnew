import assert from 'node:assert/strict';
import test from 'node:test';
import { validateExpressBookingDepositTerms } from '@/src/lib/expressBooking/expressBookingDepositValidation';
import { allowsCustomDepositOverride } from '@/src/lib/expressBooking/expressBookingSaleIntent';

test('manual onboarding allows custom deposit override', () => {
  assert.equal(allowsCustomDepositOverride('manual_onboarding'), true);
  assert.equal(allowsCustomDepositOverride('sale'), false);
});

test('sale mode rejects deposit mismatch with catalog', () => {
  const res = validateExpressBookingDepositTerms({
    stayType: 'continue',
    quoteDepositPaise: 1000000,
    depositRequiredPaise: 2500000,
    depositPaidPaise: 2500000,
    allowCustomDeposit: false,
  });
  assert.equal(res.ok, false);
});

test('manual onboarding accepts custom deposit obligation', () => {
  const res = validateExpressBookingDepositTerms({
    stayType: 'continue',
    quoteDepositPaise: 1000000,
    depositRequiredPaise: 2500000,
    depositPaidPaise: 2500000,
    allowCustomDeposit: true,
  });
  assert.equal(res.ok, true);
});

test('deposit collected cannot exceed obligation', () => {
  const res = validateExpressBookingDepositTerms({
    stayType: 'continue',
    quoteDepositPaise: 1000000,
    depositRequiredPaise: 500000,
    depositPaidPaise: 600000,
    allowCustomDeposit: true,
  });
  assert.equal(res.ok, false);
});

test('partial deposit collection is allowed', () => {
  const res = validateExpressBookingDepositTerms({
    stayType: 'continue',
    quoteDepositPaise: 1000000,
    depositRequiredPaise: 1000000,
    depositPaidPaise: 500000,
    allowCustomDeposit: true,
  });
  assert.equal(res.ok, true);
});

test('fixed stay rejects any deposit', () => {
  const res = validateExpressBookingDepositTerms({
    stayType: 'fixed',
    quoteDepositPaise: 0,
    depositRequiredPaise: 100,
    depositPaidPaise: 0,
    allowCustomDeposit: true,
  });
  assert.equal(res.ok, false);
});
