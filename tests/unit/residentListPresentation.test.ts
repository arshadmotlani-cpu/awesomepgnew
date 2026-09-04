import assert from 'node:assert/strict';
import test from 'node:test';
import { isResidentActiveLiving } from '@/src/lib/residentBedAssignment';
import {
  filterResidentsForAdminList,
  matchesResidentListStatusFilter,
  parseResidentListStatusFilter,
  compareResidentsAlphabetically,
} from '@/src/lib/residents/residentListPresentation';
import type { ResidentListRow } from '@/src/services/residentAdmin';

function row(overrides: Partial<ResidentListRow> = {}): ResidentListRow {
  return {
    id: 'c1',
    fullName: 'Alice',
    email: 'alice@example.com',
    phone: '9000000001',
    gender: 'female',
    kycStatus: 'approved',
    createdAt: new Date('2026-01-01'),
    tenancyStatus: 'active',
    pgId: 'pg-1',
    pgName: 'Shantinagar',
    roomNumber: '101',
    bedCode: 'A1',
    roomId: 'room-1',
    bedId: 'bed-1',
    monthlyRentPaise: 10000,
    bookingId: 'b1',
    bookingCode: 'APG-1',
    moveInDate: '2026-01-15',
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

test('parseResidentListStatusFilter defaults to active', () => {
  assert.equal(parseResidentListStatusFilter(undefined), 'active');
  assert.equal(parseResidentListStatusFilter(''), 'active');
  assert.equal(parseResidentListStatusFilter('bogus'), 'active');
});

test('matchesResidentListStatusFilter active includes vacating still living', () => {
  assert.equal(matchesResidentListStatusFilter(row(), 'active'), true);
  assert.equal(
    matchesResidentListStatusFilter(row({ tenancyStatus: 'vacating', isLivingToday: true }), 'active'),
    true,
  );
  assert.equal(
    matchesResidentListStatusFilter(
      row({ tenancyStatus: 'active', isLivingToday: false, moveInDate: '2026-12-01' }),
      'active',
    ),
    false,
  );
  assert.equal(matchesResidentListStatusFilter(row({ tenancyStatus: 'unassigned', bedId: null }), 'active'), false);
});

test('matchesResidentListStatusFilter vacating uses tenancy SSOT', () => {
  assert.equal(
    matchesResidentListStatusFilter(row({ tenancyStatus: 'vacating' }), 'vacating'),
    true,
  );
  assert.equal(matchesResidentListStatusFilter(row(), 'vacating'), false);
});

test('filterResidentsForAdminList searches within selected filter only', () => {
  const residents = [
    row({ id: 'c1', fullName: 'Alice Active' }),
    row({ id: 'c2', fullName: 'Bob Vacating', tenancyStatus: 'vacating' }),
    row({ id: 'c3', fullName: 'Charlie Active', pgName: 'Koramangala' }),
  ];

  const activeOnly = filterResidentsForAdminList(residents, {
    statusFilter: 'active',
    query: 'Bob',
  });
  assert.equal(activeOnly.length, 1);
  assert.equal(activeOnly[0]?.id, 'c2');

  const vacatingBob = filterResidentsForAdminList(residents, {
    statusFilter: 'vacating',
    query: 'Bob',
  });
  assert.equal(vacatingBob.length, 1);
  assert.equal(vacatingBob[0]?.id, 'c2');
});

test('compareResidentsAlphabetically sorts PG then resident name case-insensitively', () => {
  const a = row({ pgName: 'Alpha PG', fullName: 'Zara' });
  const b = row({ pgName: 'Beta PG', fullName: 'Amy' });
  const c = row({ pgName: 'alpha pg', fullName: 'Aaron' });

  const sorted = [a, b, c].sort(compareResidentsAlphabetically);
  assert.deepEqual(
    sorted.map((r) => `${r.pgName}:${r.fullName}`),
    ['alpha pg:Aaron', 'Alpha PG:Zara', 'Beta PG:Amy'],
  );
});

test('isResidentActiveLiving requires assigned bed and living today (includes vacating)', () => {
  const assigned = { bedId: 'bed-1', bookingId: 'b1' };
  assert.equal(isResidentActiveLiving({ tenancyStatus: 'active', isLivingToday: true, ...assigned }), true);
  assert.equal(isResidentActiveLiving({ tenancyStatus: 'active', isLivingToday: false, ...assigned }), false);
  assert.equal(isResidentActiveLiving({ tenancyStatus: 'vacating', isLivingToday: true, ...assigned }), true);
});
