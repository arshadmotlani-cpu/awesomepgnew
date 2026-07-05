/**
 * Generated vs collected vs pending rent/electricity for Revenue Command Center.
 */

import { and, eq, inArray, ne, sql, sum } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bookings,
  customers,
  electricityInvoices,
  rentInvoices,
} from '@/src/db/schema';
import { todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';
import { collectibleResidentFilters } from '@/src/lib/billing/productionDataFilter';
import { isProductionElectricityInvoiceFilter } from '@/src/lib/billing/electricityProductionFilter';
import { addDays, formatDate, parseDate } from '@/src/lib/dates';

export type BillingRevenueMetrics = {
  rent: {
    generatedPaise: number;
    collectedPaise: number;
    pendingPaise: number;
    overduePaise: number;
  };
  electricity: {
    generatedPaise: number;
    collectedPaise: number;
    pendingPaise: number;
    overduePaise: number;
  };
  expectedRevenuePaise: number;
  collectedRevenuePaise: number;
};

export async function getBillingRevenueMetrics(
  billingMonth: string,
  collected: { rentPaise: number; electricityPaise: number },
  pending: { rentPaise: number; electricityPaise: number },
): Promise<BillingRevenueMetrics> {
  const today = todayInBillingTimezone();
  const monthStart = billingMonth.slice(0, 7) + '-01';

  const [rentGen] = await db
    .select({
      total: sql<number>`coalesce(sum(${rentInvoices.rentPaise} - ${rentInvoices.discountPaise}), 0)::bigint::int`,
    })
    .from(rentInvoices)
    .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(
      and(
        collectibleResidentFilters(),
        eq(rentInvoices.billingMonth, monthStart),
        eq(rentInvoices.isAdhoc, false),
        ne(rentInvoices.status, 'cancelled'),
      ),
    );

  const [elecGen] = await db
    .select({ total: sum(electricityInvoices.amountPaise) })
    .from(electricityInvoices)
    .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        collectibleResidentFilters(),
        isProductionElectricityInvoiceFilter(),
        eq(electricityInvoices.billingMonth, monthStart),
        ne(electricityInvoices.status, 'cancelled'),
      ),
    );

  const [rentOverdue] = await db
    .select({
      total: sql<number>`coalesce(sum(${rentInvoices.rentPaise} - ${rentInvoices.discountPaise}), 0)::bigint::int`,
    })
    .from(rentInvoices)
    .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(
      and(
        collectibleResidentFilters(),
        eq(rentInvoices.isAdhoc, false),
        inArray(rentInvoices.status, ['pending', 'overdue']),
        sql`${rentInvoices.dueDate} < ${today}::date`,
      ),
    );

  const [elecOverdue] = await db
    .select({ total: sum(electricityInvoices.amountPaise) })
    .from(electricityInvoices)
    .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        collectibleResidentFilters(),
        isProductionElectricityInvoiceFilter(),
        eq(electricityInvoices.status, 'pending'),
        sql`${electricityInvoices.dueDate} < ${today}::date`,
      ),
    );

  const rentGenerated = Number(rentGen?.total ?? 0);
  const elecGenerated = Number(elecGen?.total ?? 0);

  return {
    rent: {
      generatedPaise: rentGenerated,
      collectedPaise: collected.rentPaise,
      pendingPaise: pending.rentPaise,
      overduePaise: Number(rentOverdue?.total ?? 0),
    },
    electricity: {
      generatedPaise: elecGenerated,
      collectedPaise: collected.electricityPaise,
      pendingPaise: pending.electricityPaise,
      overduePaise: Number(elecOverdue?.total ?? 0),
    },
    expectedRevenuePaise: rentGenerated + elecGenerated,
    collectedRevenuePaise: collected.rentPaise + collected.electricityPaise,
  };
}

/** Paid invoices in the last 30 days for resident portal. */
export function isWithinLastDays(date: Date | string | null, days: number, asOf = todayInBillingTimezone()): boolean {
  if (!date) return false;
  const d = typeof date === 'string' ? date.slice(0, 10) : formatDate(date);
  const cutoff = formatDate(addDays(parseDate(asOf), -days));
  return d >= cutoff;
}
