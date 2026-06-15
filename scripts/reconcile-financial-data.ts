/**
 * Reconcile stale financial_invoices with source rent/electricity rows.
 * Run after bulk cancellations or when overview/revenue totals look wrong.
 *
 * Usage:
 *   npx tsx scripts/reconcile-financial-data.ts
 *   npx tsx scripts/reconcile-financial-data.ts --month 2026-06-01
 */
import 'dotenv/config';
import { reconcileStaleFinancialInvoices, countDriftedFinancialInvoices } from '../src/lib/billing/financialMetrics';
import { resolveBillingMonth } from '../src/lib/dateDefaults';

async function main() {
  const monthArg = process.argv.find((a) => a.startsWith('--month='))?.split('=')[1];
  const billingMonth = monthArg ? resolveBillingMonth(monthArg) : undefined;

  const before = await countDriftedFinancialInvoices(billingMonth);
  console.log(`Drifted financial_invoices before reconcile: ${before}`);

  const result = await reconcileStaleFinancialInvoices(
    billingMonth ? { billingMonth } : undefined,
  );

  const after = await countDriftedFinancialInvoices(billingMonth);
  console.log('Reconcile result:', result);
  console.log(`Drifted financial_invoices after reconcile: ${after}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
