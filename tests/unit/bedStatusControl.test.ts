import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveBedDisplayStatus } from '@/src/components/admin/bedmap/BedStatusControl';
import type { PgBedMapBed } from '@/src/services/pgBedMap';

function bed(partial: Partial<PgBedMapBed>): PgBedMapBed {
  return {
    bedId: 'bed-1',
    bedCode: 'A',
    bedStatus: 'available',
    availability: { kind: 'open', label: 'Open', sublabel: null },
    isAvailableNow: true,
    isOccupiedToday: false,
    manualOccupied: false,
    manualReservedCheckIn: null,
    occupant: null,
    reserved: null,
    reservedFrom: null,
    vacating: null,
    maintenanceReason: null,
    maintenanceReasonCustom: null,
    maintenanceStartedAt: null,
    maintenanceExpectedCompletion: null,
    maintenanceNotes: null,
    blockReason: 'none',
    underReview: null,
    bedReserveCheckIn: null,
    isOccupiedToday: false,
    ...partial,
  } as PgBedMapBed;
}

test('deriveBedDisplayStatus — maintenance inventory status', () => {
  assert.equal(deriveBedDisplayStatus(bed({ bedStatus: 'maintenance' })), 'maintenance');
});

test('deriveBedDisplayStatus — occupied tenant', () => {
  assert.equal(
    deriveBedDisplayStatus(
      bed({
        occupant: {
          bookingId: 'b1',
          customerId: 'c1',
          customerName: 'Test',
          customerPhone: '1',
          bookingCode: 'BK1',
          moveInDate: '2026-07-01',
          monthlyRentPaise: 10000,
          kycStatus: 'approved',
        },
      }),
    ),
    'occupied',
  );
});

test('deriveBedDisplayStatus — manual website marks', () => {
  assert.equal(deriveBedDisplayStatus(bed({ manualOccupied: true })), 'occupied');
  assert.equal(
    deriveBedDisplayStatus(bed({ manualReservedCheckIn: '2026-08-01' })),
    'reserved',
  );
});

test('deriveBedDisplayStatus — available when empty', () => {
  assert.equal(deriveBedDisplayStatus(bed({})), 'available');
});

test('deriveBedDisplayStatus — under review uses reserved (tenancy SSOT)', () => {
  assert.equal(
    deriveBedDisplayStatus(
      bed({
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
      }),
    ),
    'reserved',
  );
});
