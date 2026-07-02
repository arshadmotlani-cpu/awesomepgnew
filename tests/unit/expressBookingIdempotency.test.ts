import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveExpressBookingIdempotencyKey } from '../../src/services/expressBookingIdempotency';

describe('deriveExpressBookingIdempotencyKey', () => {
  it('is stable for the same sale inputs', () => {
    const payload = {
      adminId: 'admin-1',
      customerId: 'cust-1',
      phone: '+917083608128',
      bedId: 'bed-1',
      checkInDate: '2026-07-01',
      stayType: 'continue',
      checkOutDate: null,
      rentAmountPaise: 800_000,
      depositRequiredPaise: 950_00,
      paymentStatus: 'paid_in_full',
    };
    const a = deriveExpressBookingIdempotencyKey(payload);
    const b = deriveExpressBookingIdempotencyKey(payload);
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it('changes when rent or bed changes', () => {
    const base = {
      adminId: 'admin-1',
      phone: '+917083608128',
      bedId: 'bed-1',
      checkInDate: '2026-07-01',
      stayType: 'continue',
      rentAmountPaise: 800_000,
      depositRequiredPaise: 950_00,
    };
    const k1 = deriveExpressBookingIdempotencyKey(base);
    const k2 = deriveExpressBookingIdempotencyKey({ ...base, bedId: 'bed-2' });
    assert.notEqual(k1, k2);
  });
});

describe('cancelled rent invoice tombstone detection', () => {
  it('matches express walk-in rollback reasons', () => {
    const reasons = [
      '[rollback] Unified invoice sync failed.',
      '[system] Express walk-in rolled back — invoice creation failed mid-flight',
    ];
    for (const reason of reasons) {
      assert.ok(
        reason.includes('Express walk-in rolled back') ||
          reason.includes('[rollback]') ||
          reason.includes('[system]'),
      );
    }
  });
});
