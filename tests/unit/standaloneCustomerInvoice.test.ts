import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { displayRatePerDayPaise } from '@/src/lib/billing/companyReimbursementCopy';
import {
  standaloneAccommodationLineLabel,
  STANDALONE_UNPAID_STATUS_LABEL,
} from '@/src/services/standaloneCustomerInvoice';
import {
  standaloneInvoiceIdentityKey,
  standalonePlaceholderEmail,
  standalonePlaceholderPhoneLocal,
} from '@/src/services/standaloneInvoiceContact';

describe('standaloneCustomerInvoice', () => {
  test('computes display rate and line label for daily rent', () => {
    const totalPaise = 420_000;
    const days = 4;
    const rate = displayRatePerDayPaise(totalPaise, days);
    assert.equal(rate, 105_000);
    const label = standaloneAccommodationLineLabel({
      description: 'PG Accommodation — Daily Rent',
      durationDays: days,
      ratePerDayPaise: rate,
    });
    assert.match(label, /₹1,050\/day/);
    assert.match(label, /4 days/);
  });

  test('uses unpaid status label constant', () => {
    assert.equal(STANDALONE_UNPAID_STATUS_LABEL, 'Unpaid');
  });

  test('derives stable placeholder contact from name', () => {
    const key = standaloneInvoiceIdentityKey('Sushant S Khatakalle');
    assert.equal(key, 'sushant s khatakalle|');
    const email = standalonePlaceholderEmail(key);
    assert.match(email, /^standalone\+[a-f0-9]+@invoices\.awesomepg\.in$/);
    const phone = standalonePlaceholderPhoneLocal(key);
    assert.match(phone, /^6\d{9}$/);
    assert.equal(standalonePlaceholderEmail(key), email);
    assert.equal(standalonePlaceholderPhoneLocal(key), phone);
  });
});
