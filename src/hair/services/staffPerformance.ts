import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoices,
  fyhStaff,
  type FyhRevenueMetric,
} from '@/src/hair/db/schema';

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
  range: DateRange,
): Promise<StaffPerformanceSummary> {
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

export async function getStaffTotalLeaderboard(range: DateRange, limit = 10) {
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

export async function salonMetricTotal(metric: FyhRevenueMetric, range: DateRange) {
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
