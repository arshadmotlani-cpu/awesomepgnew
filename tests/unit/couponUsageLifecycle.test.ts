import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('coupon usage lifecycle (reserved vs consumed)', () => {
  it('migration defines reserved/consumed/released/expired and backfills', () => {
    const sql = read('src/db/migrations/0126_coupon_usage_lifecycle.sql');
    assert.match(sql, /discount_application_lifecycle/);
    assert.match(sql, /'reserved'/);
    assert.match(sql, /'consumed'/);
    assert.match(sql, /'released'/);
    assert.match(sql, /'expired'/);
    assert.match(sql, /status IN \('confirmed', 'completed'\)/);
    assert.match(sql, /status NOT IN \('confirmed', 'completed'\)/);
  });

  it('createBooking inserts applications as reserved with draft expiry', () => {
    const src = read('src/services/booking.ts');
    assert.match(src, /lifecycleStatus: isAdminCreated \? 'consumed' : 'reserved'/);
    assert.match(src, /expiresAt: isAdminCreated \? null : draftExpiresAt/);
  });

  it('usageLimit counts consumed only; concurrent reserve is blocked separately', () => {
    const engine = read('src/lib/billing/discountEngine.ts');
    assert.match(engine, /countConsumedPromoApplications/);
    assert.match(engine, /customerHasActivePromoReservation/);
    assert.match(engine, /lifecycleStatus, 'consumed'/);
    assert.match(engine, /lifecycleStatus, 'reserved'/);
    assert.doesNotMatch(
      engine,
      /b\.status NOT IN \('cancelled', 'refunded'\)/,
    );
  });

  it('recordPaymentSuccess consumes reservations on confirm', () => {
    const src = read('src/services/bookingLifecycle.ts');
    assert.match(src, /consumeCouponReservationsForBooking/);
  });

  it('release paths cover cancel, reject, draft expire, payment failure, hold expire', () => {
    const lifecycle = read('src/services/bookingLifecycle.ts');
    assert.match(lifecycle, /releaseCouponReservationForBooking/);

    const approval = read('src/lib/bookingApproval.ts');
    assert.match(approval, /releaseCouponReservationForBooking/);
    assert.match(approval, /payment_proof_rejected/);

    const reservation = read('src/services/reservationRequest.ts');
    assert.match(reservation, /releaseCouponReservationForBooking/);
    assert.match(reservation, /clearCouponReservationExpiryForBooking/);
    assert.match(reservation, /draft_abandoned/);
  });

  it('cron expires stale coupon reservations', () => {
    const cron = read('app/api/cron/release-holds/route.ts');
    assert.match(cron, /expireStaleCouponReservations/);
  });

  it('admin reports split used / reserved / released and top coupons use consumed only', () => {
    const admin = read('src/services/promoCouponAdmin.ts');
    assert.match(admin, /reservedCount/);
    assert.match(admin, /releasedCount/);
    assert.match(admin, /lifecycle_status = 'consumed'/);
    assert.match(admin, /lifecycleStatus, 'consumed'/);
  });

  it('couponLifecycle helpers export consume, release, clear expiry, expire stale', () => {
    const src = read('src/services/couponLifecycle.ts');
    assert.match(src, /export async function consumeCouponReservationsForBooking/);
    assert.match(src, /export async function releaseCouponReservationForBooking/);
    assert.match(src, /export async function clearCouponReservationExpiryForBooking/);
    assert.match(src, /export async function expireStaleCouponReservations/);
  });
});
