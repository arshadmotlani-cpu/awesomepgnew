import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { zonedLocalToUtc } from '@/src/hair/lib/salonTime';
import {
  fyhCommissionEntries,
  fyhCustomers,
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoices,
  fyhStaff,
  type FyhRevenueMetric,
} from '@/src/hair/db/schema';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export type StaffPerformanceSummary = {
  serviceRevenuePaise: number;
  productRevenuePaise: number;
  packageRevenuePaise: number;
  membershipRevenuePaise: number;
};

export type DateRange = { from: Date; to: Date };

function emptySummary(): StaffPerformanceSummary {
  return {
    serviceRevenuePaise: 0,
    productRevenuePaise: 0,
    packageRevenuePaise: 0,
    membershipRevenuePaise: 0,
  };
}

export async function getStaffPerformanceSummary(
  staffId: string,
  range: DateRange, ctx?: TenantContext | null): Promise<StaffPerformanceSummary> {
  const rows = await hairDb
    .select({
      metric: fyhInvoiceLineAttributions.revenueMetric,
      total: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .where(
      and(
        eq(fyhInvoiceLineAttributions.staffId, staffId),
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, range.from),
        lt(fyhInvoices.paidAt, range.to),
      ),
    )
    .groupBy(fyhInvoiceLineAttributions.revenueMetric);

  const out = emptySummary();
  for (const r of rows) {
    const v = Number(r.total ?? 0);
    if (r.metric === 'service') out.serviceRevenuePaise = v;
    if (r.metric === 'product') out.productRevenuePaise = v;
    if (r.metric === 'package') out.packageRevenuePaise = v;
    if (r.metric === 'membership') out.membershipRevenuePaise = v;
  }
  return out;
}

export async function getStaffPerformanceLeaderboard(
  metric: FyhRevenueMetric,
  range: DateRange,
  limit = 10,
) {
  const rows = await hairDb
    .select({
      staffId: fyhInvoiceLineAttributions.staffId,
      name: fyhStaff.fullName,
      totalPaise: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .innerJoin(fyhStaff, eq(fyhStaff.id, fyhInvoiceLineAttributions.staffId))
    .where(
      and(
        eq(fyhInvoiceLineAttributions.revenueMetric, metric),
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, range.from),
        lt(fyhInvoices.paidAt, range.to),
      ),
    )
    .groupBy(fyhInvoiceLineAttributions.staffId, fyhStaff.fullName)
    .orderBy(sql`sum(${fyhInvoiceLineAttributions.attributedNetPaise}) desc`)
    .limit(limit);

  return rows.map((r) => ({
    staffId: r.staffId,
    name: r.name ?? 'Staff',
    revenuePaise: Number(r.totalPaise ?? 0),
  }));
}

export async function getStaffTotalLeaderboard(range: DateRange, limit = 10, ctx?: TenantContext | null) {
  const rows = await hairDb
    .select({
      staffId: fyhInvoiceLineAttributions.staffId,
      name: fyhStaff.fullName,
      totalPaise: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .innerJoin(fyhStaff, eq(fyhStaff.id, fyhInvoiceLineAttributions.staffId))
    .where(
      and(
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, range.from),
        lt(fyhInvoices.paidAt, range.to),
      ),
    )
    .groupBy(fyhInvoiceLineAttributions.staffId, fyhStaff.fullName)
    .orderBy(sql`sum(${fyhInvoiceLineAttributions.attributedNetPaise}) desc`)
    .limit(limit);

  return rows.map((r) => ({
    staffId: r.staffId,
    name: r.name ?? 'Staff',
    revenuePaise: Number(r.totalPaise ?? 0),
  }));
}

export async function salonMetricTotal(metric: FyhRevenueMetric, range: DateRange, ctx?: TenantContext | null) {
  const rows = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .where(
      and(
        eq(fyhInvoiceLineAttributions.revenueMetric, metric),
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, range.from),
        lt(fyhInvoices.paidAt, range.to),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

export function summaryTotalPaise(summary: StaffPerformanceSummary): number {
  return (
    summary.serviceRevenuePaise +
    summary.productRevenuePaise +
    summary.packageRevenuePaise +
    summary.membershipRevenuePaise
  );
}

export type StaffDetailPerformance = {
  summary: StaffPerformanceSummary;
  totalRevenuePaise: number;
  invoiceCount: number;
  avgTicketPaise: number;
};

export async function getStaffDetailPerformance(
  staffId: string,
  range: DateRange,
): Promise<StaffDetailPerformance> {
  const summary = await getStaffPerformanceSummary(staffId, range);
  const totalRevenuePaise = summaryTotalPaise(summary);

  const [countRow] = await hairDb
    .select({
      invoiceCount: sql<number>`count(distinct ${fyhInvoices.id})::int`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .where(
      and(
        eq(fyhInvoiceLineAttributions.staffId, staffId),
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, range.from),
        lt(fyhInvoices.paidAt, range.to),
      ),
    );

  const invoiceCount = Number(countRow?.invoiceCount ?? 0);
  const avgTicketPaise =
    invoiceCount > 0 ? Math.round(totalRevenuePaise / invoiceCount) : 0;

  return { summary, totalRevenuePaise, invoiceCount, avgTicketPaise };
}

export type StaffMonthlyTrendPoint = {
  monthKey: string;
  label: string;
  revenuePaise: number;
};

function salonMonthBounds(timezone: string, monthOffset: number, now = new Date()) {
  const dayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m] = dayKey.split('-').map(Number);
  const anchor = new Date(Date.UTC(y, m - 1 - monthOffset, 1));
  const yy = anchor.getUTCFullYear();
  const mm = anchor.getUTCMonth() + 1;
  const monthKey = `${yy}-${String(mm).padStart(2, '0')}`;
  const label = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    month: 'short',
    year: '2-digit',
  }).format(new Date(Date.UTC(yy, mm - 1, 15)));
  const from = zonedLocalToUtc(`${monthKey}-01T00:00:00`, timezone);
  const next = new Date(Date.UTC(yy, mm, 1));
  const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const to = zonedLocalToUtc(`${nextKey}T00:00:00`, timezone);
  return { monthKey, label, from, to };
}

export async function getStaffMonthlyTrend(
  staffId: string,
  months = 6,
  timezone = 'Asia/Kolkata', ctx?: TenantContext | null): Promise<StaffMonthlyTrendPoint[]> {
  const points: StaffMonthlyTrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const { monthKey, label, from, to } = salonMonthBounds(timezone, i);
    const summary = await getStaffPerformanceSummary(staffId, { from, to });
    points.push({ monthKey, label, revenuePaise: summaryTotalPaise(summary) });
  }
  return points;
}

export type StaffTargetProgress = {
  targetPaise: number;
  actualPaise: number;
  progressBps: number;
};

export async function getStaffTargetProgress(
  staffId: string,
  range: DateRange, ctx?: TenantContext | null): Promise<StaffTargetProgress> {
  const [staff] = await hairDb
    .select({ performanceTargetPaise: fyhStaff.performanceTargetPaise })
    .from(fyhStaff)
    .where(and(orgFilter(fyhStaff.organizationId, ctx), eq(fyhStaff.id, staffId)))
    .limit(1);

  const targetPaise = Number(staff?.performanceTargetPaise ?? 0);
  const detail = await getStaffDetailPerformance(staffId, range);
  const actualPaise = detail.totalRevenuePaise;
  const progressBps =
    targetPaise > 0 ? Math.min(10_000, Math.round((actualPaise * 10_000) / targetPaise)) : 0;

  return { targetPaise, actualPaise, progressBps };
}

export type StaffCommissionTotals = {
  pendingPaise: number;
  paidPaise: number;
};

export async function getStaffCommissionTotals(staffId: string, ctx?: TenantContext | null): Promise<StaffCommissionTotals> {
  const [row] = await hairDb
    .select({
      pendingPaise: sql<number>`coalesce(sum(case when ${fyhCommissionEntries.status} = 'pending' then ${fyhCommissionEntries.amountPaise} else 0 end), 0)::bigint`,
      paidPaise: sql<number>`coalesce(sum(case when ${fyhCommissionEntries.status} = 'paid' then ${fyhCommissionEntries.amountPaise} else 0 end), 0)::bigint`,
    })
    .from(fyhCommissionEntries)
    .where(and(orgFilter(fyhCommissionEntries.organizationId, ctx), locationFilter(fyhCommissionEntries.locationId, ctx), eq(fyhCommissionEntries.staffId, staffId)));

  return {
    pendingPaise: Number(row?.pendingPaise ?? 0),
    paidPaise: Number(row?.paidPaise ?? 0),
  };
}

export async function getStaffCommissionInRange(
  staffId: string,
  range: DateRange, ctx?: TenantContext | null): Promise<StaffCommissionTotals & { totalPaise: number }> {
  const fromKey = range.from.toISOString().slice(0, 10);
  const toKey = range.to.toISOString().slice(0, 10);
  const [row] = await hairDb
    .select({
      pendingPaise: sql<number>`coalesce(sum(case when ${fyhCommissionEntries.status} = 'pending' then ${fyhCommissionEntries.amountPaise} else 0 end), 0)::bigint`,
      paidPaise: sql<number>`coalesce(sum(case when ${fyhCommissionEntries.status} = 'paid' then ${fyhCommissionEntries.amountPaise} else 0 end), 0)::bigint`,
      totalPaise: sql<number>`coalesce(sum(${fyhCommissionEntries.amountPaise}), 0)::bigint`,
    })
    .from(fyhCommissionEntries)
    .where(
      and(
        eq(fyhCommissionEntries.staffId, staffId),
        gte(fyhCommissionEntries.periodDate, fromKey),
        lt(fyhCommissionEntries.periodDate, toKey),
      ),
    );

  return {
    pendingPaise: Number(row?.pendingPaise ?? 0),
    paidPaise: Number(row?.paidPaise ?? 0),
    totalPaise: Number(row?.totalPaise ?? 0),
  };
}

export type StaffTopCatalogItem = {
  name: string;
  metric: FyhRevenueMetric;
  revenuePaise: number;
  quantity: number;
};

export async function getStaffTopCatalogItems(
  staffId: string,
  range: DateRange,
  metric: FyhRevenueMetric,
  limit = 8, ctx?: TenantContext | null): Promise<StaffTopCatalogItem[]> {
  const rows = await hairDb
    .select({
      name: fyhInvoiceLines.nameSnapshot,
      revenue: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
      quantity: sql<number>`coalesce(sum(${fyhInvoiceLines.quantity}), 0)::numeric`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .where(
      and(
        eq(fyhInvoiceLineAttributions.staffId, staffId),
        eq(fyhInvoiceLineAttributions.revenueMetric, metric),
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, range.from),
        lt(fyhInvoices.paidAt, range.to),
      ),
    )
    .groupBy(fyhInvoiceLines.nameSnapshot)
    .orderBy(sql`sum(${fyhInvoiceLineAttributions.attributedNetPaise}) desc`)
    .limit(limit);

  return rows.map((r) => ({
    name: r.name || 'Item',
    metric,
    revenuePaise: Number(r.revenue ?? 0),
    quantity: Number(r.quantity ?? 0),
  }));
}

export async function getStaffWorkingDays(staffId: string, range: DateRange, ctx?: TenantContext | null): Promise<number> {
  const [row] = await hairDb
    .select({
      days: sql<number>`count(distinct (${fyhInvoices.paidAt})::date)::int`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .where(
      and(
        eq(fyhInvoiceLineAttributions.staffId, staffId),
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, range.from),
        lt(fyhInvoices.paidAt, range.to),
      ),
    );
  return Number(row?.days ?? 0);
}

export type StaffRecentInvoiceRow = {
  invoiceId: string;
  invoiceNumber: string;
  paidAt: Date | null;
  customerName: string | null;
  attributedPaise: number;
};

export async function getStaffRecentInvoices(
  staffId: string,
  range: DateRange,
  limit = 12, ctx?: TenantContext | null): Promise<StaffRecentInvoiceRow[]> {
  const rows = await hairDb
    .select({
      invoiceId: fyhInvoices.id,
      invoiceNumber: fyhInvoices.invoiceNumber,
      paidAt: fyhInvoices.paidAt,
      customerName: fyhCustomers.fullName,
      attributed: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .leftJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .where(
      and(
        eq(fyhInvoiceLineAttributions.staffId, staffId),
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, range.from),
        lt(fyhInvoices.paidAt, range.to),
      ),
    )
    .groupBy(
      fyhInvoices.id,
      fyhInvoices.invoiceNumber,
      fyhInvoices.paidAt,
      fyhCustomers.fullName,
    )
    .orderBy(sql`${fyhInvoices.paidAt} desc nulls last`)
    .limit(limit);

  return rows.map((r) => ({
    invoiceId: r.invoiceId,
    invoiceNumber: r.invoiceNumber,
    paidAt: r.paidAt,
    customerName: r.customerName,
    attributedPaise: Number(r.attributed ?? 0),
  }));
}
