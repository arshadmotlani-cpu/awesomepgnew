import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  canBookBedFromSnapshot,
  computeBedOccupancySnapshot,
  toAdminAvailabilityView,
} from '@/src/lib/bedOccupancyEngine';
import {
  deriveAdminInventoryStatusFromBedMap,
  resolveBedOccupancy,
} from '@/src/lib/bedOccupancyResolve';
import { deriveBedDisplayStatus } from '@/src/components/admin/bedmap/BedStatusControl';
import type { PgBedMapBed } from '@/src/services/pgBedMap';

function mapBed(partial: Partial<PgBedMapBed>): PgBedMapBed {
  return {
    bedId: 'bed-1',
    bedCode: 'B1',
    bedStatus: 'available',
    maintenanceReason: null,
    maintenanceReasonCustom: null,
    maintenanceStartedAt: null,
    maintenanceExpectedCompletion: null,
    maintenanceNotes: null,
    isOccupiedToday: false,
    isAvailableNow: true,
    manualOccupied: false,
    manualReservedStart: null,
    manualReservedCheckIn: null,
    bedReserveCheckIn: null,
    occupant: null,
    reserved: null,
    reservedFrom: null,
    preBookableFrom: null,
    interestCount: 0,
    vacating: null,
    billing: { rentOverdueCount: 0, rentPendingCount: 0, electricityPendingCount: 0 },
    availability: { kind: 'open_now', label: 'Open · book now' },
    blockReason: 'none',
    underReview: null,
    transferHoldRequestId: null,
    ...partial,
  } as PgBedMapBed;
}

describe('tenancy blocks bookability — inventory AVAILABLE', () => {
  test('active reservation today → not bookable, not Open · book now on admin map', () => {
    const resolved = resolveBedOccupancy({
      bedId: 'bed-1',
      bedStatus: 'available',
      isOccupiedToday: true,
      isAvailableNow: false,
      stayType: 'monthly_stay',
      durationMode: 'open_ended',
      occupantFirstName: 'Priya',
    });
    assert.equal(resolved.isBookable, false);
    assert.equal(resolved.adminView.label, 'Priya');
    assert.notEqual(resolved.adminView.label, 'Open · book now');
    assert.equal(deriveAdminInventoryStatusFromBedMap(mapBed({ isOccupiedToday: true })), 'occupied');
  });

  test('under-review reservation → reserved in dropdown, not bookable', () => {
    const resolved = resolveBedOccupancy({
      bedId: 'bed-1',
      bedStatus: 'available',
      isOccupiedToday: false,
      underReviewRequest: true,
      underReviewMoveIn: '2026-10-05',
    });
    assert.equal(resolved.isBookable, false);
    assert.equal(resolved.adminView.kind, 'under_review');
    assert.equal(
      deriveBedDisplayStatus(
        mapBed({
          isAvailableNow: false,
          blockReason: 'under_review',
          underReview: {
            bookingId: 'b1',
            customerId: 'c1',
            customerName: 'Pending',
            customerPhone: '1',
            bookingCode: 'BK1',
            moveInDate: '2026-10-05',
            monthlyRentPaise: 760000,
            kycStatus: 'pending',
          },
          availability: resolved.adminView,
        }),
      ),
      'reserved',
    );
  });

  test('future confirmed move-in → booked label, not Open · book now', () => {
    const resolved = resolveBedOccupancy({
      bedId: 'bed-1',
      bedStatus: 'available',
      isOccupiedToday: false,
      isAvailableNow: false,
      reservedFrom: '2026-10-10',
      durationMode: 'open_ended',
      stayType: 'monthly_stay',
    });
    assert.equal(resolved.isBookable, false);
    assert.equal(resolved.adminView.kind, 'booked');
    assert.equal(deriveAdminInventoryStatusFromBedMap(mapBed({ reservedFrom: '2026-10-10', isAvailableNow: false, blockReason: 'reserved_incoming' })), 'reserved');
  });

  test('vacant available bed stays bookable', () => {
    const resolved = resolveBedOccupancy({
      bedId: 'bed-1',
      bedStatus: 'available',
      isOccupiedToday: false,
    });
    assert.equal(resolved.isBookable, true);
    assert.equal(resolved.adminView.label, 'Open · book now');
    assert.equal(deriveBedDisplayStatus(mapBed({})), 'available');
  });

  test('regression — isAvailableNow false without tenancy must not show Open · book now when not bookable', () => {
    const input = {
      bedStatus: 'available' as const,
      isOccupiedToday: false,
      isAvailableNow: false,
      transferHoldActive: true,
    };
    const snap = computeBedOccupancySnapshot(input);
    assert.equal(canBookBedFromSnapshot(input, snap), false);
    const view = toAdminAvailabilityView(input, snap);
    assert.notEqual(view.label, 'Open · book now');
  });

  test('unclosed active reservation past stay_range → occupied, not bookable', () => {
    const resolved = resolveBedOccupancy({
      bedId: 'bed-1',
      bedStatus: 'available',
      isOccupiedToday: false,
      tenancyBlocksBookability: true,
      occupantFirstName: 'Former',
    });
    assert.equal(resolved.isBookable, false);
    assert.equal(resolved.snapshot.publicState, 'occupied');
    assert.notEqual(resolved.adminView.label, 'Open · book now');
    assert.equal(
      deriveAdminInventoryStatusFromBedMap(mapBed({ tenancyBlocksBookability: true })),
      'occupied',
    );
  });
});
