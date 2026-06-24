/**
 * Dashboard KPI rule: financial figures come only from recorded transactions.
 *
 * - Rent / electricity revenue → paid invoices only (no QR logs, no occupancy projections,
 *   no booking-purpose payments — booking rent must appear on rent_invoices first)
 * - Deposits → deposit wallet ledger entries only (no booking snapshot pre-calculations)
 * - Extra income on overview → late fees on paid rent invoices only
 */

import { and, eq, type SQL } from 'drizzle-orm';
import { bookings, customers } from '@/src/db/schema';

export function productionInvoiceBookingFilters(): SQL {
  return and(eq(bookings.isTest, false), eq(customers.isTest, false))!;
}
