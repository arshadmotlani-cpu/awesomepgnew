import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { deriveTenancyStatus } from '@/src/lib/residentActiveTenancy';
import {
  isResidentActiveLiving,
  isResidentBedAssigned,
} from '@/src/lib/residentBedAssignment';
import {
  filterResidentsForAdminList,
  matchesResidentListStatusFilter,
} from '@/src/lib/residents/residentListPresentation';
import { deriveResidentLifecycleBadge } from '@/src/lib/residents/residentLifecycleBadge';
import type { ResidentListRow } from '@/src/services/residentAdmin';

function row(overrides: Partial<ResidentListRow> = {}): ResidentListRow {
  return {
    id: 'c1',
    fullName: 'Resident X',
    email: 'x@example.com',
    phone: '9000000001',
    gender: 'male',
    kycStatus: 'approved',
    createdAt: new Date('2026-06-01'),
    tenancyStatus: 'active',
    pgId: 'pg-1',
    pgName: 'Shantinagar',
    roomNumber: '204',
    bedCode: 'B1',
    roomId: 'room-204',
    bedId: 'bed-b1',
    monthlyRentPaise: 412_080,
    bookingId: 'bk-1',
    bookingCode: 'APG-2026-0099',
    moveInDate: '2026-06-01',
    isLivingToday: true,
    vacatingDate: null,
    vacatingStatus: null,
    verificationSource: 'kyc',
    onboardingBookingId: null,
    onboardingBookingStatus: null,
    onboardingBookingCode: null,
    onboardingPaymentApproved: false,
    hasPendingKycSubmission: false,
    ...overrides,
  };
}

describe('vacating residents remain active until checkout', () => {
  test('1 — normal living resident → Active Residents', () => {
    const r = row();
    assert.equal(matchesResidentListStatusFilter(r, 'active'), true);
    assert.equal(isResidentActiveLiving(r), true);
    assert.equal(deriveResidentLifecycleBadge(r).label, 'Living');
  });

  test('2 — future move-out request → still Active Residents', () => {
    const r = row({
      tenancyStatus: 'vacating',
      vacatingDate: '2026-09-10',
      vacatingStatus: 'pending',
    });
    assert.equal(matchesResidentListStatusFilter(r, 'active'), true);
    assert.equal(matchesResidentListStatusFilter(r, 'vacating'), true);
    assert.equal(isResidentActiveLiving(r), true);
  });

  test('3 — vacating resident displays scheduled move-out date', () => {
    const r = row({
      tenancyStatus: 'vacating',
      vacatingDate: '2026-09-10',
      vacatingStatus: 'approved',
    });
    assert.equal(deriveResidentLifecycleBadge(r).label, 'Vacating');
    assert.equal(r.vacatingDate, '2026-09-10');
    assert.equal(r.roomNumber, '204');
    assert.equal(r.bedCode, 'B1');
  });

  test('4 — remains on current room/bed until move-out boundary', () => {
    const r = row({
      tenancyStatus: 'vacating',
      vacatingDate: '2026-09-10',
      roomNumber: '204',
      bedCode: 'B1',
      bedId: 'bed-b1',
      bookingId: 'bk-1',
    });
    assert.equal(isResidentBedAssigned(r), true);
    assert.equal(isResidentActiveLiving(r), true);
  });

  test('5 — move-out day still active/occupied', () => {
    const r = row({
      tenancyStatus: 'vacating',
      vacatingDate: '2026-09-10',
      isLivingToday: true,
    });
    assert.equal(isResidentActiveLiving(r), true);
  });

  test('6 — after checkout completion → not Active Residents', () => {
    const former = row({
      tenancyStatus: 'vacated',
      bedId: null,
      bookingId: null,
      roomNumber: null,
      bedCode: null,
      isLivingToday: false,
      vacatingDate: null,
    });
    assert.equal(matchesResidentListStatusFilter(former, 'active'), false);
    assert.equal(isResidentActiveLiving(former), false);
    assert.equal(
      deriveTenancyStatus({
        residencyStatus: 'vacated',
        activeTenancy: null,
        hasCompletedTenancy: true,
      }),
      'vacated',
    );
  });

  test('7 — cancelled move-out returns to normal Living', () => {
    const r = row({ tenancyStatus: 'active', vacatingDate: null, vacatingStatus: null });
    assert.equal(deriveResidentLifecycleBadge(r).label, 'Living');
    assert.equal(matchesResidentListStatusFilter(r, 'active'), true);
    assert.equal(matchesResidentListStatusFilter(r, 'vacating'), false);
  });

  test('8 — vacating still counts as assigned for billing/occupancy projection', () => {
    const r = row({ tenancyStatus: 'vacating', vacatingDate: '2026-09-10' });
    assert.equal(isResidentBedAssigned(r), true);
    assert.equal(
      deriveTenancyStatus({
        residencyStatus: 'active',
        activeTenancy: { bookingId: 'bk-1', isVacating: true },
      }),
      'vacating',
    );
  });

  test('9 — active filter includes vacating; vacating filter is narrower', () => {
    const residents = [
      row({ id: 'living', fullName: 'Living One' }),
      row({
        id: 'vacating',
        fullName: 'Vacating Two',
        tenancyStatus: 'vacating',
        vacatingDate: '2026-09-10',
      }),
    ];
    const active = filterResidentsForAdminList(residents, { statusFilter: 'active' });
    assert.equal(active.length, 2);
    const vacatingOnly = filterResidentsForAdminList(residents, { statusFilter: 'vacating' });
    assert.equal(vacatingOnly.length, 1);
    assert.equal(vacatingOnly[0]?.id, 'vacating');
  });

  test('10 — no resident-specific booking-code logic in presentation layer', () => {
    const src = filterResidentsForAdminList.toString();
    assert.doesNotMatch(src, /APG-2026/);
  });
});
