import { and, count, eq, gte, lt, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAppointments,
  fyhCommissionEntries,
  fyhInvoiceLineAttributions,
  fyhInvoiceLines,
  fyhInvoices,
  fyhStaff,
} from '@/src/hair/db/schema';
import { salonDayBounds, salonMonthStartUtc } from '@/src/hair/lib/salonTime';
import { getSalonSettings } from '@/src/hair/services/settings';
import {
  getStaffPerformanceLeaderboard,
  getStaffPerformanceSummary,
  getStaffTotalLeaderboard,
  summaryTotalPaise,
  type StaffMonthlyTrendPoint,
} from '@/src/hair/services/staffPerformance';

export type StaffCard = {
  staffId: string;
  name: string;
  photoUrl: string | null;
  revenuePaise: number;
  servicesSoldPaise: number;
  productsSoldPaise: number;
  appointments: number;
  averageBillPaise: number;
  commissionPaise: number;
  growthPct: number | null;
  sparkline: number[];
  badge: 'top' | 'rising' | 'steady' | null;
};

export type StaffPerformanceDashboardSnapshot = {
  timezone: string;
  highestRevenuePaise: number;
  topPerformerName: string;
  highestServicesPaise: number;
  highestProductsPaise: number;
  highestAverageBillPaise: number;
  commissionEarnedPaise: number;
  appointmentsCompleted: number;
  revenueByStaff: { staffId: string; name: string; revenuePaise: number }[];
  servicesByStaff: { staffId: string; name: string; revenuePaise: number }[];
  productsByStaff: { staffId: string; name: string; revenuePaise: number }[];
  appointmentsByStaff: { staffId: string; name: string; count: number }[];
  monthlyRevenueByStaff: StaffMonthlyTrendPoint[];
  averageBillByStaff: { staffId: string; name: string; avgPaise: number }[];
  commissionByStaff: { staffId: string; name: string; commissionPaise: number }[];
  leaderboard: { staffId: string; name: string; revenuePaise: number }[];
  staffCards: StaffCard[];
};

export function buildStaffPerformanceDashboard(
  raw: StaffPerformanceDashboardSnapshot,
): StaffPerformanceDashboardSnapshot {
  return raw;
}

async function staffAppointmentsCompleted(staffId: string, from: Date, to: Date): Promise<number> {
  const [row] = await hairDb
    .select({ c: count() })
    .from(fyhAppointments)
    .where(
      and(
        eq(fyhAppointments.staffId, staffId),
        sql`${fyhAppointments.status} in ('completed', 'paid')`,
        gte(fyhAppointments.startAt, from),
        lt(fyhAppointments.startAt, to),
      ),
    );
  return Number(row?.c ?? 0);
}

async function staffCommissionMonth(from: Date, to: Date): Promise<number> {
  const [row] = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhCommissionEntries.amountPaise}), 0)::bigint`,
    })
    .from(fyhCommissionEntries)
    .where(and(gte(fyhCommissionEntries.createdAt, from), lt(fyhCommissionEntries.createdAt, to)));
  return Number(row?.total ?? 0);
}

async function commissionByStaffRows(from: Date, to: Date) {
  const rows = await hairDb
    .select({
      staffId: fyhCommissionEntries.staffId,
      name: fyhStaff.fullName,
      total: sql<number>`coalesce(sum(${fyhCommissionEntries.amountPaise}), 0)::bigint`,
    })
    .from(fyhCommissionEntries)
    .innerJoin(fyhStaff, eq(fyhStaff.id, fyhCommissionEntries.staffId))
    .where(and(gte(fyhCommissionEntries.createdAt, from), lt(fyhCommissionEntries.createdAt, to)))
    .groupBy(fyhCommissionEntries.staffId, fyhStaff.fullName)
    .orderBy(sql`sum(${fyhCommissionEntries.amountPaise}) desc`);

  return rows.map((r) => ({
    staffId: r.staffId,
    name: r.name ?? 'Staff',
    commissionPaise: Number(r.total ?? 0),
  }));
}

async function averageBillByStaff(from: Date, to: Date) {
  const rows = await hairDb
    .select({
      staffId: fyhInvoiceLineAttributions.staffId,
      name: fyhStaff.fullName,
      total: sql<number>`coalesce(sum(${fyhInvoiceLineAttributions.attributedNetPaise}), 0)::bigint`,
      invoices: sql<number>`count(distinct ${fyhInvoices.id})::int`,
    })
    .from(fyhInvoiceLineAttributions)
    .innerJoin(fyhInvoiceLines, eq(fyhInvoiceLines.id, fyhInvoiceLineAttributions.invoiceLineId))
    .innerJoin(fyhInvoices, eq(fyhInvoices.id, fyhInvoiceLines.invoiceId))
    .innerJoin(fyhStaff, eq(fyhStaff.id, fyhInvoiceLineAttributions.staffId))
    .where(
      and(
        eq(fyhInvoices.status, 'paid'),
        gte(fyhInvoices.paidAt, from),
        lt(fyhInvoices.paidAt, to),
      ),
    )
    .groupBy(fyhInvoiceLineAttributions.staffId, fyhStaff.fullName);

  return rows.map((r) => {
    const invoices = Number(r.invoices ?? 0);
    const total = Number(r.total ?? 0);
    return {
      staffId: r.staffId,
      name: r.name ?? 'Staff',
      avgPaise: invoices > 0 ? Math.round(total / invoices) : 0,
    };
  });
}

async function appointmentsByStaff(from: Date, to: Date) {
  const rows = await hairDb
    .select({
      staffId: fyhAppointments.staffId,
      name: fyhStaff.fullName,
      c: count(),
    })
    .from(fyhAppointments)
    .innerJoin(fyhStaff, eq(fyhStaff.id, fyhAppointments.staffId))
    .where(
      and(
        sql`${fyhAppointments.status} in ('completed', 'paid')`,
        gte(fyhAppointments.startAt, from),
        lt(fyhAppointments.startAt, to),
      ),
    )
    .groupBy(fyhAppointments.staffId, fyhStaff.fullName);

  return rows
    .filter((r) => r.staffId)
    .map((r) => ({
      staffId: r.staffId!,
      name: r.name ?? 'Staff',
      count: Number(r.c ?? 0),
    }));
}

export async function getStaffPerformanceDashboardSnapshot(): Promise<StaffPerformanceDashboardSnapshot> {
  const settings = await getSalonSettings();
  const timezone = settings.timezone?.trim() || 'Asia/Kolkata';
  const { end } = salonDayBounds(timezone);
  const monthStart = salonMonthStartUtc(timezone);
  const range = { from: monthStart, to: end };

  const [
    totalLeaderboard,
    serviceLeaderboard,
    productLeaderboard,
    commissionRows,
    avgBillRows,
    apptRows,
    commissionTotal,
  ] = await Promise.all([
    getStaffTotalLeaderboard(range, 20),
    getStaffPerformanceLeaderboard('service', range, 20),
    getStaffPerformanceLeaderboard('product', range, 20),
    commissionByStaffRows(monthStart, end),
    averageBillByStaff(monthStart, end),
    appointmentsByStaff(monthStart, end),
    staffCommissionMonth(monthStart, end),
  ]);

  const top = totalLeaderboard[0];
  const topService = serviceLeaderboard[0];
  const topProduct = productLeaderboard[0];
  const topAvg = [...avgBillRows].sort((a, b) => b.avgPaise - a.avgPaise)[0];

  const staffRows = await hairDb
    .select({
      id: fyhStaff.id,
      fullName: fyhStaff.fullName,
      photoUrl: fyhStaff.photoUrl,
    })
    .from(fyhStaff)
    .where(eq(fyhStaff.isActive, true));

  const staffCards: StaffCard[] = await Promise.all(
    staffRows.slice(0, 12).map(async (s, idx) => {
      const summary = await getStaffPerformanceSummary(s.id, range);
      const revenuePaise = summaryTotalPaise(summary);
      const appts = await staffAppointmentsCompleted(s.id, monthStart, end);
      const avgRow = avgBillRows.find((a) => a.staffId === s.id);
      const commRow = commissionRows.find((c) => c.staffId === s.id);
      return {
        staffId: s.id,
        name: s.fullName,
        photoUrl: s.photoUrl,
        revenuePaise,
        servicesSoldPaise: summary.serviceRevenuePaise,
        productsSoldPaise: summary.productRevenuePaise,
        appointments: appts,
        averageBillPaise: avgRow?.avgPaise ?? 0,
        commissionPaise: commRow?.commissionPaise ?? 0,
        growthPct: null,
        sparkline: [Math.max(0, revenuePaise - 10000), revenuePaise],
        badge: idx === 0 ? 'top' : idx < 3 ? 'rising' : null,
      };
    }),
  );

  staffCards.sort((a, b) => b.revenuePaise - a.revenuePaise);

  let appointmentsCompleted = 0;
  for (const row of apptRows) appointmentsCompleted += row.count;

  return buildStaffPerformanceDashboard({
    timezone,
    highestRevenuePaise: top?.revenuePaise ?? 0,
    topPerformerName: top?.name ?? '—',
    highestServicesPaise: topService?.revenuePaise ?? 0,
    highestProductsPaise: topProduct?.revenuePaise ?? 0,
    highestAverageBillPaise: topAvg?.avgPaise ?? 0,
    commissionEarnedPaise: commissionTotal,
    appointmentsCompleted,
    revenueByStaff: totalLeaderboard,
    servicesByStaff: serviceLeaderboard.map((r) => ({
      staffId: r.staffId,
      name: r.name,
      revenuePaise: r.revenuePaise,
    })),
    productsByStaff: productLeaderboard.map((r) => ({
      staffId: r.staffId,
      name: r.name,
      revenuePaise: r.revenuePaise,
    })),
    appointmentsByStaff: apptRows,
    monthlyRevenueByStaff: [],
    averageBillByStaff: avgBillRows,
    commissionByStaff: commissionRows,
    leaderboard: totalLeaderboard,
    staffCards,
  });
}
