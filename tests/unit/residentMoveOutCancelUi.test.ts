import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isActivePortalVacatingStatus,
  normalizePortalDateOnly,
  resolveActivePortalVacating,
} from '@/src/lib/residents/residentPortalVacating';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';

const dateChangeActions = readFileSync(
  join(process.cwd(), 'app/(customer)/account/resident/vacating-date-change-actions.ts'),
  'utf8',
);
const requestsHome = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/requests/RequestsHome.tsx'),
  'utf8',
);
const vacatingHome = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/vacating/VacatingHome.tsx'),
  'utf8',
);
const cancelCard = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/vacating/ResidentCancelMoveOutCard.tsx'),
  'utf8',
);
const vacatingRequestForm = readFileSync(
  join(process.cwd(), 'src/components/customer/VacatingRequestForm.tsx'),
  'utf8',
);
const requestsTabData = readFileSync(
  join(process.cwd(), 'src/services/residentPortalTabData.ts'),
  'utf8',
);
const vacatingService = readFileSync(join(process.cwd(), 'src/services/vacating.ts'), 'utf8');

function vacatingRow(
  status: VacatingForBookingRow['status'],
  overrides: Partial<VacatingForBookingRow> = {},
): VacatingForBookingRow {
  return {
    id: 'vr-1',
    bookingId: 'bk-1',
    noticeGivenDate: '2026-09-01',
    vacatingDate: '2026-09-15',
    originalNoticeSubmittedAt: null,
    noticeCompliant: true,
    deductionPaise: 0,
    depositRefundPaise: 0,
    monthlyRentPaiseSnapshot: 412_080,
    noticeRentCoveredDays: 5,
    noticeChargeableDays: 0,
    status,
    notes: null,
    resolvedAt: status === 'completed' || status === 'rejected' ? new Date('2026-09-02') : null,
    createdAt: new Date('2026-09-01'),
    ...overrides,
  };
}

test('a) resident move-out cancellation actions revalidate My Stay views', () => {
  for (const fn of [
    'cancelVacatingDateChangeRequestAction',
    'cancelApprovedVacatingAction',
    'cancelPendingVacatingAction',
  ]) {
    const start = dateChangeActions.indexOf(`export async function ${fn}`);
    assert.ok(start >= 0, `${fn} missing`);
    const nextExport = dateChangeActions.indexOf('export async function ', start + 1);
    const body = dateChangeActions.slice(start, nextExport === -1 ? undefined : nextExport);
    assert.match(body, /revalidateResidentMoveOutCustomerViews\(\)/, `${fn} must revalidate resident views`);
  }
});

test('b) resolveActivePortalVacating exposes only pending/approved rows', () => {
  assert.equal(isActivePortalVacatingStatus('pending'), true);
  assert.equal(isActivePortalVacatingStatus('approved'), true);
  assert.equal(isActivePortalVacatingStatus('completed'), false);
  assert.equal(isActivePortalVacatingStatus('rejected'), false);

  assert.deepEqual(
    resolveActivePortalVacating({ ok: true, data: vacatingRow('pending') })?.status,
    'pending',
  );
  assert.deepEqual(
    resolveActivePortalVacating({ ok: true, data: vacatingRow('approved') })?.status,
    'approved',
  );
  assert.equal(resolveActivePortalVacating({ ok: true, data: vacatingRow('completed') }), null);
  assert.equal(resolveActivePortalVacating({ ok: true, data: vacatingRow('rejected') }), null);
});

test('b) requests tab loader uses active-only portal vacating resolver', () => {
  const fnStart = requestsTabData.indexOf('export async function loadResidentRequestsTabData');
  assert.ok(fnStart >= 0);
  const fnBody = requestsTabData.slice(fnStart, fnStart + 1200);
  assert.match(fnBody, /resolveActivePortalVacating\(primaryBooking\.vacating\)/);
});

test('c) cancel success resets move-out accordion before refresh', () => {
  assert.match(cancelCard, /onCancelled\?\.\(\)/);
  assert.match(cancelCard, /onCancelled\?\.\(\);\s*\n\s*router\.refresh\(\)/);
  assert.match(requestsHome, /resetMoveOutAccordion/);
  assert.match(requestsHome, /onMoveOutCancelled=\{resetMoveOutAccordion\}/);
  assert.match(requestsHome, /vacatingHomeProps\(props, moveOutActive\)/);
  assert.match(requestsHome, /includeMoveOutSettlement \? props\.estimatedSettlement : null/);
});

test('c) RequestsHome keeps backup reset when active vacating prop disappears', () => {
  assert.match(requestsHome, /hadActiveVacating && activeVacatingId == null/);
  assert.match(requestsHome, /resetMoveOutAccordion\(\)/);
});

test('c) VacatingHome only renders settlement story for active move-out requests', () => {
  assert.match(vacatingHome, /resolvedWaterfall && activeMoveOutRequest/);
});

test('c) move-out date picker receives normalized YYYY-MM-DD only', () => {
  assert.equal(normalizePortalDateOnly('2026-09-15T00:00:00.000Z'), '2026-09-15');
  assert.equal(normalizePortalDateOnly('2026-09-15'), '2026-09-15');
  assert.equal(normalizePortalDateOnly(null), null);
  assert.match(vacatingRequestForm, /normalizePortalDateOnly\(expectedCheckoutDate\)/);
});

test('d) approved customer cancel cleans up checkout settlement and preserves terminal history', () => {
  const approvedCancel = vacatingService.slice(
    vacatingService.indexOf('export async function cancelApprovedVacatingByCustomer'),
    vacatingService.indexOf('export async function finalizeVacatingOccupancy'),
  );
  assert.match(approvedCancel, /cleanupCheckoutSettlementForVacating/);
  assert.match(approvedCancel, /deactivateResidentExitBrain\(current\.bookingId\)/);
  assert.match(approvedCancel, /status: 'rejected'/);
  assert.doesNotMatch(approvedCancel, /await db\.delete\(vacatingRequests\)/);
});

test('d) customer cancel service remains idempotent and generic', () => {
  const pendingCancel = vacatingService.slice(
    vacatingService.indexOf('export async function cancelVacatingRequestByCustomer'),
    vacatingService.indexOf('/** Resident withdraws an approved move-out'),
  );
  assert.match(pendingCancel, /current\.status !== 'pending'/);
  assert.match(pendingCancel, /cleanupCheckoutSettlementForVacating/);
});
