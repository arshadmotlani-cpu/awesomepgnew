/**
 * Exclude pipeline-test electricity rows from room math, revenue, and reconciliation.
 * Operations queues also filter these via electricityOperationsFilter.
 */
import { eq } from 'drizzle-orm';
import { electricityBills, electricityInvoices } from '@/src/db/schema';

export function isProductionElectricityBillFilter() {
  return eq(electricityBills.isPipelineTest, false);
}

export function isProductionElectricityInvoiceFilter() {
  return eq(electricityInvoices.isPipelineTest, false);
}
