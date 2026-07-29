import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOutstandingFromSsotForAudit, revenueByPgRowReconciles, type RevenueByPgRow } from '../../src/services/revenueCommandCenter';
import {
  computeOperatingRevenue,
  operatingRevenueReconciles,
  pgMetricsFromRow,
  splitRentAndLateFees,
  sumOperatingRevenueComponents,
} from '../../src/services/financialMetricsEngine';
import type { PgBusinessMetrics } from '../../src/db/queries/admin';

test('buildOutstandingFromSsotForAudit does not add pending proof amounts to total outstanding', () => {
  const invoices = {
    pendingRentInvoices: 2,
    pendingElectricityInvoices: 1,
    pendingRentInvoicesPaise: 15_000,
    pendingElectricityInvoicesPaise: 4_000,
    totalOutstandingPaise: 19_000,
  };
  const pendingPayments = [{ amountPaise: 3_000 }, { amountPaise: 2_000 }];

  const result = buildOutstandingFromSsotForAudit(invoices, pendingPayments);

  assert.equal(result.totalOutstandingPaise, 19_000);
  assert.equal(result.pendingPaymentApprovalsPaise, 5_000);
  assert.notEqual(
    result.totalOutstandingPaise,
    invoices.totalOutstandingPaise + result.pendingPaymentApprovalsPaise,
  );
});

test('pgMetricsFromRow operating revenue equals invoice buckets (excludes deposit)', () => {
  const pgRow = {
    pgId: 'pg-1',
    pgName: 'Test PG',
    totalBeds: 10,
    occupiedBeds: 8,
    availableBeds: 2,
    blockedBeds: 0,
    occupancyPct: 80,
    billingMonth: '2026-07-01',
    incomeRentQrPaise: 0,
    incomeRentInvoicePaise: 6_453_200 + 4_700,
    incomeRentPaise: 6_453_200 + 4_700,
    incomeElectricityQrPaise: 0,
    incomeElectricityInvoicePaise: 0,
    incomeElectricityPaise: 0,
    incomeTotalPaise: 6_453_200 + 4_700,
    expectedMonthlyRentPaise: 0,
    lateFeePaise: 4_700,
    vacatingDeductionPaise: 0,
    otherDeductionPaise: 0,
    depositRefundsCount: 0,
    depositRefundsPaise: 0,
  } satisfies PgBusinessMetrics;

  const metrics = pgMetricsFromRow(pgRow, 0);
  assert.equal(metrics.rentPrincipalPaise, 6_453_200);
  assert.equal(metrics.lateFeePaise, 4_700);
  assert.equal(metrics.operatingRevenuePaise, 6_457_900);
  assert.equal(operatingRevenueReconciles(metrics), true);

  const revenueRow: RevenueByPgRow = {
    pgId: metrics.pgId,
    pgName: metrics.pgName,
    occupancyPct: metrics.occupancyPct,
    occupiedBeds: metrics.occupiedBeds,
    totalBeds: metrics.totalBeds,
    rentRevenuePaise: metrics.rentPrincipalPaise,
    electricityRevenuePaise: metrics.electricityPaise,
    lateFeePaise: metrics.lateFeePaise,
    otherIncomePaise: metrics.otherIncomePaise,
    depositCollectedPaise: 2_247_800,
    depositPaidCount: 3,
    depositPendingCount: 0,
    depositRequirementMissingCount: 0,
    totalRevenuePaise: metrics.operatingRevenuePaise,
  };
  assert.equal(revenueByPgRowReconciles(revenueRow), true);
  assert.equal(
    sumOperatingRevenueComponents({
      rentPrincipalPaise: revenueRow.rentRevenuePaise,
      lateFeePaise: revenueRow.lateFeePaise,
      electricityPaise: revenueRow.electricityRevenuePaise,
      otherIncomePaise: revenueRow.otherIncomePaise,
    }),
    revenueRow.totalRevenuePaise,
  );
  assert.notEqual(revenueRow.totalRevenuePaise, revenueRow.totalRevenuePaise + revenueRow.depositCollectedPaise);
});

test('splitRentAndLateFees matches admin rent invoice aggregation (Central Female PG)', () => {
  const split = splitRentAndLateFees({ incomeRentPaise: 1_500_000, lateFeePaise: 0 });
  const operating = computeOperatingRevenue({
    rentPrincipalPaise: split.rentPrincipalPaise,
    lateFeePaise: split.lateFeePaise,
    electricityPaise: 372_000,
    otherIncomePaise: 0,
  });
  assert.equal(operating.operatingRevenuePaise, 1_872_000);
});
