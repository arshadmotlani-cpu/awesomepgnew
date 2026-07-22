import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  adminBookingStatusLabel,
  paymentCategoryBusinessLabel,
  stayTypeBusinessLabel,
} from '@/src/lib/stayType';

describe('stayType business labels', () => {
  test('admin stay types never expose reservation wording', () => {
    assert.equal(
      stayTypeBusinessLabel({ stayType: 'monthly_stay', durationMode: 'open_ended' }, 'ops'),
      'Monthly Stay',
    );
    assert.equal(
      stayTypeBusinessLabel({ stayType: 'fixed_date_stay', durationMode: 'fixed_stay' }, 'admin'),
      'Short Stay',
    );
    assert.equal(stayTypeBusinessLabel({ durationMode: 'daily' }, 'ops'), 'Daily Stay');
    assert.equal(stayTypeBusinessLabel({ durationMode: 'weekly' }, 'ops'), 'Weekly Stay');
    assert.equal(stayTypeBusinessLabel({ durationMode: 'reserve' }, 'ops'), 'Bed Hold');
  });

  test('payment category labels are business-facing', () => {
    assert.equal(paymentCategoryBusinessLabel('qr'), 'New stay payment');
    assert.equal(paymentCategoryBusinessLabel('rent'), 'Rent collection');
    assert.equal(paymentCategoryBusinessLabel('electricity'), 'Electricity');
    assert.equal(paymentCategoryBusinessLabel('deposit_link'), 'Deposit collection');
    assert.equal(paymentCategoryBusinessLabel('extension'), 'Extension');
  });

  test('admin booking status labels hide raw enums', () => {
    assert.equal(adminBookingStatusLabel('pending_payment'), 'Awaiting payment');
    assert.equal(adminBookingStatusLabel('pending_approval'), 'Awaiting review');
  });
});
