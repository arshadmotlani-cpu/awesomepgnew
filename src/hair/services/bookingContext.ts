import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAppointmentServices,
  fyhAppointments,
  fyhCustomers,
  fyhInvoices,
  fyhServices,
  fyhStaff,
} from '@/src/hair/db/schema';
import { shouldHideServiceFromBillable } from '@/src/hair/lib/serviceCatalogHygiene';
import { formatSalonDisplayDate } from '@/src/hair/lib/formatSalonDate';
import { getCustomerFinancialSummary } from '@/src/hair/services/customerTimeline';
import { searchCustomersForPos } from '@/src/hair/services/quickSale';

export type BookingServiceHit = {
  id: string;
  name: string;
  category: string | null;
  code: string | null;
  durationMinutes: number;
  pricePaise: number;
};

export type CustomerVisitRow = {
  appointmentId: string;
  visitDate: string;
  displayDate: string;
  servicesLabel: string;
  staffName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amountPaise: number;
  status: string;
  paymentStatus: string;
};

export type CustomerBookingContext = {
  customer: {
    id: string;
    fullName: string;
    phone: string;
    walletBalancePaise: number;
    duePaise: number;
  };
  financial: Awaited<ReturnType<typeof getCustomerFinancialSummary>>;
  lastVisit: {
    appointmentId: string;
    date: string;
    displayDate: string;
  } | null;
};


export async function searchServicesForBooking(query: string, limit = 25): Promise<BookingServiceHit[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const pattern = `%${q}%`;

  const rows = await hairDb
    .select({
      id: fyhServices.id,
      name: fyhServices.name,
      category: fyhServices.category,
      code: fyhServices.code,
      durationMinutes: fyhServices.durationMinutes,
      pricePaise: fyhServices.pricePaise,
    })
    .from(fyhServices)
    .where(
      and(
        eq(fyhServices.isActive, true),
        or(
          ilike(fyhServices.name, pattern),
          ilike(fyhServices.category, pattern),
          ilike(fyhServices.code, pattern),
          ilike(fyhServices.description, pattern),
        ),
      ),
    )
    .orderBy(asc(fyhServices.name))
    .limit(limit);

  return rows
    .filter((s) => !shouldHideServiceFromBillable(s.name, s.code))
    .map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      code: s.code,
      durationMinutes: s.durationMinutes,
      pricePaise: s.pricePaise,
    }));
}

export async function getCustomerBookingContext(customerId: string): Promise<CustomerBookingContext> {
  const [customer] = await hairDb
    .select({
      id: fyhCustomers.id,
      fullName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
      walletBalancePaise: fyhCustomers.walletBalancePaise,
    })
    .from(fyhCustomers)
    .where(eq(fyhCustomers.id, customerId))
    .limit(1);

  if (!customer) throw new Error('Customer not found');

  const financial = await getCustomerFinancialSummary(customerId);

  const [lastRow] = await hairDb
    .select({
      id: fyhAppointments.id,
      startAt: fyhAppointments.startAt,
    })
    .from(fyhAppointments)
    .where(
      and(
        eq(fyhAppointments.customerId, customerId),
        sql`${fyhAppointments.status} IN ('completed', 'paid')`,
      ),
    )
    .orderBy(desc(fyhAppointments.startAt))
    .limit(1);

  const lastVisit = lastRow
    ? {
        appointmentId: lastRow.id,
        date: lastRow.startAt.toISOString().slice(0, 10),
        displayDate: formatSalonDisplayDate(lastRow.startAt.toISOString().slice(0, 10)),
      }
    : null;

  return {
    customer: {
      id: customer.id,
      fullName: customer.fullName,
      phone: customer.phone,
      walletBalancePaise: financial.walletPaise,
      duePaise: financial.duePaise,
    },
    financial,
    lastVisit,
  };
}

export async function getCustomerVisitHistory(
  customerId: string,
  limit = 30,
): Promise<CustomerVisitRow[]> {
  const rows = await hairDb
    .select({
      appointmentId: fyhAppointments.id,
      startAt: fyhAppointments.startAt,
      status: fyhAppointments.status,
      staffName: fyhStaff.fullName,
      invoiceId: fyhAppointments.invoiceId,
      invoiceNumber: fyhInvoices.invoiceNumber,
      invoiceStatus: fyhInvoices.status,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
    })
    .from(fyhAppointments)
    .innerJoin(fyhStaff, eq(fyhStaff.id, fyhAppointments.staffId))
    .leftJoin(fyhInvoices, eq(fyhInvoices.id, fyhAppointments.invoiceId))
    .where(
      and(
        eq(fyhAppointments.customerId, customerId),
        sql`${fyhAppointments.status} IN ('completed', 'paid', 'booked', 'confirmed', 'arrived', 'in_service')`,
      ),
    )
    .orderBy(desc(fyhAppointments.startAt))
    .limit(limit);

  const result: CustomerVisitRow[] = [];

  for (const row of rows) {
    const services = await hairDb
      .select({ nameSnapshot: fyhAppointmentServices.nameSnapshot })
      .from(fyhAppointmentServices)
      .where(eq(fyhAppointmentServices.appointmentId, row.appointmentId))
      .orderBy(asc(fyhAppointmentServices.sortOrder));

    const dayIso = row.startAt.toISOString().slice(0, 10);
    const paymentStatus =
      row.invoiceStatus === 'paid'
        ? 'Paid'
        : row.invoiceStatus === 'partial'
          ? 'Partial'
          : row.invoiceStatus
            ? row.invoiceStatus
            : row.status === 'paid'
              ? 'Paid'
              : 'Unpaid';

    result.push({
      appointmentId: row.appointmentId,
      visitDate: dayIso,
      displayDate: formatSalonDisplayDate(dayIso),
      servicesLabel: services.map((s) => s.nameSnapshot).join(' + ') || 'Appointment',
      staffName: row.staffName,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      amountPaise: row.grandTotalPaise ?? 0,
      status: row.status,
      paymentStatus,
    });
  }

  return result;
}

export { searchCustomersForPos };
