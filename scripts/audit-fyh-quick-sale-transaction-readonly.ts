/**
 * Read-only: find Quick Sale invoices for a customer/product/amount window.
 *
 * Usage:
 *   HAIR_DATABASE_URL=... npx tsx scripts/audit-fyh-quick-sale-transaction-readonly.ts \
 *     --customer-code CL00000134 --product "BIOTOP 911 MASK" --date 2026-10-11 --amount-paise 2790
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { and, eq, gte, ilike, lt, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomers,
  fyhInvoiceLines,
  fyhInvoicePayments,
  fyhInvoices,
} from '@/src/hair/db/schema';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const customerCode = arg('--customer-code');
  const product = arg('--product');
  const date = arg('--date') ?? '2026-10-11';
  const amountPaise = arg('--amount-paise') ? Number(arg('--amount-paise')) : 2790;

  const dayStart = new Date(`${date}T00:00:00+05:30`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const customerClause = customerCode
    ? eq(fyhCustomers.customerCode, customerCode)
    : sql`true`;

  const rows = await hairDb
    .select({
      invoiceId: fyhInvoices.id,
      invoiceNumber: fyhInvoices.invoiceNumber,
      status: fyhInvoices.status,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
      amountPaidPaise: fyhInvoices.amountPaidPaise,
      createdAt: fyhInvoices.createdAt,
      customerCode: fyhCustomers.customerCode,
      customerName: fyhCustomers.fullName,
      lineName: fyhInvoiceLines.nameSnapshot,
      lineTotalPaise: fyhInvoiceLines.lineTotalPaise,
      paymentMethod: fyhInvoicePayments.method,
      paymentPaise: fyhInvoicePayments.amountPaise,
    })
    .from(fyhInvoices)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhInvoices.customerId))
    .leftJoin(fyhInvoiceLines, eq(fyhInvoiceLines.invoiceId, fyhInvoices.id))
    .leftJoin(fyhInvoicePayments, eq(fyhInvoicePayments.invoiceId, fyhInvoices.id))
    .where(
      and(
        customerClause,
        eq(fyhInvoices.source, 'quick_sale'),
        gte(fyhInvoices.createdAt, dayStart),
        lt(fyhInvoices.createdAt, dayEnd),
        product ? ilike(fyhInvoiceLines.nameSnapshot, `%${product}%`) : sql`true`,
      ),
    )
    .orderBy(fyhInvoices.createdAt);

  const nearAmount = rows.filter(
    (r) => Math.abs((r.grandTotalPaise ?? 0) - amountPaise) <= 5,
  );

  console.log(
    JSON.stringify(
      {
        query: { customerCode, product, date, amountPaise },
        matchCount: rows.length,
        nearAmountCount: nearAmount.length,
        rows: nearAmount.length ? nearAmount : rows.slice(0, 20),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
