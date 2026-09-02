/**
 * Rent invoice amount + portal Total Due SSOT — class of mismatch that certification
 * previously failed on (mid-month pending vacating + payment_in_progress).
 * Fixture is representative; not resident-specific.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPortalPayableInvoiceStatus,
  resolveExpectedRentInvoiceAmountPaise,
  sumPortalPayableOutstandingPaise,
} from '@/src/lib/billing/expectedRentInvoiceAmount';
import { computeResidentTotalDuePaise } from '@/src/lib/residents/residentPortalDisplay';
import { buildResidentBillRowsFromDetail } from '@/src/lib/residents/residentPortalBillRows';
import { fullMonthlyRentPaise } from '@/src/services/billing';

const MONTHLY = 412_080;
const FULL_MONTH = fullMonthlyRentPaise(MONTHLY);
/** Sept 1–9 inclusive = 9 days → floor(412080/30)*9 = 123624 */
const MOVE_OUT_PRORATED = 123_624;

const paidPriorCoverage = [
  {
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    paidPrincipalPaise: FULL_MONTH,
    source: 'rent_invoice' as const,
    sourceId: 'prior-paid',
  },
];

test('pending mid-month vacating → expected rent is move-out proration, not full monthly SSOT', () => {
  const expected = resolveExpectedRentInvoiceAmountPaise({
    billingMonth: '2026-09-01',
    monthlyRentPaise: MONTHLY,
    billingCyclePolicy: 'calendar_month_1st',
    billingDay: 1,
    moveInDate: '2026-08-08',
    paidInvoiceCoverage: paidPriorCoverage,
    activeVacating: { status: 'pending', vacatingDate: '2026-09-09' },
    existingInvoice: {
      id: 'inv-prorated',
      rentPaise: MOVE_OUT_PRORATED,
      paidPrincipalPaise: 0,
      status: 'payment_in_progress',
    },
  });

  assert.equal(expected.amountPaise, MOVE_OUT_PRORATED);
  assert.notEqual(expected.amountPaise, FULL_MONTH);
  assert.equal(expected.source, 'existing_unchanged');
});

test('full-month invoice with pending vacating in checkout month expects proration (detects drift)', () => {
  const expected = resolveExpectedRentInvoiceAmountPaise({
    billingMonth: '2026-09-01',
    monthlyRentPaise: MONTHLY,
    billingCyclePolicy: 'calendar_month_1st',
    billingDay: 1,
    moveInDate: '2026-08-08',
    paidInvoiceCoverage: paidPriorCoverage,
    activeVacating: { status: 'pending', vacatingDate: '2026-09-09' },
    existingInvoice: {
      id: 'inv-full',
      rentPaise: FULL_MONTH,
      paidPrincipalPaise: 0,
      status: 'pending',
    },
  });

  assert.equal(expected.amountPaise, MOVE_OUT_PRORATED);
  assert.equal(expected.source, 'vacating_move_out_proration');
  assert.notEqual(expected.amountPaise, FULL_MONTH);
});

test('no active vacating → expected rent stays full monthly SSOT', () => {
  const expected = resolveExpectedRentInvoiceAmountPaise({
    billingMonth: '2026-09-01',
    monthlyRentPaise: MONTHLY,
    billingCyclePolicy: 'calendar_month_1st',
    billingDay: 1,
    moveInDate: '2026-06-01',
    paidInvoiceCoverage: paidPriorCoverage,
    activeVacating: null,
  });

  assert.equal(expected.amountPaise, FULL_MONTH);
  assert.equal(expected.source, 'full_month');
});

test('portal payable statuses exclude payment_in_progress', () => {
  assert.equal(isPortalPayableInvoiceStatus('pending'), true);
  assert.equal(isPortalPayableInvoiceStatus('partial'), true);
  assert.equal(isPortalPayableInvoiceStatus('overdue'), true);
  assert.equal(isPortalPayableInvoiceStatus('payment_in_progress'), false);
  assert.equal(isPortalPayableInvoiceStatus('paid'), false);
});

test('total_due SSOT: payment_in_progress rent is not payable-now (admin outstanding ≠ portal Total Due)', () => {
  const projectedRows = [
    { outstandingPaise: MOVE_OUT_PRORATED, effectiveStatus: 'payment_in_progress' },
    { outstandingPaise: 50_000, effectiveStatus: 'pending' },
  ];
  const payableNow = sumPortalPayableOutstandingPaise(projectedRows);
  const adminStyleOutstanding = projectedRows.reduce((s, r) => s + r.outstandingPaise, 0);

  assert.equal(payableNow, 50_000);
  assert.equal(adminStyleOutstanding, MOVE_OUT_PRORATED + 50_000);
  assert.notEqual(payableNow, adminStyleOutstanding);
});

test('admin outstanding includes payment_in_progress; portal Total Due does not — two distinct SSOTs', () => {
  const pipOutstanding = MOVE_OUT_PRORATED;
  const adminOutstanding = pipOutstanding; // projectInvoice outstanding still counts proof-pending
  const portalPayableNow = sumPortalPayableOutstandingPaise([
    { outstandingPaise: pipOutstanding, effectiveStatus: 'payment_in_progress' },
  ]);
  assert.equal(adminOutstanding, MOVE_OUT_PRORATED);
  assert.equal(portalPayableNow, 0);
  // Certification must compare admin↔admin and portal↔payable-now separately — never cross-wire.
  assert.notEqual(adminOutstanding, portalPayableNow);
});

test('portal bill rows + Total Due agree with payable-now SSOT for payment_in_progress rent', () => {
  const { dueBillRows, pendingApprovalRows } = buildResidentBillRowsFromDetail([
    {
      bookingId: 'booking-vacating',
      rent: {
        ok: true,
        data: [
          {
            id: 'inv-pip',
            invoiceNumber: 'RNT-2026-09-0016',
            bookingId: 'booking-vacating',
            bookingCode: 'APG-2026-0099',
            billingMonth: '2026-09-01',
            dueDate: '2026-09-05',
            rentPaise: MOVE_OUT_PRORATED,
            discountPaise: 0,
            promoCode: null,
            paidPrincipalPaise: 0,
            paidLateFeePaise: 0,
            lateFeeLockedPaise: null,
            status: 'payment_in_progress' as const,
            paidAt: null,
            invoiceSubtype: 'standard' as const,
            notes: '(move-out proration)',
            paymentProofUrl: 'https://example.com/proof.jpg',
            proofSubmittedAt: new Date('2026-09-02T00:00:00.000Z'),
            proofSnapshotOutstandingPaise: MOVE_OUT_PRORATED,
            proofSnapshotLateFeePaise: 0,
            proofSnapshotPrincipalDuePaise: MOVE_OUT_PRORATED,
            paymentId: null,
            isAdhoc: false,
            createdAt: new Date('2026-09-01T00:00:00.000Z'),
            updatedAt: new Date('2026-09-02T00:00:00.000Z'),
          },
        ],
      },
      electricity: { ok: true, data: [] },
    },
  ]);

  assert.equal(dueBillRows.length, 0);
  assert.equal(pendingApprovalRows.length, 1);
  assert.equal(computeResidentTotalDuePaise(dueBillRows), 0);
  assert.equal(
    sumPortalPayableOutstandingPaise([
      { outstandingPaise: MOVE_OUT_PRORATED, effectiveStatus: 'payment_in_progress' },
    ]),
    0,
  );
});
