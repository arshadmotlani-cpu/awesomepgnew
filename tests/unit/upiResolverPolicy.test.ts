import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ELECTRICITY_DAILY_UPI_ID,
  DEFAULT_RENT_DEPOSIT_UPI_ID,
  ELECTRICITY_CATEGORY_NAME,
  RENT_DEPOSIT_BOOKING_CATEGORY_NAME,
} from '../../src/lib/payments/defaultQr';

test('payment purpose resolvers use canonical category names', () => {
  assert.equal(RENT_DEPOSIT_BOOKING_CATEGORY_NAME, 'Rent, Deposit & Booking');
  assert.equal(ELECTRICITY_CATEGORY_NAME, 'Electricity, Daily & Reservation');
  assert.match(DEFAULT_RENT_DEPOSIT_UPI_ID, /@/);
  assert.match(DEFAULT_ELECTRICITY_DAILY_UPI_ID, /@/);
  assert.notEqual(DEFAULT_RENT_DEPOSIT_UPI_ID, DEFAULT_ELECTRICITY_DAILY_UPI_ID);
});
