#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * Live parity check — Overview must match Operations, Billing Centre, and Revenue SSOTs.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/verify-financial-summary-parity.ts
 */
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { adminUsers } from '../src/db/schema';
import { OPS_QUEUE_FILTERS } from '../src/lib/operations/operationsFilterLinks';
import type { AdminSession } from '../src/lib/auth/session';
import { getDashboardStats } from '../src/db/queries/admin';
import { loadBillingCommandCenterSnapshot } from '../src/services/billingCommandCenter';
import {
  buildOverviewDashboard,
  findOverviewMetricValue,
  selectFeaturedPropertyRows,
} from '../src/services/overviewDashboard';
import { loadOverviewContext } from '../src/services/overviewData';
import { loadOverviewReportingSnapshot } from '../src/services/overviewReportingService';
import { loadUnifiedOperationsQueue } from '../src/services/unifiedOperationsQueue';
import { getMoveOutPipelineSnapshot } from '../src/services/moveOutPipelineService';
import { getVisitorCountSummary } from '../src/services/visitorAnalytics';
import {
  buildInvoiceBreakdownReport,
  computeOutstandingMoneyFromInvoices,
  loadCollectionsSnapshot,
  loadInvoiceOutstandingSnapshot,
} from '../src/services/financialSummaryService';

type ReconciliationRow = {
  card: string;
  overview: number | string;
  sourceModule: string;
  sourceQuery: string;
  match: boolean;
};

async function getSession(): Promise<AdminSession> {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.role, 'super_admin')).limit(1);
  if (!admin) throw new Error('No super_admin user found');
  return {
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: admin.pgScope ?? [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

function row(
  card: string,
  overview: number | string,
  sourceModule: string,
  sourceQuery: string,
  match: boolean,
): ReconciliationRow {
  return { card, overview, sourceModule, sourceQuery, match };
}

function fmtMoney(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const session = await getSession();
  const billingMonth = undefined;

  const [
    snapshot,
    billing,
    unifiedOps,
    overviewCtx,
    reporting,
    collections,
    dashboardStats,
    visitors,
    moveOut,
  ] = await Promise.all([
    loadInvoiceOutstandingSnapshot(session),
    loadBillingCommandCenterSnapshot(session, billingMonth),
    loadUnifiedOperationsQueue(session, null),
    loadOverviewContext(session, billingMonth, { syncActions: false }),
    loadOverviewReportingSnapshot(session, billingMonth),
    loadCollectionsSnapshot(),
    getDashboardStats(),
    getVisitorCountSummary(),
    getMoveOutPipelineSnapshot(session),
  ]);

  if (!overviewCtx.ok) {
    console.error('Failed to load overview:', overviewCtx.error);
    process.exit(1);
  }

  const ssot = computeOutstandingMoneyFromInvoices(snapshot);
  const breakdown = buildInvoiceBreakdownReport(snapshot);
  const revenue = overviewCtx.data.revenue;
  const dashboard = buildOverviewDashboard(overviewCtx.data);
  const dash = dashboardStats.ok ? dashboardStats.data : null;

  const unifiedCounts = Object.fromEntries(
    unifiedOps.filterCounts.map((c) => [c.id, c.count]),
  ) as Record<string, number>;

  const rows: ReconciliationRow[] = [];

  // Money today
  for (const [id, label, sourceVal] of [
    ['today_total', 'Total Revenue Today', collections.today.totalPaise],
    ['today_rent', 'Rent Collected Today', collections.today.rentPaise],
    ['today_electricity', 'Electricity Collected Today', collections.today.electricityPaise],
    ['today_deposit', 'Deposits Collected Today', collections.today.depositPaise],
  ] as const) {
    const overviewVal = findOverviewMetricValue(dashboard, id) ?? -1;
    rows.push(
      row(label, fmtMoney(overviewVal), 'Collections', 'loadCollectionsSnapshot().today', overviewVal === sourceVal),
    );
  }

  // MTD
  for (const [id, label, sourceVal] of [
    ['mtd_total', 'Total Collected (MTD)', collections.mtd.totalPaise],
    ['mtd_rent', 'Rent Collected (MTD)', collections.mtd.rentPaise],
    ['mtd_electricity', 'Electricity Collected (MTD)', collections.mtd.electricityPaise],
    ['mtd_deposit', 'Deposit Collected (MTD)', collections.mtd.depositPaise],
    ['extra_income', 'Extra Income', collections.mtd.otherIncomePaise],
    ['late_fees', 'Late Fees Collected', collections.mtd.lateFeePaise],
  ] as const) {
    const overviewVal = findOverviewMetricValue(dashboard, id) ?? -1;
    rows.push(
      row(label, fmtMoney(overviewVal), 'Revenue', 'loadCollectionsSnapshot().mtd', overviewVal === sourceVal),
    );
  }

  // Invoices
  const invoiceChecks: Array<[string, string, number, string]> = [
    ['pending_rent', 'Rent Pending', ssot.pendingRentInvoicesPaise, 'financialSummaryService'],
    ['overdue_rent', 'Rent Overdue', reporting.rentStats?.overdueCount ?? 0, 'loadRentInvoiceStats'],
    ['paid_rent', 'Rent Paid', reporting.rentStats?.paidCount ?? 0, 'loadRentInvoiceStats'],
    [
      'pending_electricity',
      'Electricity Pending',
      ssot.pendingElectricityInvoicesPaise,
      'financialSummaryService',
    ],
    ['total_outstanding', 'Total Outstanding', ssot.totalOutstandingPaise, 'financialSummaryService'],
  ];

  for (const [id, label, sourceVal, query] of invoiceChecks) {
    const overviewVal = findOverviewMetricValue(dashboard, id) ?? -1;
    const display =
      id === 'overdue_rent' || id === 'paid_rent' ? overviewVal : fmtMoney(overviewVal);
    const sourceDisplay =
      id === 'overdue_rent' || id === 'paid_rent' ? sourceVal : fmtMoney(sourceVal);
    rows.push(
      row(
        label,
        display,
        id.includes('rent') && (id === 'overdue_rent' || id === 'paid_rent') ? 'Invoices' : 'Billing Centre',
        query,
        overviewVal === sourceVal,
      ),
    );
    void sourceDisplay;
  }

  rows.push(
    row(
      'Rent due count (Billing)',
      ssot.pendingRentInvoices,
      'Billing Centre',
      'loadBillingCommandCenterSnapshot.rentWaitingCount',
      ssot.pendingRentInvoices === billing.rentWaitingCount,
    ),
  );
  rows.push(
    row(
      'Electricity pending count (Billing)',
      ssot.pendingElectricityInvoices,
      'Billing Centre',
      'loadBillingCommandCenterSnapshot.electricityWaitingCount',
      ssot.pendingElectricityInvoices === billing.electricityWaitingCount,
    ),
  );

  // Operations (8 queues)
  for (const filter of OPS_QUEUE_FILTERS) {
    const overviewVal = findOverviewMetricValue(dashboard, filter) ?? -1;
    const sourceVal = unifiedCounts[filter] ?? 0;
    rows.push(
      row(
        filter.replace(/_/g, ' '),
        overviewVal,
        'Operations',
        `loadUnifiedOperationsQueue.filterCounts.${filter}`,
        overviewVal === sourceVal,
      ),
    );
  }

  // Move-outs
  const bedsReleasing = findOverviewMetricValue(dashboard, 'beds_releasing') ?? -1;
  rows.push(
    row(
      'Beds releasing (30d)',
      bedsReleasing,
      'Move-out pipeline',
      'getMoveOutPipelineSnapshot.counts.bedsReleasing30Days',
      bedsReleasing === moveOut.counts.bedsReleasing30Days,
    ),
  );

  // Occupancy
  if (dash) {
    for (const [id, label, sourceVal] of [
      ['occupancy', 'Occupancy %', dash.occupancyPct],
      ['occupied_beds', 'Occupied Beds', dash.occupiedBeds],
      ['bed_availability', 'Bed Availability', dash.availableBeds],
      ['blocked_beds', 'Blocked Beds', dash.blockedBeds],
      ['maintenance_beds', 'Maintenance Beds', dash.maintenanceBeds],
      ['total_beds', 'Total Beds', dash.totalBeds],
    ] as const) {
      const overviewVal = findOverviewMetricValue(dashboard, id) ?? -1;
      rows.push(
        row(label, overviewVal, 'Bed SSOT', 'getDashboardStats → getGlobalOccupancyCounts', overviewVal === sourceVal),
      );
    }
  }

  // Visitors
  for (const [id, label, sourceVal] of [
    ['visitors_all', 'Website Visitors', visitors.allTime],
    ['visitors_today', 'Visitors Today', visitors.today],
    ['visitors_week', 'Visitors This Week', visitors.week],
    ['visitors_month', 'Visitors This Month', visitors.month],
  ] as const) {
    const overviewVal = findOverviewMetricValue(dashboard, id) ?? -1;
    rows.push(
      row(label, overviewVal, 'Analytics', 'getVisitorCountSummary', overviewVal === sourceVal),
    );
  }

  // Property portfolio
  if (dash) {
    for (const [id, label, sourceVal] of [
      ['active_pgs', 'Active PGs', dash.totalPgs],
      ['floors', 'Floors', dash.totalFloors],
      ['rooms', 'Rooms', dash.totalRooms],
    ] as const) {
      const overviewVal = findOverviewMetricValue(dashboard, id) ?? -1;
      rows.push(
        row(label, overviewVal, 'Inventory', 'getDashboardStats', overviewVal === sourceVal),
      );
    }
  }

  // Property performance (featured PGs)
  const featured = selectFeaturedPropertyRows(revenue.byPg, reporting.billingMonth);
  for (const perf of featured) {
    const source = revenue.byPg.find((r) => r.pgId === perf.pgId);
    if (!source) continue;
    rows.push(
      row(
        `${perf.pgName} revenue`,
        fmtMoney(perf.totalRevenuePaise),
        'Revenue',
        'getPgFinancialMetrics',
        perf.totalRevenuePaise === source.totalRevenuePaise,
      ),
    );
    rows.push(
      row(
        `${perf.pgName} occupancy`,
        perf.occupancyPct,
        'Revenue',
        'getPgFinancialMetrics',
        perf.occupancyPct === source.occupancyPct,
      ),
    );
  }

  console.log('\n=== Invoice breakdown (SSOT) ===\n');
  console.log(`Rent outstanding:     ${fmtMoney(breakdown.rent.outstandingPaise)}`);
  console.log(`Electricity outstanding: ${fmtMoney(breakdown.electricity.outstandingPaise)}`);

  console.log('\n=== OVERVIEW RECONCILIATION ===\n');
  console.log('| Card | Overview | Source Module | Source Query | Match |');
  console.log('|------|----------|---------------|--------------|-------|');
  for (const r of rows) {
    const mark = r.match ? '✓' : '✗';
    console.log(`| ${r.card} | ${r.overview} | ${r.sourceModule} | ${r.sourceQuery} | ${mark} |`);
  }

  const failures = rows.filter((r) => !r.match);
  if (failures.length > 0) {
    console.error(`\nFAILED — ${failures.length} mismatch(es):\n`);
    for (const f of failures) {
      console.error(`  ${f.card}: overview=${f.overview} source=${f.sourceModule}/${f.sourceQuery}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\nOK — all Overview cards match their source of truth.\n');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
