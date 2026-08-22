import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { diffDays, formatDate, parseDate } from '../../src/lib/dates';
import { buildVacatingApprovalPreview } from '../../src/lib/vacating/approvalPreview';
import {
  moveOutUnusedRentCreditReason,
  moveOutUnusedRentPayoutDebitReason,
  isMoveOutUnusedRentLedgerReason,
} from '../../src/services/residentCreditLedger';
import { isNoticeCompliant, VACATING_NOTICE_MIN_DAYS } from '../../src/services/billing';
import { REQUEST_CATEGORIES } from '../../src/lib/residents/requestCenter';
import { resolveNoticeGivenDateForVacating } from '../../src/lib/vacating/noticeDateSsot';

test('notice compliance uses original request date not later processing date', () => {
  const noticeGivenDate = '2026-08-20';
  const vacatingDate = '2026-08-24';
  const processingDate = '2026-08-21';

  assert.equal(VACATING_NOTICE_MIN_DAYS, 5);
  assert.equal(diffDays(noticeGivenDate, vacatingDate), 4);
  assert.equal(isNoticeCompliant({ noticeGivenDate, vacatingDate }), false);
  assert.equal(isNoticeCompliant({ noticeGivenDate: processingDate, vacatingDate }), false);

  const sundayVacate = '2026-08-24';
  const longerNotice = '2026-08-18';
  assert.ok(isNoticeCompliant({ noticeGivenDate: longerNotice, vacatingDate: sundayVacate }));
});

test('buildVacatingApprovalPreview separates notice calculation from processing date', () => {
  const preview = buildVacatingApprovalPreview(
    {
      id: 'vr-angatra',
      bookingId: 'bk-1',
      bookingCode: 'APG-2026-0013',
      customerId: 'c-1',
      customerFullName: 'Angatra Mandal',
      customerPhone: '+917074754939',
      pgId: 'pg-1',
      pgName: 'Shanti Nagar',
      bedCode: 'B3',
      roomNumber: '202',
      noticeGivenDate: '2026-08-20',
      vacatingDate: '2026-08-24',
      originalNoticeSubmittedAt: new Date('2026-08-20T14:30:00.000Z'),
      noticeCompliant: false,
      deductionPaise: 0,
      depositRefundPaise: 0,
      monthlyRentPaiseSnapshot: 459000,
      noticeRentCoveredDays: 0,
      noticeChargeableDays: 0,
      durationMode: 'open_ended',
      stayType: 'monthly_stay',
      status: 'pending',
      resolvedAt: null,
      createdAt: new Date('2026-08-20T14:30:00.000Z'),
      updatedAt: new Date('2026-08-21T09:00:00.000Z'),
    },
    450000,
  );

  assert.equal(preview.noticeCalculationDate, '2026-08-20');
  assert.equal(preview.processingDate, '2026-08-21');
  assert.notEqual(preview.processingDate, preview.noticeCalculationDate);
  assert.ok(preview.noticeSubmittedAt?.includes('2026-08-20'));
});

test('submit timestamp maps to same calendar notice date', () => {
  const submittedAt = new Date('2026-08-20T23:45:00.000Z');
  const noticeGivenDate = formatDate(parseDate(submittedAt));
  assert.equal(noticeGivenDate, '2026-08-20');
});

test('move-out unused rent ledger reason markers are stable for idempotency', () => {
  const vacatingId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const settlementId = 'settle-123';
  const creditReason = moveOutUnusedRentCreditReason(vacatingId);
  const payoutReason = moveOutUnusedRentPayoutDebitReason(settlementId);

  assert.equal(creditReason, `move_out_unused_rent:${vacatingId}`);
  assert.equal(payoutReason, `move_out_unused_rent_payout:${settlementId}`);
  assert.ok(isMoveOutUnusedRentLedgerReason(creditReason));
  assert.ok(!isMoveOutUnusedRentLedgerReason(payoutReason));
});

test('resolveNoticeGivenDateForVacating uses originalNoticeSubmittedAt not admin-open date', () => {
  const submittedAt = new Date('2026-08-20T12:07:01.204Z');
  const adminOpenedLater = '2026-08-22';

  assert.equal(
    resolveNoticeGivenDateForVacating({
      noticeGivenDate: adminOpenedLater,
      originalNoticeSubmittedAt: submittedAt,
    }),
    '2026-08-20',
  );
});

test('notice date unchanged when request reopened several days later', () => {
  const submittedAt = new Date('2026-08-20T12:07:01.204Z');
  for (const adminViewDate of ['2026-08-21', '2026-08-22', '2026-08-25']) {
    assert.equal(
      resolveNoticeGivenDateForVacating({
        noticeGivenDate: adminViewDate,
        originalNoticeSubmittedAt: submittedAt,
      }),
      '2026-08-20',
    );
  }
});

test('requested vacating date is independent from notice submission date', () => {
  const noticeGivenDate = '2026-08-20';
  const vacatingDate = '2026-08-23';
  assert.equal(diffDays(noticeGivenDate, vacatingDate), 3);
  assert.notEqual(noticeGivenDate, vacatingDate);
});

test('direct move-out flow renders date form inline on requests page', () => {
  const requestsHome = readFileSync(
    join(process.cwd(), 'src/components/customer/account/resident/requests/RequestsHome.tsx'),
    'utf8',
  );
  assert.match(requestsHome, /id="resident-move-out"/);
  assert.match(requestsHome, /VacatingHome/);
  assert.doesNotMatch(requestsHome, /Request move-out/);
  assert.match(requestsHome, /Other requests/);
});

test('resident and admin settlement use shared vacating billing presentation SSOT', () => {
  const approvalPreview = readFileSync(
    join(process.cwd(), 'src/lib/vacating/approvalPreview.ts'),
    'utf8',
  );
  const residentPortal = readFileSync(
    join(process.cwd(), 'src/services/residentPortalTabData.ts'),
    'utf8',
  );
  assert.match(approvalPreview, /loadVacatingBillingPresentationBundle/);
  assert.match(approvalPreview, /resolveNoticeGivenDateForVacating/);
  assert.match(residentPortal, /loadVacatingBillingPresentationBundle/);
  assert.match(residentPortal, /resolveNoticeGivenDateForVacating/);
});

test('wallet sync skips zero unused rent without posting duplicate credit', () => {
  const ledger = readFileSync(
    join(process.cwd(), 'src/services/residentCreditLedger.ts'),
    'utf8',
  );
  assert.match(ledger, /syncMoveOutUnusedRentWalletCredit/);
  assert.match(ledger, /hasResidentCreditEntryWithReasonPrefix/);
  assert.match(ledger, /creditedPaise: 0/);
});

test('request center demotes all categories — move-out is inline on requests page', () => {
  const moveOut = REQUEST_CATEGORIES.find((c) => c.id === 'move_out');
  const maintenance = REQUEST_CATEGORIES.find((c) => c.id === 'maintenance');
  const roomChange = REQUEST_CATEGORIES.find((c) => c.id === 'room_change');
  const complaint = REQUEST_CATEGORIES.find((c) => c.id === 'complaint');
  const support = REQUEST_CATEGORIES.find((c) => c.id === 'support');

  assert.equal(moveOut?.primaryVisible, false);
  assert.equal(roomChange?.primaryVisible, false);
  assert.equal(maintenance?.primaryVisible, false);
  assert.equal(complaint?.primaryVisible, false);
  assert.equal(support?.primaryVisible, false);
});
