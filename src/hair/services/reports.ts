import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoices,
  fyhProducts,
  fyhServices,
} from '@/src/hair/db/schema';
import { salonDayBounds, salonMonthStartUtc, salonWeekStartUtc } from '@/src/hair/lib/salonTime';
import { todayRevenuePaise } from '@/src/hair/services/invoices';
import {
  getStaffTotalLeaderboard,
} from '@/src/hair/services/staffPerformance';
import { getSalonSettings } from '@/src/hair/services/settings';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

async function paidRevenueBetween(from: Date, to: Date) {
  const rows = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhInvoices.grandTotalPaise}), 0)::bigint`,
      tax: sql<number>`coalesce(sum(${fyhInvoices.taxPaise}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(fyhInvoices)
    .where(
      and(
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, from),
        lt(fyhInvoices.paidAt, to),
      ),
    );
  return {
    revenuePaise: Number(rows[0]?.total ?? 0),
    taxPaise: Number(rows[0]?.tax ?? 0),
    invoiceCount: Number(rows[0]?.count ?? 0),
  };
}

async function topProductsBetween(from: Date, to: Date, limit = 5) {
  const rows = await hairDb
    .select({
      productId: fyhInvoiceLines.productId,
      name: fyhProducts.name,
      totalPaise: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .leftJoin(fyhProducts, eq(fyhProducts.id, fyhInvoiceLines.productId))
    .where(
      and(
        eq(fyhInvoices.status, 'paid'),
        eq(fyhInvoiceLineAttributions.revenueMetric, 'product'),
        gte(fyhInvoices.paidAt, from),
        lt(fyhInvoices.paidAt, to),
      ),
    )
    .groupBy(fyhInvoiceLines.productId, fyhProducts.name)
    .orderBy(sql`sum(${fyhInvoiceLineAttributions.attributedNetPaise}) desc`)
    .limit(limit);

  return rows
    .filter((r) => r.productId)
    .map((r) => ({
      productId: r.productId!,
      name: r.name ?? 'Product',
      revenuePaise: Number(r.totalPaise ?? 0),
    }));
}

async function topServicesBetween(from: Date, to: Date, limit = 5) {
  const rows = await hairDb
    .select({
      serviceId: fyhInvoiceLines.serviceId,
      name: fyhServices.name,
      totalPaise: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .leftJoin(fyhServices, eq(fyhServices.id, fyhInvoiceLines.serviceId))
    .where(
      and(
        eq(fyhInvoices.status, 'paid'),
        eq(fyhInvoiceLineAttributions.revenueMetric, 'service'),
        gte(fyhInvoices.paidAt, from),
        lt(fyhInvoices.paidAt, to),
      ),
    )
    .groupBy(fyhInvoiceLines.serviceId, fyhServices.name)
    .orderBy(sql`sum(${fyhInvoiceLineAttributions.attributedNetPaise}) desc`)
    .limit(limit);

  return rows
    .filter((r) => r.serviceId)
    .map((r) => ({
      serviceId: r.serviceId!,
      name: r.name ?? 'Service',
      revenuePaise: Number(r.totalPaise ?? 0),
    }));
}

async function staffRevenueBetween(from: Date, to: Date, limit = 5) {
  return getStaffTotalLeaderboard({ from, to }, limit);
}

export type ReportsSnapshot = {
  timezone: string;
  todayRevenuePaise: number;
  weekRevenuePaise: number;
  monthRevenuePaise: number;
  todayInvoiceCount: number;
  weekInvoiceCount: number;
  monthInvoiceCount: number;
  monthGstPaise: number;
  topServicesThisMonth: { serviceId: string; name: string; revenuePaise: number }[];
  topStaffThisMonth: { staffId: string; name: string; revenuePaise: number }[];
};

export async function getReportsSnapshot(ctx?: TenantContext | null): Promise<ReportsSnapshot> {
  const settings = await getSalonSettings();
  const timezone = settings.timezone?.trim() || 'Asia/Kolkata';
  const { start: todayStart, end: tomorrow } = salonDayBounds(timezone);
  const weekStart = salonWeekStartUtc(timezone);
  const monthStart = salonMonthStartUtc(timezone);

  try {
    const [today, week, month] = await Promise.all([
      paidRevenueBetween(todayStart, tomorrow),
      paidRevenueBetween(weekStart, tomorrow),
      paidRevenueBetween(monthStart, tomorrow),
    ]);
    const [topServicesThisMonth, topStaffThisMonth] = await Promise.all([
      topServicesBetween(monthStart, tomorrow),
      staffRevenueBetween(monthStart, tomorrow),
    ]);

    let todayRevenue = today.revenuePaise;
    try {
      todayRevenue = await todayRevenuePaise();
    } catch {
      // keep aggregate
    }
    return {
      timezone,
      todayRevenuePaise: todayRevenue,
      weekRevenuePaise: week.revenuePaise,
      monthRevenuePaise: month.revenuePaise,
      todayInvoiceCount: today.invoiceCount,
      weekInvoiceCount: week.invoiceCount,
      monthInvoiceCount: month.invoiceCount,
      monthGstPaise: month.taxPaise,
      topServicesThisMonth,
      topStaffThisMonth,
    };
  } catch {
    return {
      timezone,
      todayRevenuePaise: 0,
      weekRevenuePaise: 0,
      monthRevenuePaise: 0,
      todayInvoiceCount: 0,
      weekInvoiceCount: 0,
      monthInvoiceCount: 0,
      monthGstPaise: 0,
      topServicesThisMonth: [],
      topStaffThisMonth: [],
    };
  }
}

export { paidRevenueBetween, topServicesBetween, topProductsBetween, staffRevenueBetween };
