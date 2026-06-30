/**
 * Exclude pipeline-test electricity rows from room math, revenue, and reconciliation.
 * Test invoices still appear in admin/resident UI lists.
 */
import { eq } from 'drizzle-orm';
import { electricityBills, electricityInvoices } from '@/src/db/schema';

export function isProductionElectricityBillFilter() {
  return eq(electricityBills.isPipelineTest, false);
}

export function isProductionElectricityInvoiceFilter() {
  return eq(electricityInvoices.isPipelineTest, false);
}
