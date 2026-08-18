import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAppointments,
  fyhCustomers,
  fyhInvoices,
  fyhProducts,
  fyhServices,
  fyhStaff,
} from '@/src/hair/db/schema';
import { shouldHideServiceFromBillable } from '@/src/hair/lib/serviceCatalogHygiene';
import { buildAppointmentsHref, salonDayKeyFromInstant } from '@/src/hair/lib/appointmentDate';
import { getSalonSettings } from '@/src/hair/services/settings';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export type HairSearchHit = {
  type: 'customer' | 'invoice' | 'appointment' | 'staff' | 'service' | 'product';
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export async function searchHair(query: string, limit = 20, ctx?: TenantContext | null): Promise<HairSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const settings = await getSalonSettings(ctx);
  const timezone = settings.timezone || 'Asia/Kolkata';
  const pattern = `%${q}%`;
  const hits: HairSearchHit[] = [];

  const customers = await hairDb
    .select({
      id: fyhCustomers.id,
      fullName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
    })
    .from(fyhCustomers)
    .where(
      and(
        orgFilter(fyhCustomers.organizationId, ctx),
        eq(fyhCustomers.isActive, true),
        or(ilike(fyhCustomers.fullName, pattern), ilike(fyhCustomers.phone, pattern)),
      ),
    )
    .limit(8);
  for (const c of customers) {
    hits.push({
      type: 'customer',
      id: c.id,
      title: c.fullName,
      subtitle: c.phone,
      href: `/customers/${c.id}`,
    });
  }

  const invoices = await hairDb
    .select({
      id: fyhInvoices.id,
      invoiceNumber: fyhInvoices.invoiceNumber,
      status: fyhInvoices.status,
    })
    .from(fyhInvoices)
    .where(
      and(
        orgFilter(fyhInvoices.organizationId, ctx),
        locationFilter(fyhInvoices.locationId, ctx),
        ilike(fyhInvoices.invoiceNumber, pattern),
      ),
    )
    .limit(5);
  for (const inv of invoices) {
    hits.push({
      type: 'invoice',
      id: inv.id,
      title: inv.invoiceNumber,
      subtitle: inv.status,
      href: `/billing/${inv.id}`,
    });
  }

  const appointments = await hairDb
    .select({
      id: fyhAppointments.id,
      startAt: fyhAppointments.startAt,
      status: fyhAppointments.status,
      customerName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
    })
    .from(fyhAppointments)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhAppointments.customerId))
    .where(
      and(
        orgFilter(fyhAppointments.organizationId, ctx),
        locationFilter(fyhAppointments.locationId, ctx),
        or(
          ilike(fyhCustomers.fullName, pattern),
          ilike(fyhCustomers.phone, pattern),
          sql`cast(${fyhAppointments.id} as text) ilike ${pattern}`,
        ),
      ),
    )
    .orderBy(asc(fyhAppointments.startAt))
    .limit(5);
  for (const a of appointments) {
    hits.push({
      type: 'appointment',
      id: a.id,
      title: a.customerName,
      subtitle: `${a.status} · ${a.startAt.toISOString().slice(0, 16).replace('T', ' ')} · ${a.phone}`,
      href: buildAppointmentsHref(salonDayKeyFromInstant(a.startAt, timezone)),
    });
  }

  const staff = await hairDb
    .select({ id: fyhStaff.id, fullName: fyhStaff.fullName, role: fyhStaff.role })
    .from(fyhStaff)
    .where(
      and(
        orgFilter(fyhStaff.organizationId, ctx),
        eq(fyhStaff.isActive, true),
        ilike(fyhStaff.fullName, pattern),
      ),
    )
    .limit(5);
  for (const s of staff) {
    hits.push({
      type: 'staff',
      id: s.id,
      title: s.fullName,
      subtitle: s.role ?? 'Staff',
      href: '/staff',
    });
  }

  const services = await hairDb
    .select({ id: fyhServices.id, name: fyhServices.name, code: fyhServices.code, category: fyhServices.category })
    .from(fyhServices)
    .where(
      and(
        orgFilter(fyhServices.organizationId, ctx),
        eq(fyhServices.isActive, true),
        ilike(fyhServices.name, pattern),
      ),
    )
    .limit(5);
  for (const s of services) {
    if (shouldHideServiceFromBillable(s.name, s.code)) continue;
    hits.push({
      type: 'service',
      id: s.id,
      title: s.name,
      subtitle: s.category ?? 'Service',
      href: `/services/${s.id}`,
    });
  }

  const products = await hairDb
    .select({ id: fyhProducts.id, name: fyhProducts.name })
    .from(fyhProducts)
    .where(
      and(
        orgFilter(fyhProducts.organizationId, ctx),
        eq(fyhProducts.isActive, true),
        ilike(fyhProducts.name, pattern),
      ),
    )
    .limit(5);
  for (const p of products) {
    hits.push({
      type: 'product',
      id: p.id,
      title: p.name,
      subtitle: 'Product',
      href: `/products/${p.id}`,
    });
  }

  return hits.slice(0, limit);
}
