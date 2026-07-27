import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { labelBookingStatus } from '../../src/lib/booking/bookingStatus';

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('booking payment notification timing', () => {
  it('customer createBooking does not emit booking_created admin notifications', () => {
    const src = read('src/services/booking.ts');
    assert.doesNotMatch(src, /emitBookingCreatedAdminNotifications/);
    // Customer path must not schedule admin sync on draft create.
    assert.match(src, /if \(isAdminCreated\) \{\s*scheduleAdminNotificationSync\(\);/s);
  });

  it('payment proof submit emits New Payment Awaiting Verification', () => {
    const qr = read('src/services/qrPayments.ts');
    assert.match(qr, /emitPaymentAwaitingVerificationAdminNotifications/);
    assert.match(qr, /runPostBookingPaymentSubmitSideEffects/);

    const engine = read('src/services/notificationEngine.ts');
    assert.match(engine, /New Payment Awaiting Verification/);
    assert.match(engine, /emitPaymentAwaitingVerificationAdminNotifications/);
    assert.match(engine, /Action: Review Payment/);
  });

  it('action-item sync uses awaiting-verification title for payment_received', () => {
    const adminNotif = read('src/services/adminNotifications.ts');
    assert.match(adminNotif, /payment_received: 'New Payment Awaiting Verification'/);

    const actionItems = read('src/services/actionItems.ts');
    assert.match(actionItems, /title: 'New Payment Awaiting Verification'/);
  });

  it('booking status labels match payment-first workflow', () => {
    assert.equal(labelBookingStatus('draft'), 'Payment Pending');
    assert.equal(labelBookingStatus('pending_payment'), 'Payment Pending');
    assert.equal(labelBookingStatus('pending_approval'), 'Payment Under Review');
    assert.equal(labelBookingStatus('confirmed'), 'Confirmed');
  });

  it('resident booking confirmed email only runs from payment success path', () => {
    const lifecycle = read('src/services/bookingLifecycle.ts');
    assert.match(lifecycle, /notifyBookingConfirmed/);
    const bookingCreate = read('src/services/booking.ts');
    assert.doesNotMatch(bookingCreate, /notifyBookingConfirmed/);
  });
});
