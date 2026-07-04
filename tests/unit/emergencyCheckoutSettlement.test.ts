import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { computeDepositRefundUnlockState } from '@/src/lib/billing/depositRefundUnlock';

describe('emergency checkout settlement SSOT', () => {
  test('adminRemoveTenantFromBed uses ensureEmergencyCheckoutForBooking', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/services/vacating.ts'),
      'utf8',
    );
    const fn = source.slice(source.indexOf('export async function adminRemoveTenantFromBed'));
    assert.match(fn, /ensureEmergencyCheckoutForBooking/);
    assert.match(fn, /admin_force_checkout/);
    assert.doesNotMatch(fn.slice(0, fn.indexOf('return { ok: true }')), /createCheckoutSettlementFromVacating/);
  });

  test('ensureCheckoutSettlementForBooking backfills completed stays without vacating', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/services/checkoutSettlement.ts'),
      'utf8',
    );
    assert.match(source, /ensureEmergencyCheckoutForBooking/);
    assert.doesNotMatch(
      source,
      /Checkout record is missing for this stay/,
    );
  });

  test('completed booking with emergency settlement unlocks refund immediately', () => {
    const unlock = computeDepositRefundUnlockState({
      booking: {
        status: 'completed',
        durationMode: 'monthly',
        expectedCheckoutDate: '2026-07-01',
        createdAt: new Date('2026-01-01'),
      },
      vacating: {
        id: 'vr-1',
        bookingId: 'b-1',
        customerId: 'c-1',
        status: 'completed',
        vacatingDate: '2026-07-01',
        noticeGivenDate: '2026-06-20',
        noticeCompliant: true,
        deductionPaise: 0,
        depositRefundPaise: 0,
        monthlyRentPaiseSnapshot: 412_100,
        createdAt: new Date('2026-06-20'),
      },
      settlement: {
        status: 'awaiting_resident_details',
        checkoutSource: 'emergency_checkout',
      },
      residentRequest: null,
      hasActiveBedToday: false,
      today: '2026-07-02',
    });
    assert.equal(unlock.canRequestRefund, true);
    assert.equal(unlock.state, 'unlocked');
    assert.equal(unlock.lockReason, null);
  });
});
