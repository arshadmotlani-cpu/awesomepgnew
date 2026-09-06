/**
 * Resident portal resilience — loader isolation, error states, move-out transition.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  hasResidentPortalReadyStay,
  resolveCanonicalResidentPortalBooking,
} from '@/src/lib/residents/residentPortalStay';
import { loadPortalSectionSafe } from '@/src/lib/residents/residentPortalLoaderSafety';
import type { ResidentBookingRow } from '@/src/db/queries/customer';
import type { ActiveTenancy } from '@/src/lib/residentActiveTenancy';

function booking(overrides: Partial<ResidentBookingRow> & { bookingId: string }): ResidentBookingRow {
  return {
    bookingId: overrides.bookingId,
    bookingCode: overrides.bookingCode ?? 'APG-1',
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
    createdAt: new Date('2026-08-01'),
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
    bookingCode: 'APG-1',
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

describe('resident portal resilience', () => {
  test('active resident is portal ready', () => {
    const primary = resolveCanonicalResidentPortalBooking([booking({ bookingId: 'b1' })], tenancy({ bookingId: 'b1' }));
    assert.equal(hasResidentPortalReadyStay({ hasResidentPortalAccess: true, primaryBooking: primary }), true);
  });

  test('vacating resident remains portal ready after move-out request', () => {
    const primary = resolveCanonicalResidentPortalBooking(
      [booking({ bookingId: 'b1' })],
      tenancy({
        bookingId: 'b1',
        isVacating: true,
        vacatingDate: '2026-09-09',
        vacatingStatus: 'pending',
      }),
    );
    assert.equal(hasResidentPortalReadyStay({ hasResidentPortalAccess: true, primaryBooking: primary }), true);
  });

  test('pending assignment is not portal ready', () => {
    assert.equal(hasResidentPortalReadyStay({ hasResidentPortalAccess: false, primaryBooking: null }), false);
  });

  test('optional loader failure degrades without throwing', async () => {
    const result = await loadPortalSectionSafe(
      {
        section: 'electricity_history',
        customerId: 'cust-1',
        loader: 'test_optional',
        required: false,
      },
      async () => {
        throw new Error('legacy electricity row');
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.category, 'optional_degraded');
  });

  test('historical booking does not override current confirmed stay', () => {
    const primary = resolveCanonicalResidentPortalBooking(
      [
        booking({ bookingId: 'old', status: 'completed', createdAt: new Date('2026-09-01') }),
        booking({ bookingId: 'current', status: 'confirmed', createdAt: new Date('2026-06-01') }),
      ],
      tenancy({ bookingId: 'current' }),
    );
    assert.equal(primary?.bookingId, 'current');
  });
});

describe('portal architecture guards', () => {
  test('payments tab isolates optional electricity loaders', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/residentPortalTabData.ts'), 'utf8');
    assert.match(src, /loadPortalSectionSafe/);
    assert.match(src, /loadPriorElectricityCollectionByBooking/);
    assert.match(src, /required: false/);
  });

  test('requests tab isolates vacating settlement loader', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/residentPortalTabData.ts'), 'utf8');
    assert.match(src, /section: 'vacating_settlement'/);
    assert.match(src, /loadVacatingBillingPresentationBundle/);
  });

  test('core context isolates financial summary', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/residentAccountContext.ts'), 'utf8');
    assert.match(src, /section: 'financial_summary'/);
    assert.match(src, /portalOptionalDegraded/);
  });

  test('safe loader distinguishes incomplete vs core_error', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/residentAccountContextSafe.ts'), 'utf8');
    assert.match(src, /reason: 'incomplete'/);
    assert.match(src, /reason: 'core_error'/);
    assert.doesNotMatch(src, /load_failed/);
  });

  test('payments tab section has localized fallback', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/account/ResidentAreaAsyncSections.tsx'),
      'utf8',
    );
    assert.match(src, /ResidentPortalSectionFallback/);
    assert.match(src, /section="payments"/);
  });

  test('requests tab section has localized fallback for post-move-out', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/account/ResidentAreaAsyncSections.tsx'),
      'utf8',
    );
    assert.match(src, /section="requests"/);
  });

  test('every resident tab section isolates its loader locally', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/account/ResidentAreaAsyncSections.tsx'),
      'utf8',
    );
    for (const section of ['profile', 'payments', 'requests', 'referrals', 'concierge']) {
      assert.match(src, new RegExp(`section="${section}"`), `${section} tab missing localized fallback`);
    }
    for (const section of ['profile_tab', 'payments_tab', 'requests_tab', 'referrals_tab', 'concierge_tab']) {
      assert.match(
        src,
        new RegExp(`section: '${section}'`),
        `${section} missing structured loader failure logging`,
      );
    }
  });

  test('every resident tab is wrapped in a section error boundary', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/account/ResidentAreaSection.tsx'),
      'utf8',
    );
    for (const page of [
      'resident_profile_tab',
      'resident_payments_tab',
      'resident_requests_tab',
      'resident_referrals_tab',
      'resident_concierge_tab',
    ]) {
      assert.match(src, new RegExp(`page="${page}"`), `${page} not wrapped in ResidentSectionErrorBoundary`);
    }
  });

  test('hub shell no longer uses global stay dashboard error title', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/customer/account/ResidentHubShell.tsx'), 'utf8');
    assert.doesNotMatch(src, /Your stay dashboard could not load/);
    assert.match(src, /This section could not load/);
  });

  test('error boundary retry uses router.refresh', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/customer/account/resident/ResidentSectionErrorBoundary.tsx'),
      'utf8',
    );
    assert.match(src, /ResidentPortalRefreshButton/);
  });

  test('profile page maps core_error to dedicated panel', () => {
    const src = readFileSync(join(process.cwd(), 'app/(customer)/account/profile/page.tsx'), 'utf8');
    assert.match(src, /ResidentPortalCoreErrorPanel/);
    assert.match(src, /reason === 'incomplete'/);
  });

  test('tabs use preloaded canonical primary booking', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/residentPortalTabData.ts'), 'utf8');
    assert.match(src, /resolvePortalPrimaryBookingDetail/);
    assert.match(src, /preloaded\.primaryBooking/);
  });

  test('production certification classifies portal health', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/residentPortalProductionCertification.ts'),
      'utf8',
    );
    assert.match(src, /CORE_ERROR/);
    assert.match(src, /OPTIONAL_DATA_DEGRADED/);
    assert.match(src, /loadResidentPaymentsTabData/);
  });

  test('move-out action revalidates resident views without mutating stay', () => {
    const src = readFileSync(join(process.cwd(), 'app/(customer)/account/resident/actions.ts'), 'utf8');
    assert.match(src, /revalidateResidentMoveOutCustomerViews/);
    assert.match(src, /revalidateVacatingLifecycleForBooking/);
    assert.doesNotMatch(src, /primaryBooking = null/);
  });
});
