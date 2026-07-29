import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhInvoiceLines, fyhInvoices, fyhServices, fyhStaff } from '@/src/hair/db/schema';
import { salonDayBounds, salonMonthStartUtc, salonWeekStartUtc } from '@/src/hair/lib/salonTime';
import { todayRevenuePaise } from '@/src/hair/services/invoices';
import { getSalonSettings } from '@/src/hair/services/settings';

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

async function topServicesBetween(from: Date, to: Date, limit = 5) {
  const rows = await hairDb
    .select({
      serviceId: fyhInvoiceLines.serviceId,
      name: fyhServices.name,
      totalPaise: sql<number>`coalesce(sum(${fyhInvoiceLines.lineTotalPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLines)
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .leftJoin(fyhServices, eq(fyhServices.id, fyhInvoiceLines.serviceId))
    .where(
      and(
        eq(fyhInvoices.status, 'paid'),
        eq(fyhInvoiceLines.kind, 'service'),
        gte(fyhInvoices.paidAt, from),
        lt(fyhInvoices.paidAt, to),
      ),
    )
    .groupBy(fyhInvoiceLines.serviceId, fyhServices.name)
    .orderBy(sql`sum(${fyhInvoiceLines.lineTotalPaise}) desc`)
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
  const rows = await hairDb
    .select({
      staffId: fyhInvoiceLines.staffId,
      name: fyhStaff.fullName,
      totalPaise: sql<number>`coalesce(sum(${fyhInvoiceLines.lineTotalPaise}), 0)::bigint`,
    })
    .from(fyhInvoiceLines)
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .leftJoin(fyhStaff, eq(fyhStaff.id, fyhInvoiceLines.staffId))
    .where(
      and(
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, from),
        lt(fyhInvoices.paidAt, to),
      ),
    )
    .groupBy(fyhInvoiceLines.staffId, fyhStaff.fullName)
    .orderBy(sql`sum(${fyhInvoiceLines.lineTotalPaise}) desc`)
    .limit(limit);

  return rows
    .filter((r) => r.staffId)
    .map((r) => ({
      staffId: r.staffId!,
      name: r.name ?? 'Staff',
      revenuePaise: Number(r.totalPaise ?? 0),
    }));
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

export async function getReportsSnapshot(): Promise<ReportsSnapshot> {
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
