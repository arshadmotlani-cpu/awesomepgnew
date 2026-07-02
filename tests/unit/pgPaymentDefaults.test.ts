import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_ELECTRICITY_DAILY_UPI_ID,
  DEFAULT_RENT_DEPOSIT_UPI_ID,
  ELECTRICITY_CATEGORY_NAME,
  RENT_DEPOSIT_BOOKING_CATEGORY_NAME,
} from '../../src/lib/payments/defaultQr';

describe('pgPaymentDefaults policy', () => {
  it('documents canonical default UPI IDs for rent and electricity', () => {
    assert.equal(DEFAULT_RENT_DEPOSIT_UPI_ID, 'shiba.motlani@oksbi');
    assert.equal(DEFAULT_ELECTRICITY_DAILY_UPI_ID, '9049163636@pthdfc');
    assert.match(RENT_DEPOSIT_BOOKING_CATEGORY_NAME, /rent/i);
    assert.match(ELECTRICITY_CATEGORY_NAME, /electric/i);
  });
});
