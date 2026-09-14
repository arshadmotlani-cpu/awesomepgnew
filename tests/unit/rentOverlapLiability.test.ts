/**
 * Adhoc vs monthly rent overlap — no double charge for the same stay coverage.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findStandardMonthlyInvoicesSupersededByAdhoc,
  isBillingMonthCoveredByRentLiability,
  isProtectedRentInvoice,
  isStandardMonthlyRentSupersededByAdhocLiability,
  resolveRentLiabilityCoveragePeriod,
  shouldSkipMonthlyRentBecauseAdhocCoversStay,
  type RentLiabilityInvoiceRow,
} from '@/src/lib/billing/rentOverlapLiability';
import { rentRowToQueueItem } from '@/src/lib/billing/collectionsQueue';
import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';

const STAY_START = '2026-08-31';
const STAY_END_EXCLUSIVE = '2026-09-10';
const STAY_END_INCLUSIVE = '2026-09-09';

function row(over: Partial<RentLiabilityInvoiceRow> & Pick<RentLiabilityInvoiceRow, 'id' | 'isAdhoc'>): RentLiabilityInvoiceRow {
  return {
    invoiceSubtype: 'standard',
    status: 'pending',
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    paymentProofUrl: null,
    proofSubmittedAt: null,
    proofSnapshotOutstandingPaise: null,
    billingMonth: '2026-09-01',
    dueDate: '2026-09-05',
    notes: null,
    ...over,
  };
}

test('A — monthly rent alone is not superseded', () => {
  const monthly = row({
    id: 'm1',
    isAdhoc: false,
    notes: 'Billing period: 1 Sept 2026 → 30 Sept 2026',
  });
  const ids = findStandardMonthlyInvoicesSupersededByAdhoc({
    invoices: [monthly],
    stayStart: STAY_START,
    stayEndInclusive: STAY_END_INCLUSIVE,
    billingDay: 5,
    billingCyclePolicy: 'calendar_month_1st',
  });
  assert.deepEqual(ids, []);
});

test('B — adhoc rent alone is not superseded by itself', () => {
  const adhoc = row({
    id: 'a1',
    isAdhoc: true,
    notes:
      'Daily rent — ₹220/day × 10 days (2026-08-31 → 2026-09-09). Billing period: 31 Aug 2026 → 9 Sep 2026',
    rentPaise: 220_000,
  });
  const ids = findStandardMonthlyInvoicesSupersededByAdhoc({
    invoices: [adhoc],
    stayStart: STAY_START,
    stayEndInclusive: STAY_END_INCLUSIVE,
    billingDay: 5,
    billingCyclePolicy: 'calendar_month_1st',
  });
  assert.deepEqual(ids, []);
});

test('C — adhoc overlapping September stay supersedes unpaid monthly (Syed case)', () => {
  const adhoc = row({
    id: 'adhoc-19',
    isAdhoc: true,
    rentPaise: 220_000,
    notes:
      'Daily rent — ₹220/day × 10 days (2026-08-31 → 2026-09-09). Billing period: 31 Aug 2026 → 9 Sep 2026',
  });
  const monthly = row({
    id: 'monthly-13',
    isAdhoc: false,
    status: 'overdue',
    notes: 'Billing period: 1 Sept 2026 → 30 Sept 2026',
  });
  assert.ok(
    isStandardMonthlyRentSupersededByAdhocLiability({
      standardInvoice: monthly,
      adhocOrTransitionInvoice: adhoc,
      stayStart: STAY_START,
      stayEndInclusive: STAY_END_INCLUSIVE,
      billingDay: 5,
      billingCyclePolicy: 'calendar_month_1st',
    }),
  );
  const ids = findStandardMonthlyInvoicesSupersededByAdhoc({
    invoices: [adhoc, monthly],
    stayStart: STAY_START,
    stayEndInclusive: STAY_END_INCLUSIVE,
    billingDay: 5,
    billingCyclePolicy: 'calendar_month_1st',
  });
  assert.deepEqual(ids, ['monthly-13']);
});

test('D — paid adhoc blocks duplicate monthly generation for same month', () => {
  const adhocPaid = row({
    id: 'a-paid',
    isAdhoc: true,
    status: 'paid',
    paidPrincipalPaise: 220_000,
    notes:
      'Daily rent — ₹220/day × 10 days (2026-08-31 → 2026-09-09). Billing period: 31 Aug 2026 → 9 Sep 2026',
  });
  const skip = shouldSkipMonthlyRentBecauseAdhocCoversStay({
    billingMonth: '2026-09-01',
    billingPeriod: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
    invoices: [adhocPaid],
    stayStart: STAY_START,
    stayEndInclusive: STAY_END_INCLUSIVE,
    billingDay: 5,
    billingCyclePolicy: 'calendar_month_1st',
  });
  assert.equal(skip, true);
});

test('E — non-overlapping rent periods: July monthly stays collectible with September adhoc', () => {
  const julyMonthly = row({
    id: 'jul',
    isAdhoc: false,
    billingMonth: '2026-07-01',
    notes: 'Billing period: 1 Jul 2026 → 31 Jul 2026',
  });
  const sepAdhoc = row({
    id: 'sep-adhoc',
    isAdhoc: true,
    notes:
      'Daily rent — ₹220/day × 10 days (2026-08-31 → 2026-09-09). Billing period: 31 Aug 2026 → 9 Sep 2026',
  });
  const ids = findStandardMonthlyInvoicesSupersededByAdhoc({
    invoices: [julyMonthly, sepAdhoc],
    stayStart: STAY_START,
    stayEndInclusive: STAY_END_INCLUSIVE,
    billingDay: 5,
    billingCyclePolicy: 'calendar_month_1st',
  });
  assert.deepEqual(ids, []);
});

test('F — Operations queue includes adhoc due, not superseded monthly', () => {
  const adhocDue: AdminRentInvoiceRow = {
    id: 'adhoc-19',
    invoiceNumber: 'RNT-2026-09-0019',
    bookingId: 'bk',
    bookingCode: 'APG-1',
    customerId: 'c',
    customerFullName: 'Resident',
    customerPhone: '9',
    pgId: 'pg',
    pgName: 'PG',
    bedId: 'bed',
    bedCode: 'B4',
    roomNumber: '203',
    billingMonth: '2026-09-01',
    dueDate: '2026-09-05',
    rentPaise: 220_000,
    lateFeeBasePaise: 220_000,
    discountPaise: 0,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    lateFeeLockedPaise: null,
    status: 'pending',
    paidAt: null,
    paymentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    notes: 'Daily rent — adhoc',
    paymentProvider: null,
    paymentRawPayload: null,
    paymentProofUrl: null,
    proofSubmittedAt: null,
    proofSnapshotOutstandingPaise: null,
    proofSnapshotLateFeePaise: null,
    proofSnapshotPrincipalDuePaise: null,
    cancelledAt: null,
    cancellationReason: null,
    isAdhoc: true,
    invoiceSubtype: 'standard',
    outstandingPaise: 220_000,
    effectiveStatus: 'pending',
  };
  assert.ok(rentRowToQueueItem(adhocDue, '2026-09-14'));
});

test('G — protected paid monthly is never marked superseded', () => {
  const adhoc = row({
    id: 'a1',
    isAdhoc: true,
    notes:
      'Daily rent — ₹220/day × 10 days (2026-08-31 → 2026-09-09). Billing period: 31 Aug 2026 → 9 Sep 2026',
  });
  const paidMonthly = row({
    id: 'm-paid',
    isAdhoc: false,
    status: 'paid',
    paidPrincipalPaise: 360_000,
    notes: 'Billing period: 1 Sept 2026 → 30 Sept 2026',
  });
  assert.ok(isProtectedRentInvoice(paidMonthly));
  const ids = findStandardMonthlyInvoicesSupersededByAdhoc({
    invoices: [adhoc, paidMonthly],
    stayStart: STAY_START,
    stayEndInclusive: STAY_END_INCLUSIVE,
    billingDay: 5,
    billingCyclePolicy: 'calendar_month_1st',
  });
  assert.deepEqual(ids, []);
});

test('H — cancelSupersededMonthlyRentInvoicesForBooking is wired in rentInvoices', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const src = readFileSync(resolve(process.cwd(), 'src/services/rentInvoices.ts'), 'utf8');
  assert.match(src, /cancelSupersededMonthlyRentInvoicesForBooking/);
  assert.match(src, /adhoc_rent_covers_stay/);
  assert.match(src, /isNull\(rentInvoices\.paymentProofUrl\)/);
});

test('resolveRentLiabilityCoveragePeriod parses adhoc ISO notes', () => {
  const period = resolveRentLiabilityCoveragePeriod(
    row({
      id: 'x',
      isAdhoc: true,
      notes: 'Daily rent — (2026-08-31 → 2026-09-09). Billing period: 31 Aug 2026 → 9 Sep 2026',
    }),
    { billingDay: 5, billingCyclePolicy: 'calendar_month_1st', moveInDate: STAY_START },
  );
  assert.deepEqual(period, {
    periodStart: '2026-08-31',
    periodEnd: '2026-09-09',
    source: 'rent_invoice',
    sourceId: 'x',
  });
});

test('isBillingMonthCoveredByRentLiability when adhoc covers all stay days in month', () => {
  const periods = [
    {
      periodStart: '2026-08-31',
      periodEnd: '2026-09-09',
      source: 'rent_invoice' as const,
      sourceId: 'a1',
    },
  ];
  assert.ok(
    isBillingMonthCoveredByRentLiability({
      billingMonth: '2026-09-01',
      stayStart: STAY_START,
      stayEndInclusive: STAY_END_INCLUSIVE,
      liabilityPeriods: periods,
    }),
  );
});
