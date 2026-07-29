import { and, asc, count, desc, eq, gte, lt, notInArray, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAppointmentServices,
  fyhAppointments,
  fyhCustomers,
  fyhInvoices,
  fyhProducts,
  fyhStaff,
  fyhStaffSchedules,
} from '@/src/hair/db/schema';
import { countActiveCustomers } from '@/src/hair/services/customers';
import { todayRevenuePaise } from '@/src/hair/services/invoices';
import { getSalonSettings } from '@/src/hair/services/settings';
import { salonDayBounds, salonDayOfWeek } from '@/src/hair/lib/salonTime';

export type DashboardScheduleItem = {
  id: string;
  timeLabel: string;
  customerName: string;
  serviceLabel: string;
  staffName: string;
  status: string;
};

export type DashboardAppointmentItem = {
  id: string;
  whenLabel: string;
  customerName: string;
  serviceLabel: string;
};

export type DashboardBillItem = {
  id: string;
  customerName: string;
  amountPaise: number;
  status: string;
  createdAtLabel: string;
};

export type DashboardSnapshot = {
  todayRevenuePaise: number;
  todayAppointments: number;
  customersInSalon: number;
  pendingPayments: number;
  staffWorking: number;
  lowStockProducts: number;
  totalCustomers: number;
  todaysSchedule: DashboardScheduleItem[];
  upcomingAppointments: DashboardAppointmentItem[];
  recentBills: DashboardBillItem[];
};

const TERMINAL = ['cancelled', 'no_show', 'completed', 'paid'] as const;

function formatHm(d: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function formatWhen(d: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  let totalCustomers = 0;
  try {
    totalCustomers = await countActiveCustomers();
  } catch {
    totalCustomers = 0;
  }

  let timezone = 'Asia/Kolkata';
  try {
    const settings = await getSalonSettings();
    timezone = settings.timezone || 'Asia/Kolkata';
  } catch {
    timezone = 'Asia/Kolkata';
  }

  const { start, end } = salonDayBounds(timezone);
  const now = new Date();

  let todayRevenuePaiseValue = 0;
  let todayAppointments = 0;
  let customersInSalon = 0;
  let pendingPayments = 0;
  let staffWorking = 0;
  let lowStockProducts = 0;
  let todaysSchedule: DashboardScheduleItem[] = [];
  let upcomingAppointments: DashboardAppointmentItem[] = [];
  let recentBills: DashboardBillItem[] = [];

  try {
    todayRevenuePaiseValue = await todayRevenuePaise();
  } catch {
    todayRevenuePaiseValue = 0;
  }

  try {
    const [row] = await hairDb
      .select({ total: count() })
      .from(fyhAppointments)
      .where(
        and(
          gte(fyhAppointments.startAt, start),
          lt(fyhAppointments.startAt, end),
          notInArray(fyhAppointments.status, [...TERMINAL]),
        ),
      );
    todayAppointments = Number(row?.total ?? 0);
  } catch {
    todayAppointments = 0;
  }

  try {
    const [row] = await hairDb
      .select({ total: count() })
      .from(fyhAppointments)
      .where(
        and(
          gte(fyhAppointments.startAt, start),
          lt(fyhAppointments.startAt, end),
          sql`${fyhAppointments.status} in ('arrived', 'in_service')`,
        ),
      );
    customersInSalon = Number(row?.total ?? 0);
  } catch {
    customersInSalon = 0;
  }

  try {
    const [row] = await hairDb
      .select({ total: count() })
      .from(fyhInvoices)
      .where(sql`${fyhInvoices.status} in ('unpaid', 'partial')`);
    pendingPayments = Number(row?.total ?? 0);
  } catch {
    pendingPayments = 0;
  }

  try {
    const dayOfWeek = salonDayOfWeek(timezone);
    const [row] = await hairDb
      .select({
        total: sql<number>`count(distinct ${fyhAppointments.staffId})::int`,
      })
      .from(fyhAppointments)
      .innerJoin(fyhStaff, eq(fyhStaff.id, fyhAppointments.staffId))
      .leftJoin(
        fyhStaffSchedules,
        and(
          eq(fyhStaffSchedules.staffId, fyhAppointments.staffId),
          eq(fyhStaffSchedules.dayOfWeek, dayOfWeek),
        ),
      )
      .where(
        and(
          eq(fyhStaff.isActive, true),
          gte(fyhAppointments.startAt, start),
          lt(fyhAppointments.startAt, end),
          notInArray(fyhAppointments.status, ['cancelled', 'no_show']),
          sql`(${fyhStaffSchedules.id} IS NULL OR ${fyhStaffSchedules.isOff} = false)`,
        ),
      );
    staffWorking = Number(row?.total ?? 0);
  } catch {
    staffWorking = 0;
  }

  try {
    const [row] = await hairDb
      .select({ total: count() })
      .from(fyhProducts)
      .where(
        and(
          eq(fyhProducts.isActive, true),
          sql`${fyhProducts.stockQty} <= ${fyhProducts.reorderLevel}`,
        ),
      );
    lowStockProducts = Number(row?.total ?? 0);
  } catch {
    lowStockProducts = 0;
  }

  try {
    const scheduleRows = await hairDb
      .select({
        id: fyhAppointments.id,
        startAt: fyhAppointments.startAt,
        customerName: fyhCustomers.fullName,
        staffName: fyhStaff.fullName,
        status: fyhAppointments.status,
      })
      .from(fyhAppointments)
      .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhAppointments.customerId))
      .innerJoin(fyhStaff, eq(fyhStaff.id, fyhAppointments.staffId))
      .where(and(gte(fyhAppointments.startAt, start), lt(fyhAppointments.startAt, end)))
      .orderBy(asc(fyhAppointments.startAt))
      .limit(20);

    todaysSchedule = await Promise.all(
      scheduleRows.map(async (r) => {
        const services = await hairDb
          .select({ name: fyhAppointmentServices.nameSnapshot })
          .from(fyhAppointmentServices)
          .where(eq(fyhAppointmentServices.appointmentId, r.id));
        return {
          id: r.id,
          timeLabel: formatHm(r.startAt, timezone),
          customerName: r.customerName,
          serviceLabel: services.map((s) => s.name).join(', ') || '—',
          staffName: r.staffName,
          status: r.status,
        };
      }),
    );
  } catch {
    todaysSchedule = [];
  }

  try {
    const upcomingRows = await hairDb
      .select({
        id: fyhAppointments.id,
        startAt: fyhAppointments.startAt,
        customerName: fyhCustomers.fullName,
      })
      .from(fyhAppointments)
      .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhAppointments.customerId))
      .where(
        and(
          gte(fyhAppointments.startAt, now),
          notInArray(fyhAppointments.status, [...TERMINAL]),
        ),
      )
      .orderBy(asc(fyhAppointments.startAt))
      .limit(8);

    upcomingAppointments = await Promise.all(
      upcomingRows.map(async (r) => {
        const services = await hairDb
          .select({ name: fyhAppointmentServices.nameSnapshot })
          .from(fyhAppointmentServices)
          .where(eq(fyhAppointmentServices.appointmentId, r.id));
        return {
          id: r.id,
          whenLabel: formatWhen(r.startAt, timezone),
          customerName: r.customerName,
          serviceLabel: services.map((s) => s.name).join(', ') || '—',
        };
      }),
    );
  } catch {
    upcomingAppointments = [];
  }

  try {
    const billRows = await hairDb
      .select({
        id: fyhInvoices.id,
        customerName: fyhCustomers.fullName,
        amountPaise: fyhInvoices.grandTotalPaise,
        status: fyhInvoices.status,
        createdAt: fyhInvoices.createdAt,
      })
      .from(fyhInvoices)
      .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
      .orderBy(desc(fyhInvoices.createdAt))
      .limit(8);

    recentBills = billRows.map((b) => ({
      id: b.id,
      customerName: b.customerName,
      amountPaise: b.amountPaise,
      status: b.status,
      createdAtLabel: formatWhen(b.createdAt, timezone),
    }));
  } catch {
    recentBills = [];
  }

  return {
    todayRevenuePaise: todayRevenuePaiseValue,
    todayAppointments,
    customersInSalon,
    pendingPayments,
    staffWorking,
    lowStockProducts,
    totalCustomers,
    todaysSchedule,
    upcomingAppointments,
    recentBills,
  };
}
