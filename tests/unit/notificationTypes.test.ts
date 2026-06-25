import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  categoryForNotificationType,
  priorityForNotificationType,
} from '../../src/lib/notifications/notificationTypes';

test('payment proof is critical payments category', () => {
  assert.equal(priorityForNotificationType('payment_proof_uploaded'), 'critical');
  assert.equal(categoryForNotificationType('payment_proof_uploaded'), 'payments');
});

test('booking created is critical bookings', () => {
  assert.equal(priorityForNotificationType('booking_created'), 'critical');
  assert.equal(categoryForNotificationType('booking_created'), 'bookings');
});

test('kyc is important', () => {
  assert.equal(priorityForNotificationType('kyc_pending'), 'important');
  assert.equal(categoryForNotificationType('kyc_pending'), 'kyc');
});
