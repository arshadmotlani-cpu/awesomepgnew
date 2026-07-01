/**
 * Electricity rows shown in Operations / collections queues (not pipeline-test tooling).
 */
import { and, eq, sql } from 'drizzle-orm';
import { bookings, customers, electricityInvoices } from '@/src/db/schema';
import { isProductionElectricityInvoiceFilter } from '@/src/lib/billing/electricityProductionFilter';
import { normalizePipelineTestEmail, PIPELINE_TEST_RESIDENT_EMAIL } from '@/src/lib/billing/pipelineTestResident';

/** Production electricity invoices for real residents — excludes pipeline test + test accounts. */
export function operationsElectricityInvoiceFilter() {
  return and(
    isProductionElectricityInvoiceFilter(),
    eq(bookings.isTest, false),
    eq(customers.isTest, false),
    sql`lower(trim(${customers.email})) <> ${normalizePipelineTestEmail(PIPELINE_TEST_RESIDENT_EMAIL)}`,
  );
}
