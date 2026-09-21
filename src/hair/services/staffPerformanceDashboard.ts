/**
 * Staff Performance Command Center — single SSR snapshot (no N+1).
 */

import { and, asc, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCommissionEntries,
  fyhCreditNotes,
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoices,
  fyhStaff,
  type FyhRevenueMetric,
} from '@/src/hair/db/schema';
import {
  momDeltaPct,
  resolveStaffPerformanceRange,
  sameMtdLastMonthPreviousRange,
  sortStaffByRevenue,
  type StaffPerformanceComparisonMode,
  type StaffPerformancePeriodPreset,
  type StaffRevenueCategory,
} from '@/src/hair/lib/staffPerformancePeriod';
import { getSalonSettings } from '@/src/hair/services/settings';
import type { RevenueDashboardLocationFilter } from '@/src/hair/services/revenueDashboardReportTypes';
import {
  performanceAmountFromMetricParts,
  salesTotalPaiseFromSummary,
  type DateRange,
} from '@/src/hair/services/staffPerformance';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationsInFilter } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

export type StaffKpiTotals = {
  serviceRevenuePaise: number;
  productRevenuePaise: number;
  packageRevenuePaise: number;
  membershipRevenuePaise: number;
  combinedRevenuePaise: number;
  serviceDeltaPct: number | null;
  productDeltaPct: number | null;
  packageDeltaPct: number | null;
  membershipDeltaPct: number | null;
  combinedDeltaPct: number | null;
};

export type StaffLeaderboardRow = {
  staffId: string;
  name: string;
  photoUrl: string | null;
  revenuePaise: number;
  customersServed: number;
  averageBillPaise: number;
  servicesSoldCount: number;
  productsSoldCount: number;
};

export type StaffCategoryRow = {
  staffId: string;
  name: string;
  revenuePaise: number;
  unitsOrCount: number;
  averageValuePaise: number;
  refundsPaise: number;
  discountPct: number;
  commissionPaise: number;
};

export type StaffComparisonPoint = {
  staffId: string;
  name: string;
  servicePaise: number;
  productPaise: number;
  packagePaise: number;
  membershipPaise: number;
  combinedPaise: number;
};

export type StaffCustomerMetrics = {
  repeatCustomers: number;
  newCustomers: number;
  retentionPct: number | null;
  averageSpendPaise: number;
  highestBillPaise: number;
  lowestBillPaise: number;
};

export type StaffTopTenRow = {
  staffId: string;
  name: string;
  photoUrl: string | null;
  amountPaise: number;
};

export type StaffSalesSummaryRow = {
  staffId: string;
  name: string;
  servicePaise: number;
  productPaise: number;
  packagePaise: number;
  membershipPaise: number;
  giftCardPaise: number;
  totalPaise: number;
};

export type StaffPerformanceAmountRow = {
  staffId: string;
  name: string;
  netServicePaise: number;
  membershipPaise: number;
  packagePaise: number;
  totalPaise: number;
};

export type StaffPeriodComparison = {
  mode: StaffPerformanceComparisonMode;
  currentSalesTotalPaise: number;
  previousSalesTotalPaise: number;
  currentPerformanceTotalPaise: number;
  previousPerformanceTotalPaise: number;
};

export type StaffPerformanceCommandCenterSnapshot = {
  timezone: string;
  salonName: string;
  periodLabel: string;
  periodPreset: StaffPerformancePeriodPreset;
  rangeFromIso: string;
  rangeToIso: string;
  category: StaffRevenueCategory;
  staffIdsFilter: string[];
  locationIds: RevenueDashboardLocationFilter;
  comparisonMode: StaffPerformanceComparisonMode;
  kpis: StaffKpiTotals;
  leaderboard: StaffLeaderboardRow[];
  distribution: { staffId: string; name: string; revenuePaise: number; pct: number }[];
  comparison: StaffComparisonPoint[];
  serviceTable: StaffCategoryRow[];
  productTable: StaffCategoryRow[];
  packageTable: StaffCategoryRow[];
  membershipTable: StaffCategoryRow[];
  customerMetrics: StaffCustomerMetrics;
  staffOptions: { id: string; name: string }[];
  topTenSales: StaffTopTenRow[];
  topTenPerformance: StaffTopTenRow[];
  totalSalesPaise: number;
  totalPerformanceAmountPaise: number;
  salesSummaryTable: StaffSalesSummaryRow[];
  performanceAmountTable: StaffPerformanceAmountRow[];
  periodComparison: StaffPeriodComparison;
};

/** @deprecated Prefer StaffPerformanceCommandCenterSnapshot */
export type StaffPerformanceDashboardSnapshot = StaffPerformanceCommandCenterSnapshot;

function paidAttrWhere(
  range: DateRange,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
  staffIds?: string[],
) {
  const parts = [
    orgFilter(fyhInvoices.organizationId, ctx),
    locationsInFilter(fyhInvoices.locationId, ctx, locationIds),
    eq(fyhInvoices.status, 'paid'),
    ne(fyhInvoices.source, 'advance_payment'),
    gte(fyhInvoices.paidAt, range.from),
    lt(fyhInvoices.paidAt, range.to),
  ];
  if (staffIds && staffIds.length > 0) {
    parts.push(inArray(fyhInvoiceLineAttributions.staffId, staffIds));
  }
  return and(...parts);
}

async function metricTotals(
  range: DateRange,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
  staffIds?: string[],
): Promise<{
  service: number;
  product: number;
  package: number;
  membership: number;
}> {
  const rows = await hairDb
    .select({
      metric: fyhInvoiceLineAttributions.revenueMetric,
      total: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .where(paidAttrWhere(range, ctx, locationIds, staffIds))
    .groupBy(fyhInvoiceLineAttributions.revenueMetric);

  const out = { service: 0, product: 0, package: 0, membership: 0 };
  for (const r of rows) {
    const v = Number(r.total ?? 0);
    if (r.metric === 'service') out.service = v;
    if (r.metric === 'product') out.product = v;
    if (r.metric === 'package') out.package = v;
    if (r.metric === 'membership') out.membership = v;
  }
  return out;
}

type StaffAggRow = {
  staffId: string;
  name: string;
  photoUrl: string | null;
  servicePaise: number;
  productPaise: number;
  packagePaise: number;
  membershipPaise: number;
  combinedPaise: number;
  customersServed: number;
  invoiceCount: number;
  servicesSoldCount: number;
  productsSoldCount: number;
  packageSoldCount: number;
  membershipSoldCount: number;
  discountPaise: number;
  lineGrossPaise: number;
};

async function staffAttributedAggregates(
  range: DateRange,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
  staffIds?: string[],
): Promise<StaffAggRow[]> {
  const [rows, customerRows] = await Promise.all([
    hairDb
      .select({
        staffId: fyhInvoiceLineAttributions.staffId,
        name: fyhStaff.fullName,
        photoUrl: fyhStaff.photoUrl,
        metric: fyhInvoiceLineAttributions.revenueMetric,
        revenue: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
        qty: sql<number>`coalesce(sum(${fyhInvoiceLines.quantity}), 0)::numeric`,
        discount: sql<number>`coalesce(sum(${fyhInvoiceLines.discountPaise}), 0)::bigint`,
        gross: sql<number>`coalesce(sum(${fyhInvoiceLines.unitPricePaise} * ${fyhInvoiceLines.quantity}), 0)::bigint`,
      })
      .from(fyhInvoiceLineAttributions)
      .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
      .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
      .innerJoin(fyhStaff, eq(fyhStaff.id, fyhInvoiceLineAttributions.staffId))
      .where(paidAttrWhere(range, ctx, locationIds, staffIds))
      .groupBy(
        fyhInvoiceLineAttributions.staffId,
        fyhStaff.fullName,
        fyhStaff.photoUrl,
        fyhInvoiceLineAttributions.revenueMetric,
      ),
    hairDb
      .select({
        staffId: fyhInvoiceLineAttributions.staffId,
        customers: sql<number>`count(distinct ${fyhInvoices.customerId})::int`,
        invoices: sql<number>`count(distinct ${fyhInvoices.id})::int`,
      })
      .from(fyhInvoiceLineAttributions)
      .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
      .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
      .where(paidAttrWhere(range, ctx, locationIds, staffIds))
      .groupBy(fyhInvoiceLineAttributions.staffId),
  ]);

  const customerMap = new Map(
    customerRows.map((r) => [
      r.staffId,
      { customers: Number(r.customers ?? 0), invoices: Number(r.invoices ?? 0) },
    ]),
  );

  const byStaff = new Map<string, StaffAggRow>();

  for (const r of rows) {
    let row = byStaff.get(r.staffId);
    if (!row) {
      const counts = customerMap.get(r.staffId);
      row = {
        staffId: r.staffId,
        name: r.name ?? 'Staff',
        photoUrl: r.photoUrl,
        servicePaise: 0,
        productPaise: 0,
        packagePaise: 0,
        membershipPaise: 0,
        combinedPaise: 0,
        customersServed: counts?.customers ?? 0,
        invoiceCount: counts?.invoices ?? 0,
        servicesSoldCount: 0,
        productsSoldCount: 0,
        packageSoldCount: 0,
        membershipSoldCount: 0,
        discountPaise: 0,
        lineGrossPaise: 0,
      };
      byStaff.set(r.staffId, row);
    }
    const revenue = Number(r.revenue ?? 0);
    const qty = Number(r.qty ?? 0);
    row.discountPaise += Number(r.discount ?? 0);
    row.lineGrossPaise += Number(r.gross ?? 0);
    row.combinedPaise += revenue;

    if (r.metric === 'service') {
      row.servicePaise += revenue;
      row.servicesSoldCount += qty;
    } else if (r.metric === 'product') {
      row.productPaise += revenue;
      row.productsSoldCount += qty;
    } else if (r.metric === 'package') {
      row.packagePaise += revenue;
      row.packageSoldCount += qty;
    } else if (r.metric === 'membership') {
      row.membershipPaise += revenue;
      row.membershipSoldCount += qty;
    }
  }

  return [...byStaff.values()];
}

async function commissionByStaff(
  range: DateRange,
  ctx: TenantContext | null,
  staffIds?: string[],
) {
  const fromKey = range.from.toISOString().slice(0, 10);
  const toKey = range.to.toISOString().slice(0, 10);
  const parts = [
    orgFilter(fyhCommissionEntries.organizationId, ctx),
    gte(fyhCommissionEntries.periodDate, fromKey),
    lt(fyhCommissionEntries.periodDate, toKey),
  ];
  if (staffIds && staffIds.length > 0) {
    parts.push(inArray(fyhCommissionEntries.staffId, staffIds));
  }

  const rows = await hairDb
    .select({
      staffId: fyhCommissionEntries.staffId,
      total: sql<number>`coalesce(sum(${fyhCommissionEntries.amountPaise}), 0)::bigint`,
    })
    .from(fyhCommissionEntries)
    .where(and(...parts))
    .groupBy(fyhCommissionEntries.staffId);

  const map = new Map<string, number>();
  for (const r of rows) map.set(r.staffId, Number(r.total ?? 0));
  return map;
}

async function refundsByStaff(range: DateRange, staffIds?: string[]) {
  const notes = await hairDb
    .select({
      id: fyhCreditNotes.id,
      invoiceId: fyhCreditNotes.invoiceId,
      amountPaise: fyhCreditNotes.amountPaise,
    })
    .from(fyhCreditNotes)
    .where(and(gte(fyhCreditNotes.issuedAt, range.from), lt(fyhCreditNotes.issuedAt, range.to)));

  const map = new Map<string, number>();
  if (notes.length === 0) return map;

  const invoiceIds = [...new Set(notes.map((n) => n.invoiceId))];
  const attrParts = [inArray(fyhInvoices.id, invoiceIds)];
  if (staffIds && staffIds.length > 0) {
    attrParts.push(inArray(fyhInvoiceLineAttributions.staffId, staffIds));
  }

  const shares = await hairDb
    .select({
      invoiceId: fyhInvoices.id,
      staffId: fyhInvoiceLineAttributions.staffId,
      attributed: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .where(and(...attrParts))
    .groupBy(fyhInvoices.id, fyhInvoiceLineAttributions.staffId);

  const byInvoice = new Map<string, { staffId: string; attributed: number }[]>();
  for (const s of shares) {
    const list = byInvoice.get(s.invoiceId) ?? [];
    list.push({ staffId: s.staffId, attributed: Number(s.attributed ?? 0) });
    byInvoice.set(s.invoiceId, list);
  }

  for (const note of notes) {
    const staffShares = byInvoice.get(note.invoiceId) ?? [];
    const totalAttr = staffShares.reduce((a, s) => a + s.attributed, 0);
    if (staffShares.length === 0) continue;
    const amount = Number(note.amountPaise ?? 0);
    if (totalAttr <= 0) {
      const each = Math.round(amount / staffShares.length);
      for (const s of staffShares) {
        map.set(s.staffId, (map.get(s.staffId) ?? 0) + each);
      }
      continue;
    }
    for (const s of staffShares) {
      const share = Math.round((amount * s.attributed) / totalAttr);
      map.set(s.staffId, (map.get(s.staffId) ?? 0) + share);
    }
  }

  return map;
}

async function customerMetrics(
  range: DateRange,
  ctx: TenantContext | null,
  locationIds: RevenueDashboardLocationFilter,
  staffIds?: string[],
): Promise<StaffCustomerMetrics> {
  const invoiceRows = await hairDb
    .select({
      customerId: fyhInvoices.customerId,
      invoiceId: fyhInvoices.id,
      total: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .where(paidAttrWhere(range, ctx, locationIds, staffIds))
    .groupBy(fyhInvoices.customerId, fyhInvoices.id);

  const byCustomer = new Map<string, { invoices: number; spend: number }>();
  let highest = 0;
  let lowest = Number.POSITIVE_INFINITY;
  let spendSum = 0;
  let billCount = 0;

  for (const r of invoiceRows) {
    if (!r.customerId) continue;
    const spend = Number(r.total ?? 0);
    const cur = byCustomer.get(r.customerId) ?? { invoices: 0, spend: 0 };
    cur.invoices += 1;
    cur.spend += spend;
    byCustomer.set(r.customerId, cur);
    highest = Math.max(highest, spend);
    if (spend > 0) lowest = Math.min(lowest, spend);
    spendSum += spend;
    billCount += 1;
  }

  let repeat = 0;
  let neu = 0;
  for (const c of byCustomer.values()) {
    if (c.invoices >= 2) repeat += 1;
    else neu += 1;
  }
  const totalCustomers = repeat + neu;
  const retentionPct =
    totalCustomers > 0 ? Math.round((repeat / totalCustomers) * 1000) / 10 : null;

  return {
    repeatCustomers: repeat,
    newCustomers: neu,
    retentionPct,
    averageSpendPaise: billCount > 0 ? Math.round(spendSum / billCount) : 0,
    highestBillPaise: highest,
    lowestBillPaise: Number.isFinite(lowest) && lowest !== Number.POSITIVE_INFINITY ? lowest : 0,
  };
}

function categoryRow(
  staff: StaffAggRow,
  metric: FyhRevenueMetric,
  commission: number,
  refunds: number,
): StaffCategoryRow {
  const revenue =
    metric === 'service'
      ? staff.servicePaise
      : metric === 'product'
        ? staff.productPaise
        : metric === 'package'
          ? staff.packagePaise
          : staff.membershipPaise;
  const units =
    metric === 'service'
      ? staff.servicesSoldCount
      : metric === 'product'
        ? staff.productsSoldCount
        : metric === 'package'
          ? staff.packageSoldCount
          : staff.membershipSoldCount;
  const discountPct =
    staff.lineGrossPaise > 0
      ? Math.round((staff.discountPaise / staff.lineGrossPaise) * 1000) / 10
      : 0;

  return {
    staffId: staff.staffId,
    name: staff.name,
    revenuePaise: revenue,
    unitsOrCount: Math.round(units * 1000) / 1000,
    averageValuePaise: units > 0 ? Math.round(revenue / units) : 0,
    refundsPaise: refunds,
    discountPct,
    commissionPaise: commission,
  };
}

export async function getStaffPerformanceCommandCenter(input?: {
  period?: StaffPerformancePeriodPreset;
  from?: string | null;
  to?: string | null;
  staffIds?: string[];
  category?: StaffRevenueCategory;
  locationIds?: RevenueDashboardLocationFilter;
  comparisonMode?: StaffPerformanceComparisonMode;
}, ctx?: TenantContext | null): Promise<StaffPerformanceCommandCenterSnapshot> {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getSalonSettings(ctx);
  const timezone = settings.timezone?.trim() || 'Asia/Kolkata';
  const salonName = settings.businessName?.trim() || 'Salon';
  const preset = input?.period ?? 'month';
  const category = input?.category ?? 'combined';
  const staffIds = input?.staffIds?.filter(Boolean) ?? [];
  const locationIds = input?.locationIds ?? 'all';
  const comparisonMode = input?.comparisonMode ?? 'previous_period';

  const { range, previousRange: defaultPrevious, label } = resolveStaffPerformanceRange({
    timezone,
    preset,
    from: input?.from,
    to: input?.to,
  });

  const previousRange =
    comparisonMode === 'same_mtd_last_month'
      ? sameMtdLastMonthPreviousRange(range, timezone)
      : defaultPrevious;

  const staffFilter = staffIds.length > 0 ? staffIds : undefined;

  const [
    currentTotals,
    previousTotals,
    staffAggs,
    previousStaffAggs,
    commissionMap,
    refundMap,
    customers,
    staffOptions,
  ] = await Promise.all([
    metricTotals(range, ctx, locationIds, staffFilter),
    metricTotals(previousRange, ctx, locationIds, staffFilter),
    staffAttributedAggregates(range, ctx, locationIds, staffFilter),
    staffAttributedAggregates(previousRange, ctx, locationIds, staffFilter),
    commissionByStaff(range, ctx, staffFilter),
    refundsByStaff(range, staffFilter),
    customerMetrics(range, ctx, locationIds, staffFilter),
    hairDb
      .select({ id: fyhStaff.id, name: fyhStaff.fullName })
      .from(fyhStaff)
      .where(and(orgFilter(fyhStaff.organizationId, ctx), eq(fyhStaff.isActive, true)))
      .orderBy(asc(fyhStaff.fullName)),
  ]);

  const combined = salesTotalPaiseFromSummary({
    serviceRevenuePaise: currentTotals.service,
    productRevenuePaise: currentTotals.product,
    packageRevenuePaise: currentTotals.package,
    membershipRevenuePaise: currentTotals.membership,
  });
  const prevCombined = salesTotalPaiseFromSummary({
    serviceRevenuePaise: previousTotals.service,
    productRevenuePaise: previousTotals.product,
    packageRevenuePaise: previousTotals.package,
    membershipRevenuePaise: previousTotals.membership,
  });

  const totalPerformanceAmountPaise = performanceAmountFromMetricParts(
    currentTotals.service,
    currentTotals.package,
    currentTotals.membership,
  );
  const previousPerformanceTotalPaise = performanceAmountFromMetricParts(
    previousTotals.service,
    previousTotals.package,
    previousTotals.membership,
  );

  const kpis: StaffKpiTotals = {
    serviceRevenuePaise: currentTotals.service,
    productRevenuePaise: currentTotals.product,
    packageRevenuePaise: currentTotals.package,
    membershipRevenuePaise: currentTotals.membership,
    combinedRevenuePaise: combined,
    serviceDeltaPct: momDeltaPct(currentTotals.service, previousTotals.service),
    productDeltaPct: momDeltaPct(currentTotals.product, previousTotals.product),
    packageDeltaPct: momDeltaPct(currentTotals.package, previousTotals.package),
    membershipDeltaPct: momDeltaPct(currentTotals.membership, previousTotals.membership),
    combinedDeltaPct: momDeltaPct(combined, prevCombined),
  };

  const salesSummaryTable: StaffSalesSummaryRow[] = sortStaffByRevenue(
    staffAggs.map((s) => ({
      staffId: s.staffId,
      name: s.name,
      servicePaise: s.servicePaise,
      productPaise: s.productPaise,
      packagePaise: s.packagePaise,
      membershipPaise: s.membershipPaise,
      giftCardPaise: 0,
      totalPaise: s.combinedPaise,
      revenuePaise: s.combinedPaise,
    })),
  ).map(({ revenuePaise: _r, ...row }) => row);

  const performanceAmountTable: StaffPerformanceAmountRow[] = sortStaffByRevenue(
    staffAggs.map((s) => {
      const total = performanceAmountFromMetricParts(
        s.servicePaise,
        s.packagePaise,
        s.membershipPaise,
      );
      return {
        staffId: s.staffId,
        name: s.name,
        netServicePaise: s.servicePaise,
        membershipPaise: s.membershipPaise,
        packagePaise: s.packagePaise,
        totalPaise: total,
        revenuePaise: total,
      };
    }),
  ).map(({ revenuePaise: _r, ...row }) => row);

  const topTenSales: StaffTopTenRow[] = sortStaffByRevenue(
    staffAggs.map((s) => ({
      staffId: s.staffId,
      name: s.name,
      photoUrl: s.photoUrl,
      amountPaise: s.combinedPaise,
      revenuePaise: s.combinedPaise,
    })),
  )
    .slice(0, 10)
    .map(({ revenuePaise: _r, ...row }) => row);

  const topTenPerformance: StaffTopTenRow[] = sortStaffByRevenue(
    staffAggs.map((s) => {
      const amount = performanceAmountFromMetricParts(
        s.servicePaise,
        s.packagePaise,
        s.membershipPaise,
      );
      return {
        staffId: s.staffId,
        name: s.name,
        photoUrl: s.photoUrl,
        amountPaise: amount,
        revenuePaise: amount,
      };
    }),
  )
    .slice(0, 10)
    .map(({ revenuePaise: _r, ...row }) => row);

  const leaderboardBase = topTenSales.map((r) => ({
    staffId: r.staffId,
    name: r.name,
    photoUrl: r.photoUrl,
    revenuePaise: r.amountPaise,
    customersServed:
      staffAggs.find((s) => s.staffId === r.staffId)?.customersServed ?? 0,
    averageBillPaise: (() => {
      const agg = staffAggs.find((s) => s.staffId === r.staffId);
      return agg && agg.invoiceCount > 0 ? Math.round(agg.combinedPaise / agg.invoiceCount) : 0;
    })(),
    servicesSoldCount: Math.round(
      staffAggs.find((s) => s.staffId === r.staffId)?.servicesSoldCount ?? 0,
    ),
    productsSoldCount: Math.round(
      staffAggs.find((s) => s.staffId === r.staffId)?.productsSoldCount ?? 0,
    ),
  }));

  const totalForPct = combined || 1;
  const distribution = salesSummaryTable.map((r) => ({
    staffId: r.staffId,
    name: r.name,
    revenuePaise: r.totalPaise,
    pct: Math.round((r.totalPaise / totalForPct) * 1000) / 10,
  }));

  const comparison: StaffComparisonPoint[] = sortStaffByRevenue(
    staffAggs.map((s) => ({
      staffId: s.staffId,
      name: s.name,
      servicePaise: s.servicePaise,
      productPaise: s.productPaise,
      packagePaise: s.packagePaise,
      membershipPaise: s.membershipPaise,
      combinedPaise: s.combinedPaise,
      revenuePaise: s.combinedPaise,
    })),
  ).map(({ revenuePaise: _r, ...rest }) => rest);

  const buildTable = (metric: FyhRevenueMetric) =>
    sortStaffByRevenue(
      staffAggs.map((s) => {
        const row = categoryRow(
          s,
          metric,
          commissionMap.get(s.staffId) ?? 0,
          refundMap.get(s.staffId) ?? 0,
        );
        return { ...row, revenuePaise: row.revenuePaise };
      }),
    );

  const previousSalesTotal = previousStaffAggs.reduce((a, s) => a + s.combinedPaise, 0);
  const currentSalesTotal = staffAggs.reduce((a, s) => a + s.combinedPaise, 0);
  const currentPerformanceFromAggs = staffAggs.reduce(
    (a, s) => a + performanceAmountFromMetricParts(s.servicePaise, s.packagePaise, s.membershipPaise),
    0,
  );
  const previousPerformanceFromAggs = previousStaffAggs.reduce(
    (a, s) => a + performanceAmountFromMetricParts(s.servicePaise, s.packagePaise, s.membershipPaise),
    0,
  );

  return {
    timezone,
    salonName,
    periodLabel: label,
    periodPreset: preset,
    rangeFromIso: range.from.toISOString(),
    rangeToIso: range.to.toISOString(),
    category,
    staffIdsFilter: staffIds,
    locationIds,
    comparisonMode,
    kpis,
    leaderboard: leaderboardBase,
    distribution,
    comparison,
    serviceTable: buildTable('service'),
    productTable: buildTable('product'),
    packageTable: buildTable('package'),
    membershipTable: buildTable('membership'),
    customerMetrics: customers,
    staffOptions: staffOptions.map((s) => ({ id: s.id, name: s.name })),
    topTenSales,
    topTenPerformance,
    totalSalesPaise: currentSalesTotal,
    totalPerformanceAmountPaise: currentPerformanceFromAggs,
    salesSummaryTable,
    performanceAmountTable,
    periodComparison: {
      mode: comparisonMode,
      currentSalesTotalPaise: currentSalesTotal,
      previousSalesTotalPaise: previousSalesTotal,
      currentPerformanceTotalPaise: currentPerformanceFromAggs,
      previousPerformanceTotalPaise: previousPerformanceFromAggs,
    },
  };
}

/** Back-compat wrapper used by older imports. */
export async function getStaffPerformanceDashboardSnapshot(ctx?: TenantContext | null): Promise<StaffPerformanceCommandCenterSnapshot> {
  return getStaffPerformanceCommandCenter({ period: 'month' }, ctx);
}

export function buildStaffPerformanceDashboard(
  raw: StaffPerformanceCommandCenterSnapshot,
): StaffPerformanceCommandCenterSnapshot {
  return raw;
}
