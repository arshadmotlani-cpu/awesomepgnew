/**
 * Regression tests — resident portal stay readiness and vacating lifecycle.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { pickAuthoritativePrimaryStay, stayRank } from '@/src/lib/occupancy/authoritativePrimaryStay';
import { loadPriorElectricityCollectionForCustomer } from '@/src/lib/billing/electricityPriorCollection';
import {
  hasResidentPortalReadyStay,
  resolveCanonicalResidentPortalBooking,
} from '@/src/lib/residents/residentPortalStay';
import type { ResidentBookingRow } from '@/src/db/queries/customer';
import type { ActiveTenancy } from '@/src/lib/residentActiveTenancy';

function booking(overrides: Partial<ResidentBookingRow> & { bookingId: string }): ResidentBookingRow {
  return {
    bookingId: overrides.bookingId,
    bookingCode: overrides.bookingCode ?? overrides.bookingId,
    customerId: 'cust-1',
    customerFullName: 'Resident',
    customerPhone: '+919999999999',
    bedId: 'bed-1',
    bedCode: 'B1',
    roomId: 'room-1',
    roomNumber: '101',
    pgId: 'pg-1',
    pgName: 'PG',
    pgSlug: 'pg',
    durationMode: 'monthly',
    status: overrides.status ?? 'confirmed',
    checkInDate: '2026-08-01',
    expectedCheckoutDate: '2026-09-30',
    createdAt: overrides.createdAt ?? new Date('2026-08-01'),
    monthlyRentPaise: 10_000,
    depositPaise: 5_000,
    adminDuesStatus: null,
    adminDepositRefundStatus: null,
    depositCollectionStatus: 'held',
    depositDuePaise: 0,
    depositDueDate: null,
    ...overrides,
  };
}

function tenancy(overrides: Partial<ActiveTenancy> & { bookingId: string }): ActiveTenancy {
  return {
    bookingId: overrides.bookingId,
    bookingCode: overrides.bookingCode ?? 'APG-1',
    pgId: 'pg-1',
    pgName: 'PG',
    roomNumber: '101',
    roomId: 'room-1',
    bedId: 'bed-1',
    bedCode: 'B1',
    floorNumber: 1,
    monthlyRentPaise: 10_000,
    depositPaise: 5_000,
    blocksRoomAvailability: true,
    moveInDate: '2026-08-01',
    billingAnchorDate: '2026-08-01',
    durationMode: 'monthly',
    stayType: 'monthly',
    expectedCheckoutDate: '2026-09-30',
    isLivingToday: true,
    isVacating: overrides.isVacating ?? false,
    vacatingDate: overrides.vacatingDate ?? null,
    vacatingStatus: overrides.vacatingStatus ?? null,
    ...overrides,
  };
}

describe('resident portal stay readiness', () => {
  test('confirmed active resident is portal ready', () => {
    const b = booking({ bookingId: 'b1' });
    const t = tenancy({ bookingId: 'b1', isVacating: false });
    const primary = resolveCanonicalResidentPortalBooking([b], t);
    assert.ok(primary);
    assert.equal(hasResidentPortalReadyStay({ hasResidentPortalAccess: true, primaryBooking: primary }), true);
  });

  test('confirmed vacating resident is portal ready', () => {
    const b = booking({ bookingId: 'b1' });
    const t = tenancy({
      bookingId: 'b1',
      isVacating: true,
      vacatingDate: '2026-09-09',
      vacatingStatus: 'approved',
    });
    const primary = resolveCanonicalResidentPortalBooking([b], t);
    assert.ok(primary);
    assert.equal(hasResidentPortalReadyStay({ hasResidentPortalAccess: true, primaryBooking: primary }), true);
  });

  test('resident with move-out date still portal ready before checkout', () => {
    const b = booking({ bookingId: 'b1', expectedCheckoutDate: '2026-09-09' });
    const t = tenancy({
      bookingId: 'b1',
      isVacating: true,
      vacatingDate: '2026-09-09',
      vacatingStatus: 'approved',
      isLivingToday: true,
    });
    assert.ok(resolveCanonicalResidentPortalBooking([b], t));
    assert.equal(
      hasResidentPortalReadyStay({
        hasResidentPortalAccess: true,
        primaryBooking: resolveCanonicalResidentPortalBooking([b], t),
      }),
      true,
    );
  });

  test('awaiting bed assignment is not portal ready', () => {
    assert.equal(
      hasResidentPortalReadyStay({ hasResidentPortalAccess: false, primaryBooking: null }),
      false,
    );
  });

  test('portal access without primary booking is not portal ready', () => {
    assert.equal(
      hasResidentPortalReadyStay({ hasResidentPortalAccess: true, primaryBooking: null }),
      false,
    );
  });

  test('multiple bookings — current confirmed stay wins over newer incomplete row', () => {
    const oldCompleted = booking({
      bookingId: 'old',
      status: 'completed',
      createdAt: new Date('2026-09-01'),
      roomId: 'room-old',
    });
    const current = booking({
      bookingId: 'current',
      status: 'confirmed',
      createdAt: new Date('2026-06-01'),
      roomId: 'room-current',
    });
    const t = tenancy({ bookingId: 'current', roomId: 'room-current' });
    const primary = resolveCanonicalResidentPortalBooking([oldCompleted, current], t);
    assert.equal(primary?.bookingId, 'current');
    assert.equal(primary?.roomId, 'room-current');
  });

  test('hold reservation ranks above stale active rows for checkout limbo', () => {
    const chosen = pickAuthoritativePrimaryStay([
      {
        bedId: 'bed-hold',
        status: 'hold',
        inStayToday: false,
        upcomingMonthly: false,
        stayStart: '2026-08-01',
      },
      {
        bedId: 'bed-old',
        status: 'active',
        inStayToday: false,
        upcomingMonthly: false,
        stayStart: '2026-01-01',
      },
    ]);
    assert.equal(chosen?.bedId, 'bed-hold');
    assert.equal(stayRank({ status: 'hold', inStayToday: false, upcomingMonthly: false, stayStart: '' }), 1);
  });
});

describe('prior electricity collection guard', () => {
  test('skips invoices with missing room id', async () => {
    const result = await loadPriorElectricityCollectionForCustomer('cust-1', [
      { roomId: '', billingMonth: '2026-09-01' },
      { roomId: null, billingMonth: '2026-09-01' },
    ]);
    assert.equal(result.size, 0);
  });
});

describe('portal architecture guards', () => {
  test('portal access uses portal tenancy SSOT', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/residents/residentPortalAccess.ts'), 'utf8');
    assert.match(src, /getPortalTenancyForCustomer/);
  });

  test('resident account context resolves canonical portal booking', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/residentAccountContext.ts'), 'utf8');
    assert.match(src, /getPortalTenancyForCustomer/);
    assert.match(src, /resolveCanonicalResidentPortalBooking/);
  });

  test('incomplete stay panel uses portal ready predicate', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/account/ResidentAreaSection.tsx'),
      'utf8',
    );
    assert.match(src, /hasResidentPortalReadyStay/);
    assert.doesNotMatch(src, /hasConfirmedBookingWithoutDetail/);
  });

  test('occupancy SSOT exports portal assigned reservation sql', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/occupancySsot.ts'), 'utf8');
    assert.match(src, /portalAssignedReservationSql_b/);
    assert.match(src, /vacating_requests/);
  });
});
