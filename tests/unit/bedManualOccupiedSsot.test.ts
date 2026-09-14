/**
 * Admin manual_occupied SSOT — must not be cleared by availability reconciliation.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveBedDisplayStatus } from '@/src/components/admin/bedmap/BedStatusControl';
import { resolveBedOccupancy } from '@/src/lib/bedOccupancyResolve';
import { isAdminManualOccupiedMark, isStaleManualOccupiedWithoutBooking } from '@/src/lib/beds/bedManualOccupancySsot';
import type { PgBedMapBed } from '@/src/services/pgBedMap';

function mapBed(partial: Partial<PgBedMapBed>): PgBedMapBed {
  return {
    bedId: 'bed-1',
    bedCode: 'B3',
    bedStatus: 'available',
    maintenanceReason: null,
    maintenanceReasonCustom: null,
    maintenanceStartedAt: null,
    maintenanceExpectedCompletion: null,
    maintenanceNotes: null,
    isOccupiedToday: false,
    isAvailableNow: true,
    manualOccupied: true,
    manualReservedStart: null,
    manualReservedCheckIn: null,
    bedReserveCheckIn: null,
    occupant: null,
    reserved: null,
    reservedFrom: null,
    preBookableFrom: null,
    interestCount: 0,
    vacating: null,
    billing: {
      rentOverdueCount: 0,
      rentPendingCount: 0,
      electricityPendingCount: 0,
    },
    availability: { kind: 'occupied', label: 'Occupied', sublabel: null },
    blockReason: 'none',
    underReview: null,
    transferHoldRequestId: null,
    ...partial,
  } as PgBedMapBed;
}

test('A/B/C — admin manual occupied without booking is valid SSOT', () => {
  assert.ok(isAdminManualOccupiedMark(true));
  assert.equal(isStaleManualOccupiedWithoutBooking(true), false);
  assert.equal(deriveBedDisplayStatus(mapBed({ manualOccupied: true })), 'occupied');
});

test('D — genuinely available bed stays available', () => {
  assert.equal(
    deriveBedDisplayStatus(mapBed({ manualOccupied: false, isAvailableNow: true })),
    'available',
  );
});

test('E — active booking occupant shows occupied', () => {
  assert.equal(
    deriveBedDisplayStatus(
      mapBed({
        manualOccupied: false,
        occupant: {
          bookingId: 'b1',
          customerId: 'c1',
          customerName: 'Resident',
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

test('F — manual reserved check-in shows reserved', () => {
  assert.equal(
    deriveBedDisplayStatus(mapBed({ manualOccupied: false, manualReservedCheckIn: '2026-10-01' })),
    'reserved',
  );
});

test('G — maintenance inventory status', () => {
  assert.equal(deriveBedDisplayStatus(mapBed({ bedStatus: 'maintenance', manualOccupied: false })), 'maintenance');
});

test('J — admin map and public engine agree on manual occupied', () => {
  const resolved = resolveBedOccupancy({
    bedId: 'bed-1',
    bedStatus: 'available',
    isOccupiedToday: false,
    manualOccupied: true,
  });
  assert.equal(resolved.snapshot.publicState, 'occupied');
  assert.equal(resolved.isBookable, false);
  assert.equal(deriveBedDisplayStatus(mapBed({ manualOccupied: true })), 'occupied');
});

test('occupancy reconstruction does not clear manual_occupied without booking', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/occupancyReconstructionRepair.ts'),
    'utf8',
  );
  assert.doesNotMatch(src, /findStaleManualOccupied/);
});

test('production consistency repair does not auto-clear manual occupied', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/productionDataConsistencyAudit.ts'),
    'utf8',
  );
  assert.doesNotMatch(src, /repairBedAuditIssue\(issue, 'prod-data-repair'\)/);
});

test('runBedAudit issue kinds exclude ghost_occupied', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/bedAudit.ts'), 'utf8');
  assert.doesNotMatch(src, /ghost_occupied/);
});

test('I — room capacity reactivation does not reset manual_occupied', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/pgInventory.ts'), 'utf8');
  assert.match(src, /archivedAt: null/);
  assert.doesNotMatch(src, /manualOccupied:\s*false/);
});

test('K — manual occupied save revalidates occupancy views', () => {
  const actionSrc = readFileSync(
    join(process.cwd(), 'app/(admin)/admin/pgs/[pgId]/map/actions.ts'),
    'utf8',
  );
  const fn = actionSrc.slice(actionSrc.indexOf('export async function setBedManualOccupiedAction'));
  assert.match(fn.slice(0, 800), /revalidateOccupancyViews/);

  const opsSrc = readFileSync(join(process.cwd(), 'src/services/bookingAdminOps.ts'), 'utf8');
  const setFn = opsSrc.slice(opsSrc.indexOf('export async function setBedManualOccupied'));
  assert.match(setFn.slice(0, 2200), /scheduleAvailabilityCacheInvalidation/);
});
