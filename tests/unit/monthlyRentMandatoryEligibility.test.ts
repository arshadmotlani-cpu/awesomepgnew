/**
 * Mandatory monthly rent — adhoc/custom charges must not suppress generation.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { chargeableLateFeeDaysFromIssue, graceEndDateFromIssue } from '@/src/lib/billing/lateFeeSchedule';
import { shouldSkipMonthlyRentBecauseAdhocCoversStay } from '@/src/lib/billing/rentOverlapLiability';
import { formatDate } from '@/src/lib/dates';

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

test('shouldSkipMonthlyRentBecauseAdhocCoversStay always returns false', () => {
  assert.equal(
    shouldSkipMonthlyRentBecauseAdhocCoversStay({
      billingMonth: '2026-10-01',
      billingPeriod: { periodStart: '2026-10-01', periodEnd: '2026-10-31' },
      invoices: [
        {
          id: 'adhoc',
          isAdhoc: true,
          invoiceSubtype: 'standard',
          status: 'paid',
          paidPrincipalPaise: 50_000,
          paidLateFeePaise: 0,
          billingMonth: '2026-10-01',
          dueDate: '2026-10-05',
          notes: 'Custom charge. Billing period: 1 Oct 2026 → 31 Oct 2026',
        },
      ],
      stay: { start: '2026-08-01', end: null },
      billingDay: 5,
      billingCyclePolicy: 'calendar_month_1st',
    }),
    false,
  );
});

test('rentInvoices generation uses onConflictDoNothing for booking+month idempotency', () => {
  const src = read('src/services/rentInvoices.ts');
  assert.match(src, /onConflictDoNothing/);
  assert.match(src, /rentInvoices\.bookingId, rentInvoices\.billingMonth/);
});

test('October bill issued 1 Oct has due 5 Oct and zero late fee through 5 Oct', () => {
  const issue = '2026-10-01';
  assert.equal(formatDate(graceEndDateFromIssue(issue)), '2026-10-05');
  assert.equal(chargeableLateFeeDaysFromIssue(issue, '2026-10-05'), 0);
  assert.equal(chargeableLateFeeDaysFromIssue(issue, '2026-10-06'), 1);
  assert.equal(chargeableLateFeeDaysFromIssue(issue, '2026-10-07'), 2);
});

test('syncPendingRentInvoicesFromSsot aligns bed and amount from SSOT', () => {
  const src = read('src/lib/billing/rentPricingSsot.ts');
  assert.match(src, /syncPendingRentInvoicesFromSsot/);
  assert.match(src, /activeBedIdForBooking/);
  assert.match(src, /lateFeeBasePaise: resolved\.rentPaise/);
});
