/**
 * Staff Performance Command Center — single SSR snapshot (no N+1).
 */

import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
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
  sortStaffByRevenue,
  type StaffPerformancePeriodPreset,
  type StaffRevenueCategory,
} from '@/src/hair/lib/staffPerformancePeriod';
import { getSalonSettings } from '@/src/hair/services/settings';
import {
  salonMetricTotal,
  type DateRange,
} from '@/src/hair/services/staffPerformance';

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

export type StaffPerformanceCommandCenterSnapshot = {
  timezone: string;
  salonName: string;
  periodLabel: string;
  periodPreset: StaffPerformancePeriodPreset;
  rangeFromIso: string;
  rangeToIso: string;
  category: StaffRevenueCategory;
  staffIdsFilter: string[];
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
};

/** @deprecated Prefer StaffPerformanceCommandCenterSnapshot */
export type StaffPerformanceDashboardSnapshot = StaffPerformanceCommandCenterSnapshot;

function paidAttrWhere(range: DateRange, staffIds?: string[]) {
  const parts = [
    eq(fyhInvoices.status, 'paid'),
    gte(fyhInvoices.paidAt, range.from),
    lt(fyhInvoices.paidAt, range.to),
  ];
  if (staffIds && staffIds.length > 0) {
    parts.push(inArray(fyhInvoiceLineAttributions.staffId, staffIds));
  }
  return and(...parts);
}

async function metricTotals(range: DateRange, staffIds?: string[]): Promise<{
  service: number;
  product: number;
  package: number;
  membership: number;
}> {
  if (!staffIds?.length) {
    const [service, product, pkg, membership] = await Promise.all([
      salonMetricTotal('service', range),
      salonMetricTotal('product', range),
      salonMetricTotal('package', range),
      salonMetricTotal('membership', range),
    ]);
    return { service, product, package: pkg, membership };
  }

  const rows = await hairDb
    .select({
      metric: fyhInvoiceLineAttributions.revenueMetric,
      total: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .where(paidAttrWhere(range, staffIds))
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
      .where(paidAttrWhere(range, staffIds))
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
      .where(paidAttrWhere(range, staffIds))
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

async function commissionByStaff(range: DateRange, staffIds?: string[]) {
  const fromKey = range.from.toISOString().slice(0, 10);
  const toKey = range.to.toISOString().slice(0, 10);
  const parts = [gte(fyhCommissionEntries.periodDate, fromKey), lt(fyhCommissionEntries.periodDate, toKey)];
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
    .where(paidAttrWhere(range, staffIds))
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
}): Promise<StaffPerformanceCommandCenterSnapshot> {
  const settings = await getSalonSettings();
  const timezone = settings.timezone?.trim() || 'Asia/Kolkata';
  const salonName = settings.businessName?.trim() || 'Salon';
  const preset = input?.period ?? 'month';
  const category = input?.category ?? 'combined';
  const staffIds = input?.staffIds?.filter(Boolean) ?? [];

  const { range, previousRange, label } = resolveStaffPerformanceRange({
    timezone,
    preset,
    from: input?.from,
    to: input?.to,
  });

  const staffFilter = staffIds.length > 0 ? staffIds : undefined;

  const [
    currentTotals,
    previousTotals,
    staffAggs,
    commissionMap,
    refundMap,
    customers,
    staffOptions,
  ] = await Promise.all([
    metricTotals(range, staffFilter),
    metricTotals(previousRange, staffFilter),
    staffAttributedAggregates(range, staffFilter),
    commissionByStaff(range, staffFilter),
    refundsByStaff(range, staffFilter),
    customerMetrics(range, staffFilter),
    hairDb
      .select({ id: fyhStaff.id, name: fyhStaff.fullName })
      .from(fyhStaff)
      .where(eq(fyhStaff.isActive, true))
      .orderBy(asc(fyhStaff.fullName)),
  ]);

  const combined = currentTotals.service + currentTotals.product + currentTotals.package + currentTotals.membership;
  const prevCombined =
    previousTotals.service +
    previousTotals.product +
    previousTotals.package +
    previousTotals.membership;

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

  const leaderboardBase = sortStaffByRevenue(
    staffAggs.map((s) => ({
      staffId: s.staffId,
      name: s.name,
      photoUrl: s.photoUrl,
      revenuePaise: s.combinedPaise,
      customersServed: s.customersServed,
      averageBillPaise: s.invoiceCount > 0 ? Math.round(s.combinedPaise / s.invoiceCount) : 0,
      servicesSoldCount: Math.round(s.servicesSoldCount),
      productsSoldCount: Math.round(s.productsSoldCount),
    })),
  );

  const totalForPct = leaderboardBase.reduce((a, r) => a + r.revenuePaise, 0) || 1;
  const distribution = leaderboardBase.map((r) => ({
    staffId: r.staffId,
    name: r.name,
    revenuePaise: r.revenuePaise,
    pct: Math.round((r.revenuePaise / totalForPct) * 1000) / 10,
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

  return {
    timezone,
    salonName,
    periodLabel: label,
    periodPreset: preset,
    rangeFromIso: range.from.toISOString(),
    rangeToIso: range.to.toISOString(),
    category,
    staffIdsFilter: staffIds,
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
  };
}

/** Back-compat wrapper used by older imports. */
export async function getStaffPerformanceDashboardSnapshot(): Promise<StaffPerformanceCommandCenterSnapshot> {
  return getStaffPerformanceCommandCenter({ period: 'month' });
}

export function buildStaffPerformanceDashboard(
  raw: StaffPerformanceCommandCenterSnapshot,
): StaffPerformanceCommandCenterSnapshot {
  return raw;
}
