import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isActivePortalVacatingStatus,
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

  const approvedStart = dateChangeActions.indexOf('export async function cancelApprovedVacatingAction');
  const pendingStart = dateChangeActions.indexOf('export async function cancelPendingVacatingAction');
  assert.match(
    dateChangeActions.slice(approvedStart, pendingStart),
    /revalidateVacatingLifecycleForBooking/,
  );
  assert.match(dateChangeActions.slice(pendingStart), /revalidateVacatingLifecycleForBooking/);
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
  assert.equal(resolveActivePortalVacating({ ok: true, data: null }), null);
  assert.equal(resolveActivePortalVacating({ ok: false }), null);
});

test('b) requests tab loader uses active-only portal vacating resolver', () => {
  const fnStart = requestsTabData.indexOf('export async function loadResidentRequestsTabData');
  assert.ok(fnStart >= 0);
  const fnBody = requestsTabData.slice(fnStart, fnStart + 1200);
  assert.match(fnBody, /resolveActivePortalVacating\(primaryBooking\.vacating\)/);
});

test('c) RequestsHome clears stale move-out accordion state after cancellation', () => {
  assert.match(requestsHome, /useEffect\(/);
  assert.match(requestsHome, /activeVacatingId/);
  assert.match(requestsHome, /setMoveOutStage\('closed'\)/);
  assert.match(requestsHome, /hadActiveVacating && activeVacatingId == null/);
  assert.match(requestsHome, /selectedRequestId\?\.startsWith\('vacating-'\)/);
});

test('d) customer cancel service remains idempotent and generic', () => {
  const pendingCancel = vacatingService.slice(
    vacatingService.indexOf('export async function cancelVacatingRequestByCustomer'),
    vacatingService.indexOf('/** Resident withdraws an approved move-out'),
  );
  assert.match(pendingCancel, /current\.status !== 'pending'/);
  assert.match(pendingCancel, /await db\.delete\(vacatingRequests\)/);
  assert.doesNotMatch(pendingCancel, /bookingId === input\.bookingId && input\.customerId/);

  const approvedCancel = vacatingService.slice(
    vacatingService.indexOf('export async function cancelApprovedVacatingByCustomer'),
    vacatingService.indexOf('export async function finalizeVacatingOccupancy'),
  );
  assert.match(approvedCancel, /current\.status !== 'approved'/);
  assert.match(approvedCancel, /await db\.delete\(vacatingRequests\)/);
});
