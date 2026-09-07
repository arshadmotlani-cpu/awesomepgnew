/**
 * Rent late-fee BASE — monthly room rent, never prorated invoice principal.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveRentLateFeeBasePaise } from '@/src/lib/billing/rentLateFeeBase';
import { chargeableLateFeeDaysFromIssue } from '@/src/lib/billing/lateFeeSchedule';
import { computeLateFee } from '@/src/services/billing';
import { buildRentInvoiceBreakdownFromContext } from '@/src/lib/billing/rentInvoiceBreakdown';
import { projectInvoice, rentInvoiceIssueDate } from '@/src/services/rentInvoices';
import type { RentInvoice } from '@/src/db/schema';

const MONTHLY_RENT_PAISE = 721_140; // ₹7,211.40
const PRORATED_RENT_PAISE = 264_418; // ₹2,644.18
const GENERATED_AT = new Date('2026-08-31T18:31:55.781Z');
const ISSUE_IST = '2026-09-01';
const FIRST_LATE_DAY = '2026-09-06';

test('resolveRentLateFeeBasePaise prefers monthly room rent over prorated principal', () => {
  assert.equal(
    resolveRentLateFeeBasePaise({
      monthlyRoomRentPaise: MONTHLY_RENT_PAISE,
      invoiceRentPaise: PRORATED_RENT_PAISE,
    }),
    MONTHLY_RENT_PAISE,
  );
  assert.equal(
    resolveRentLateFeeBasePaise({ monthlyRoomRentPaise: 0, invoiceRentPaise: PRORATED_RENT_PAISE }),
    PRORATED_RENT_PAISE,
  );
});

test('1% late fee on full monthly rent is ₹72.11, not ₹26.44', () => {
  const lateFee = computeLateFee({
    rentPaise: MONTHLY_RENT_PAISE,
    issueDate: ISSUE_IST,
    today: FIRST_LATE_DAY,
  });
  assert.equal(lateFee, 7_211);
  assert.notEqual(lateFee, 2_644);
  assert.equal(
    computeLateFee({
      rentPaise: PRORATED_RENT_PAISE,
      issueDate: ISSUE_IST,
      today: FIRST_LATE_DAY,
    }),
    2_644,
  );
});

test('5-day grace unchanged: Sep 1–5 are 0%, Sep 6 is 1%', () => {
  for (const day of ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']) {
    assert.equal(chargeableLateFeeDaysFromIssue(ISSUE_IST, day), 0, day);
  }
  assert.equal(chargeableLateFeeDaysFromIssue(ISSUE_IST, FIRST_LATE_DAY), 1);
  assert.equal(chargeableLateFeeDaysFromIssue(ISSUE_IST, '2026-09-07'), 2);
});

function stubInvoice(
  over: Partial<RentInvoice> & Pick<RentInvoice, 'rentPaise' | 'status' | 'createdAt'>,
): RentInvoice {
  return {
    id: 'inv-1',
    invoiceNumber: 'RNT-2026-09-0009',
    bookingId: 'bk-1',
    customerId: 'c-1',
    bedId: 'bed-1',
    pgId: 'pg-1',
    billingMonth: '2026-09-01',
    dueDate: '2026-09-05',
    lateFeeBasePaise: MONTHLY_RENT_PAISE,
    discountPaise: 0,
    promoCode: null,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: null,
    paymentProofUrl: null,
    paymentProofTransactionRef: null,
    possibleDuplicate: false,
    duplicateOfIds: [],
    proofSubmittedAt: null,
    proofSnapshotOutstandingPaise: null,
    proofSnapshotLateFeePaise: null,
    proofSnapshotPrincipalDuePaise: null,
    paymentId: null,
    paidAt: null,
    cancelledAt: null,
    cancellationReason: null,
    notes: 'Billing period: 1 Sept 2026 -> 11 Sept 2026 (move-out proration)',
    isAdhoc: false,
    invoiceSubtype: 'standard',
    updatedAt: new Date('2026-09-06T17:00:00Z'),
    ...over,
  } as RentInvoice;
}

test('move-out prorated invoice uses stored monthly rent as late-fee base', () => {
  const invoice = stubInvoice({
    rentPaise: PRORATED_RENT_PAISE,
    status: 'overdue',
    createdAt: GENERATED_AT,
    lateFeeBasePaise: MONTHLY_RENT_PAISE,
  });
  const view = projectInvoice(invoice, FIRST_LATE_DAY);
  assert.equal(view.accruedLateFeePaise, 7_211);
  assert.equal(view.outstandingPaise, PRORATED_RENT_PAISE + 7_211);
  assert.notEqual(view.accruedLateFeePaise, 2_644);
});

test('projectInvoice without stored base still accepts monthly override from breakdown context', () => {
  const invoice = stubInvoice({
    rentPaise: PRORATED_RENT_PAISE,
    status: 'overdue',
    createdAt: GENERATED_AT,
    lateFeeBasePaise: 0,
  });
  const withOverride = projectInvoice(invoice, FIRST_LATE_DAY, {
    lateFeeBasePaise: MONTHLY_RENT_PAISE,
  });
  assert.equal(withOverride.accruedLateFeePaise, 7_211);

  const withoutOverride = projectInvoice(invoice, FIRST_LATE_DAY);
  assert.equal(withoutOverride.accruedLateFeePaise, 2_644);
});

test('buildRentInvoiceBreakdownFromContext passes monthly rent into projection', () => {
  const invoice = stubInvoice({
    rentPaise: PRORATED_RENT_PAISE,
    status: 'overdue',
    createdAt: GENERATED_AT,
    lateFeeBasePaise: MONTHLY_RENT_PAISE,
  });
  const breakdown = buildRentInvoiceBreakdownFromContext({
    invoice,
    roomNumber: '201',
    bedCode: 'B1',
    monthlyRentPaise: MONTHLY_RENT_PAISE,
    rentPricingSource: 'bed_price',
    isPrivateRoom: false,
    financialBreakdown: null,
    proration: null,
    asOf: FIRST_LATE_DAY,
  });
  assert.equal(breakdown.lateFeePaise, 7_211);
  assert.equal(breakdown.finalRentPaise, PRORATED_RENT_PAISE);
});

test('paid invoice keeps locked late fee — base change does not rewrite history', () => {
  const invoice = stubInvoice({
    rentPaise: PRORATED_RENT_PAISE,
    status: 'paid',
    createdAt: GENERATED_AT,
    lateFeeBasePaise: MONTHLY_RENT_PAISE,
    paidPrincipalPaise: PRORATED_RENT_PAISE,
    paidLateFeePaise: 2_644,
    lateFeeLockedPaise: 2_644,
    paidAt: new Date('2026-09-06T17:17:08.851Z'),
  });
  const view = projectInvoice(invoice, FIRST_LATE_DAY);
  assert.equal(view.accruedLateFeePaise, 2_644);
  assert.equal(view.outstandingPaise, 0);
});

test('rentInvoiceIssueDate still uses IST for midnight generation', () => {
  const invoice = stubInvoice({
    rentPaise: PRORATED_RENT_PAISE,
    status: 'pending',
    createdAt: GENERATED_AT,
  });
  assert.equal(rentInvoiceIssueDate(invoice), ISSUE_IST);
});

test('all rent surfaces route late fee through projectInvoice', () => {
  const billRows = readFileSync(
    join(process.cwd(), 'src/lib/residents/residentPortalBillRows.ts'),
    'utf8',
  );
  const breakdown = readFileSync(
    join(process.cwd(), 'src/lib/billing/rentInvoiceBreakdown.ts'),
    'utf8',
  );
  assert.match(billRows, /projectInvoice\(/);
  assert.doesNotMatch(billRows, /computeLateFee\(/);
  assert.match(breakdown, /lateFeeBasePaise: input\.monthlyRentPaise/);
});
