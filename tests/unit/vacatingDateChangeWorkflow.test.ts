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
  assert.match(vacatingHome, /ChangeLeavingDateForm/);
  assert.match(vacatingHome, /showV2Estimate/);
  assert.match(residentAreaSection, /loadEstimatedSettlementForVacating/);
  assert.match(residentAreaSection, /getPendingVacatingDateChangeForBooking/);
  assert.match(requestsHome, /estimatedSettlement=/);
  assert.match(requestsHome, /pendingDateChangeRequestId=/);
});

test('admin booking financial workspace shows date-change approval panel', () => {
  assert.match(bookingFinancialWorkspace, /VacatingDateChangeApprovalPanel/);
  assert.match(bookingFinancialWorkspace, /data\.pendingDateChange/);
});
