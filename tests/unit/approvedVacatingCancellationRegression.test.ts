import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  isActivePortalVacatingStatus,
  resolveActivePortalVacating,
} from '@/src/lib/residents/residentPortalVacating';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';

const vacatingService = readFileSync(join(process.cwd(), 'src/services/vacating.ts'), 'utf8');
const residentFinancialEngine = readFileSync(
  join(process.cwd(), 'src/services/residentFinancialEngine.ts'),
  'utf8',
);
const rentInvoices = readFileSync(join(process.cwd(), 'src/services/rentInvoices.ts'), 'utf8');

function approvedCancelBody() {
  const start = vacatingService.indexOf('export async function cancelApprovedVacatingByCustomer');
  const end = vacatingService.indexOf('export async function finalizeVacatingOccupancy');
  assert.ok(start >= 0, 'cancelApprovedVacatingByCustomer missing');
  return vacatingService.slice(start, end);
}

function pendingCancelBody() {
  const start = vacatingService.indexOf('export async function cancelVacatingRequestByCustomer');
  const end = vacatingService.indexOf('/** Resident withdraws an approved move-out');
  return vacatingService.slice(start, end);
}

function adminWithdrawBody() {
  const start = vacatingService.indexOf('export async function adminWithdrawVacatingRequest');
  const end = vacatingService.indexOf('/** Undo an approval');
  return vacatingService.slice(start, end);
}

function rejectedVacatingRow(
  overrides: Partial<VacatingForBookingRow> = {},
): VacatingForBookingRow {
  return {
    id: 'vr-approved-cancelled',
    bookingId: 'bk-1',
    noticeGivenDate: '2026-09-01',
    vacatingDate: '2026-09-11',
    originalNoticeSubmittedAt: null,
    noticeCompliant: true,
    deductionPaise: 0,
    depositRefundPaise: 0,
    monthlyRentPaiseSnapshot: 412_080,
    noticeRentCoveredDays: 5,
    noticeChargeableDays: 0,
    status: 'rejected',
    notes: 'You withdrew your move-out request. Your stay continues as before.',
    resolvedAt: new Date('2026-09-09'),
    createdAt: new Date('2026-09-01'),
    ...overrides,
  };
}

test('approved customer cancel preserves vacating row as rejected terminal history', () => {
  const body = approvedCancelBody();
  assert.doesNotMatch(body, /db\.delete\(vacatingRequests\)/);
  assert.match(body, /status: 'rejected'/);
  assert.match(body, /deactivateResidentExitBrain\(current\.bookingId\)/);
  assert.match(body, /revertScheduledTransfersOnVacatingCancel/);
});

test('approved customer cancel deactivates Exit Brain before marking terminal status', () => {
  const body = approvedCancelBody();
  const deactivateAt = body.indexOf('deactivateResidentExitBrain(current.bookingId)');
  const rejectAt = body.indexOf("status: 'rejected'");
  assert.ok(deactivateAt >= 0 && rejectAt >= 0);
  assert.ok(deactivateAt < rejectAt, 'Exit Brain must deactivate before terminal status update');
});

test('approved customer cancel does not swallow rent restoration failures', () => {
  const restoreHelper = vacatingService.slice(
    vacatingService.indexOf('async function restoreCheckoutRentAfterVacatingCancel'),
    vacatingService.indexOf('// ───────────────────────────────────────────────────────────────────────────\n// Public types'),
  );
  assert.doesNotMatch(restoreHelper, /catch \(err\)/);
  assert.match(approvedCancelBody(), /await restoreCheckoutRentAfterVacatingCancel\(/);
});

test('vacating restore billing does not pass system string as audit actor id', () => {
  assert.doesNotMatch(residentFinancialEngine, /adminId: args\.adminId \?\? 'system'/);
  assert.match(rentInvoices, /actorType: args\.adminId \? 'admin' : 'system'/);
  assert.match(rentInvoices, /actorId: args\.adminId \?\? null/);
});

test('rejected historical vacating is not treated as primaryVacating', () => {
  assert.equal(isActivePortalVacatingStatus('rejected'), false);
  assert.equal(
    resolveActivePortalVacating({
      ok: true,
      data: rejectedVacatingRow(),
    }),
    null,
  );
});

test('approved admin withdraw preserves approved rows referenced by Exit Brain', () => {
  const body = adminWithdrawBody();
  assert.match(body, /if \(current\.status === 'approved'\)/);
  assert.match(body, /deactivateResidentExitBrain\(current\.bookingId\)/);
  assert.match(body, /status: 'rejected'/);
});

test('pending customer cancel still deletes pending rows without Exit Brain', () => {
  const body = pendingCancelBody();
  assert.match(body, /db\.delete\(vacatingRequests\)/);
  assert.doesNotMatch(body, /deactivateResidentExitBrain/);
});

test('repeat approved cancel remains guarded by wrong_status', () => {
  const body = approvedCancelBody();
  assert.match(body, /current\.status !== 'approved'/);
  assert.match(body, /kind: 'wrong_status'/);
});
