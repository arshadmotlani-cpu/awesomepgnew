/**
 * Final billing reconciliation scenarios — regression suite for calendar-month migration.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { prorateForMonth, computeLateFee } from '../../src/services/billing';
import { projectInvoice } from '../../src/services/rentInvoices';
import {
  billingTransitionOverlapsPaidThrough,
  resolvePaidThroughForBillingMigration,
} from '../../src/services/billingCycleMigration';
import {
  shouldSkipCalendarMonthRentGeneration,
  isCalendarBillingMonthFullyCovered,
} from '../../src/lib/billing/billingCoverageModel';
import { buildResidentRentBillPresentation } from '../../src/lib/residents/residentBillingPeriodDisplay';
import { applyLateFeePolicy, lateFeeCapPaise } from '../../src/services/lateFeePolicy';
import { addDays, formatDate } from '../../src/lib/dates';

function bridgePeriod(paidThrough: string) {
  const start = formatDate(addDays(paidThrough, 1));
  const pr = prorateForMonth({
    monthlyRatePaise: 412_080,
    billingMonth: '2026-09-01',
    activeStart: start,
    activeEnd: formatDate(addDays('2026-09-30', 1)),
  });
  return { start, amountPaise: pr.amountPaise, daysActive: pr.daysActive };
}

describe('final billing reconciliation scenarios', () => {
  test('1 — Aug 8 check-in paid through Sep 8 → Sep 9–30 bridge only', () => {
    const paidThrough = '2026-09-08';
    const bridge = bridgePeriod(paidThrough);
    assert.equal(bridge.start, '2026-09-09');
    assert.equal(bridge.daysActive, 22);
    assert.equal(bridge.amountPaise, 302_192);
    assert.equal(
      billingTransitionOverlapsPaidThrough('2026-09-09', paidThrough),
      false,
    );
  });

  test('2 — no Sep 1–8 duplicate when paid through Sep 8', () => {
    const skip = shouldSkipCalendarMonthRentGeneration({
      billingMonth: '2026-09-01',
      paidUntilDate: '2026-09-08',
      paidInvoiceCoverage: [
        {
          periodStart: '2026-08-08',
          periodEnd: '2026-09-08',
          source: 'rent_invoice',
          sourceId: 'anniversary',
        },
      ],
      pendingTransitionPeriods: [
        {
          periodStart: '2026-09-09',
          periodEnd: '2026-09-30',
          source: 'rent_invoice',
          sourceId: 'bridge',
        },
      ],
    });
    assert.equal(skip, true);
    const fullMonthCovered = isCalendarBillingMonthFullyCovered({
      billingMonth: '2026-09-01',
      paidUntilDate: '2026-09-30',
      paidInvoiceCoverage: [
        { periodStart: '2026-09-01', periodEnd: '2026-10-01', source: 'rent_invoice', sourceId: 'x' },
      ],
    });
    assert.equal(fullMonthCovered, true);
    assert.equal(
      isCalendarBillingMonthFullyCovered({
        billingMonth: '2026-09-01',
        paidUntilDate: null,
        paidInvoiceCoverage: [
          { periodStart: '2026-09-09', periodEnd: '2026-09-30', source: 'rent_invoice', sourceId: 'bridge' },
        ],
      }),
      false,
    );
  });

  test('3 — transition invoice projection has zero late fee', () => {
    const view = projectInvoice({
      id: 'inv-t',
      invoiceNumber: 'RNT-T',
      bookingId: 'bk',
      customerId: 'c',
      bedId: 'bed',
      pgId: 'pg',
      billingMonth: '2026-09-01',
      dueDate: null,
      rentPaise: 302_192,
      paidPrincipalPaise: 0,
      paidLateFeePaise: 0,
      lateFeeLockedPaise: null,
      status: 'pending',
      paymentProofUrl: null,
      paymentId: null,
      paidAt: null,
      cancelledAt: null,
      cancellationReason: null,
      notes: 'Billing period: 9 Sep 2026 → 30 Sep 2026',
      isAdhoc: true,
      invoiceSubtype: 'billing_cycle_transition',
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date('2026-09-01'),
    });
    assert.equal(view.accruedLateFeePaise, 0);
  });

  test('4 — normal monthly invoice accrues 1%/day late fee after grace', () => {
    const rent = 412_080;
    assert.equal(
      computeLateFee({ rentPaise: rent, issueDate: '2026-10-01', today: '2026-10-05' }),
      0,
    );
    const day1 = computeLateFee({ rentPaise: rent, issueDate: '2026-10-01', today: '2026-10-06' });
    const day2 = computeLateFee({ rentPaise: rent, issueDate: '2026-10-01', today: '2026-10-07' });
    assert.ok(day1 > 0);
    assert.ok(day2 > day1);
  });

  test('5 — late fee caps at 10% of principal', () => {
    const rent = 412_080;
    const cap = lateFeeCapPaise(rent);
    assert.equal(cap, 41_208);
    const fee = applyLateFeePolicy({
      principalPaise: rent,
      overdueDays: 30,
      policy: {
        graceDays: 0,
        ratePercent: 1,
        rateType: 'percent_per_day',
        maxFeePaise: null,
        anchor: 'issue_date',
      },
    });
    assert.equal(fee, cap);
  });

  test('6 — cron idempotency: unique (booking_id, billing_month) for standard invoices', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/rentInvoices.ts'),
      'utf8',
    );
    assert.match(src, /onConflictDoNothing/);
    assert.match(src, /rentInvoices\.bookingId, rentInvoices\.billingMonth/);
  });

  test('7 — migration bridge idempotency rejects duplicate period', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/billingCycleMigration.ts'),
      'utf8',
    );
    assert.match(src, /Transition invoice already exists/);
    assert.match(src, /parsed\?\.periodStart === input\.periodStart/);
  });

  test('8 — fully paid calendar month skipped by generation', () => {
    const skip = shouldSkipCalendarMonthRentGeneration({
      billingMonth: '2026-08-01',
      paidUntilDate: '2026-08-31',
      paidInvoiceCoverage: [
        {
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          source: 'rent_invoice',
          sourceId: 'paid-aug',
        },
      ],
      pendingTransitionPeriods: [],
    });
    assert.equal(skip, true);
  });

  test('9 — partial coverage leaves only uncovered tail', () => {
    const paidThrough = resolvePaidThroughForBillingMigration({
      moveInDate: '2026-08-08',
      billingDay: 8,
      billingCyclePolicy: 'anniversary',
      paidInvoiceCoverage: [
        { periodStart: '2026-07-08', periodEnd: '2026-08-08', paidPrincipalPaise: 412_080 },
      ],
      paidUntilFromVacating: null,
      lastPaidInvoice: {
        paidAt: new Date('2026-08-08'),
        status: 'paid',
      },
    });
    assert.equal(paidThrough, '2026-09-08');
    const uncovered = bridgePeriod(paidThrough!);
    assert.equal(uncovered.start, '2026-09-09');
    assert.ok(uncovered.amountPaise > 0);
  });

  test('10 — resident UI shows exact FROM/TO inclusive dates', () => {
    const pres = buildResidentRentBillPresentation({
      billingMonth: '2026-09-01',
      invoiceSubtype: 'billing_cycle_transition',
      notes: 'Billing period: 9 Sep 2026 → 30 Sep 2026',
    });
    assert.match(pres.periodLabel, /9 September 2026/);
    assert.match(pres.periodLabel, /30 September 2026/);
    assert.equal(pres.titleLabel, 'Billing transition');
    const monthly = buildResidentRentBillPresentation({
      billingMonth: '2026-10-01',
      notes: 'Billing period: 1 Oct 2026 → 31 Oct 2026',
    });
    assert.match(monthly.periodLabel, /1 October 2026/);
    assert.match(monthly.periodLabel, /31 October 2026/);
  });

  test('11 — overlapping Aug 13 transition overlaps paid-through Sep 8', () => {
    assert.equal(
      billingTransitionOverlapsPaidThrough('2026-08-13', '2026-09-08'),
      true,
    );
    assert.equal(
      billingTransitionOverlapsPaidThrough('2026-09-09', '2026-09-08'),
      false,
    );
  });

  test('12 — October eligible after September bridge only', () => {
    const sepSkip = shouldSkipCalendarMonthRentGeneration({
      billingMonth: '2026-09-01',
      paidUntilDate: '2026-09-08',
      paidInvoiceCoverage: [],
      pendingTransitionPeriods: [
        {
          periodStart: '2026-09-09',
          periodEnd: '2026-09-30',
          source: 'rent_invoice',
          sourceId: 'bridge',
        },
      ],
    });
    assert.equal(sepSkip, true);

    const octSkip = shouldSkipCalendarMonthRentGeneration({
      billingMonth: '2026-10-01',
      paidUntilDate: '2026-09-30',
      paidInvoiceCoverage: [
        {
          periodStart: '2026-09-09',
          periodEnd: '2026-09-30',
          source: 'rent_invoice',
          sourceId: 'bridge-paid',
        },
      ],
      pendingTransitionPeriods: [],
    });
    assert.equal(octSkip, false);

    const octElig = evaluateOctoberRent();
    assert.equal(octElig.rentPaise, 412_080);
  });
});

function evaluateOctoberRent() {
  const pr = prorateForMonth({
    monthlyRatePaise: 412_080,
    billingMonth: '2026-10-01',
    activeStart: '2026-10-01',
    activeEnd: formatDate(addDays('2026-10-31', 1)),
  });
  return { rentPaise: pr.amountPaise, isFullMonth: pr.isFullMonth };
}
