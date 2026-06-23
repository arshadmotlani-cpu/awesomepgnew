#!/usr/bin/env npx tsx
/**
 * Production verification — Invoice Command Center daily summary for a date.
 * Usage: npx tsx scripts/verify-invoice-command-center.ts [YYYY-MM-DD]
 */
import { getInvoiceCommandCenterData } from '@/src/services/invoiceCommandCenter';
import { resolveSelectedDay } from '@/src/lib/billing/dayNavigation';
import { paiseToInr } from '@/src/lib/format';

async function main() {
  const dateArg = process.argv[2];
  const selectedDate = resolveSelectedDay(dateArg);
  const data = await getInvoiceCommandCenterData(selectedDate);

  console.log(`Invoice Command Center — ${selectedDate}\n`);
  console.log('Daily summary:');
  console.log(`  Rent collected:        ${paiseToInr(data.summary.rentCollectedPaise)}`);
  console.log(`  Reservation payments:  ${paiseToInr(data.summary.reservationPaymentsPaise)}`);
  console.log(`  Deposits collected:    ${paiseToInr(data.summary.depositsCollectedPaise)}`);
  console.log(`  Checkout deductions:   ${paiseToInr(data.summary.checkoutDeductionsPaise)}`);
  console.log(`  Refunds paid:          ${paiseToInr(data.summary.refundsPaidPaise)}`);
  console.log(`  Net revenue:           ${paiseToInr(data.summary.netRevenuePaise)}`);
  console.log(`  Invoices generated:    ${data.summary.invoicesGeneratedCount}`);
  console.log(`  Invoices paid:         ${data.summary.invoicesPaidCount}`);
  console.log(`  Invoices pending:      ${data.summary.invoicesPendingCount}`);
  console.log(`\nTimeline events: ${data.timeline.length}`);
  console.log(`Invoices for day: ${data.invoicesForDay.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
