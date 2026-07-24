import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { isNoticeCompliant, VACATING_NOTICE_MIN_DAYS } from '../../src/services/billing';

const vacatingService = readFileSync(
  join(process.cwd(), 'src/services/vacating.ts'),
  'utf8',
);
const checkoutSettlement = readFileSync(
  join(process.cwd(), 'src/services/checkoutSettlement.ts'),
  'utf8',
);
const vacatingHome = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/vacating/VacatingHome.tsx'),
  'utf8',
);
const residentAreaSection = readFileSync(
  join(process.cwd(), 'src/components/customer/account/ResidentAreaSection.tsx'),
  'utf8',
);
const requestsHome = readFileSync(
  join(process.cwd(), 'src/components/customer/account/resident/requests/RequestsHome.tsx'),
  'utf8',
);
const bookingFinancialWorkspace = readFileSync(
  join(process.cwd(), 'src/components/admin/bookings/BookingFinancialWorkspace.tsx'),
  'utf8',
);

test('approveVacatingRequest does not create checkout settlement at approval time', () => {
  const fnStart = vacatingService.indexOf('export async function approveVacatingRequest');
  assert.ok(fnStart >= 0);
  const fnEnd = vacatingService.indexOf('export async function rejectVacatingRequest', fnStart);
  const body = vacatingService.slice(fnStart, fnEnd);
  assert.doesNotMatch(body, /createCheckoutSettlementFromVacating/);
  assert.doesNotMatch(body, /lockApprovalBaseline/);
});

test('ensureCheckoutSettlementForBooking locks approval baseline at refund submit', () => {
  const fnStart = checkoutSettlement.indexOf('export async function ensureCheckoutSettlementForBooking');
  assert.ok(fnStart >= 0);
  const fnEnd = checkoutSettlement.indexOf('export async function updateCheckoutElectricitySettlement', fnStart);
  const body = checkoutSettlement.slice(fnStart, fnEnd);
  assert.match(body, /lockApprovalBaseline:\s*true/);
});

test('date change compliance uses fixed noticeGivenDate with 14-day minimum', () => {
  const noticeGivenDate = '2026-06-01';
  const earliestCompliant = '2026-06-15';

  assert.equal(VACATING_NOTICE_MIN_DAYS, 14);
  assert.equal(
    isNoticeCompliant({ noticeGivenDate, vacatingDate: earliestCompliant }),
    true,
  );
  assert.equal(
    isNoticeCompliant({ noticeGivenDate, vacatingDate: '2026-06-14' }),
    false,
  );
  assert.equal(
    isNoticeCompliant({ noticeGivenDate, vacatingDate: '2026-07-01' }),
    true,
  );
});

test('resident move-out UI wires V2 estimate and change-leaving-date flow', () => {
  assert.match(vacatingHome, /ResidentEstimatedSettlementBreakdown/);
  assert.match(vacatingHome, /settlementContext/);
  assert.match(vacatingHome, /ChangeLeavingDateForm/);
  assert.match(vacatingHome, /showV2Estimate/);
  assert.match(residentAreaSection, /loadEstimatedSettlementForVacating/);
  assert.match(residentAreaSection, /primarySettlementContext/);
  assert.match(residentAreaSection, /getPendingVacatingDateChangeForBooking/);
  assert.match(requestsHome, /estimatedSettlement=/);
  assert.match(requestsHome, /settlementContext=/);
  assert.match(requestsHome, /pendingDateChangeRequestId=/);
});

test('VacatingHome hides V1 hero estimate when V2 estimated settlement is shown', () => {
  assert.match(vacatingHome, /showEstimateStats[\s\S]*!showV2Estimate/);
  assert.match(vacatingHome, /v2RefundEstimate/);
});

test('booking financial workspace wires settlement statement document', () => {
  assert.match(bookingFinancialWorkspace, /SettlementStatementDocument/);
  assert.match(bookingFinancialWorkspace, /surface="adminPage"/);
  assert.match(bookingFinancialWorkspace, /settlementStatementPageHref/);
  assert.match(bookingFinancialWorkspace, /VacatingDateChangeApprovalPanel/);
  assert.doesNotMatch(bookingFinancialWorkspace, /EstimatedSettlementBreakdown/);
});

test('approve preview uses light modal surface for settlement statement', () => {
  const approvePreview = readFileSync(
    join(process.cwd(), 'src/components/admin/vacating/ApproveVacatingPreview.tsx'),
    'utf8',
  );
  assert.match(approvePreview, /surface="adminModal"/);
  assert.match(approvePreview, /FinancialDocumentLayout|SettlementStatementDocument/);
});

test('date change panel does not expose paise in UI copy', () => {
  const panel = readFileSync(
    join(process.cwd(), 'src/components/admin/vacating/VacatingDateChangeApprovalPanel.tsx'),
    'utf8',
  );
  assert.doesNotMatch(panel, /refundDeltaPaise\} paise/);
  assert.match(panel, /surface="adminModal"/);
  assert.match(panel, /dateChangeActions/);
  assert.doesNotMatch(panel, /buildSettlementStatementModel/);
});

test('move-out pipeline passes server approval preview with estimated settlement', () => {
  const pipelineQueue = readFileSync(
    join(process.cwd(), 'src/components/admin/moveOut/MoveOutPipelineQueue.tsx'),
    'utf8',
  );
  assert.match(pipelineQueue, /approvalPreviewByRequestId/);
  assert.match(pipelineQueue, /bookingId=\{row\.bookingId\}/);

  const vacatingPage = readFileSync(
    join(process.cwd(), 'app/(admin)/admin/vacating/page.tsx'),
    'utf8',
  );
  assert.match(vacatingPage, /approvalPreviewByRequestId/);
});

test('cancelApprovedVacatingByCustomer blocks when checkout settlement exists', () => {
  assert.match(vacatingService, /kind: 'settlement_started'/);
  assert.match(vacatingService, /checkoutSettlements\.vacatingRequestId, current\.id/);
});
