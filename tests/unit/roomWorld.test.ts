import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { usesElectricityCheckoutQr, resolveBookingCheckoutQr } from '../../src/lib/payments/checkoutQr';
import { getRoomVisualSeed } from '../../src/lib/roomWorld/roomVisualSeed';

describe('checkout QR routing', () => {
  it('uses electricity QR for fixed stays', () => {
    assert.equal(usesElectricityCheckoutQr({ durationMode: 'fixed_stay' }), true);
  });

  it('uses rent QR for open-ended living', () => {
    assert.equal(usesElectricityCheckoutQr({ durationMode: 'open_ended' }), false);
  });

  it('uses rent QR for monthly stays', () => {
    assert.equal(usesElectricityCheckoutQr({ durationMode: 'monthly' }), false);
  });

  it('uses electricity QR for reserve bookings', () => {
    assert.equal(usesElectricityCheckoutQr({ durationMode: 'reserve' }), true);
  });

  it('resolveBookingCheckoutQr picks electricity path for fixed_stay', () => {
    const qr = resolveBookingCheckoutQr({
      durationMode: 'fixed_stay',
      rentCategory: { qrCodeImageUrl: '/rent.png', upiId: 'rent@upi' },
      electricityCategory: { qrCodeImageUrl: '/elec.png', upiId: 'elec@upi' },
    });
    assert.equal(qr.qrImageUrl, '/elec.png');
    assert.equal(qr.upiId, 'elec@upi');
  });
});

describe('room visual seed', () => {
  it('is deterministic per room id', () => {
    const a = getRoomVisualSeed('room-abc-123');
    const b = getRoomVisualSeed('room-abc-123');
    assert.deepEqual(a, b);
    assert.ok(a.seed >= 0 && a.seed < 7);
  });
});
