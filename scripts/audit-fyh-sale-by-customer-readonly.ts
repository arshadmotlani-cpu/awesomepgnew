/* eslint-disable no-console */
/**
 * Read-only: find recent quick_sale invoices/lines for a customer name fragment.
 * Usage: npx tsx scripts/audit-fyh-sale-by-customer-readonly.ts --name "Arshad" --days 2
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { and, eq, gte, ilike, sql } from 'drizzle-orm';
import { createHairClient } from '@/src/hair/db/client';
import { getHairDatabaseHost } from '@/src/hair/lib/db/env';
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
  const name = arg('--name') ?? 'Arshad';
  const days = Number(arg('--days') ?? '3');
  const lineHint = arg('--line') ?? '';
  const amountPaise = arg('--amount-paise') ? Number(arg('--amount-paise')) : null;

  console.log(`Hair DB host: ${getHairDatabaseHost() ?? 'unknown'}`);
  const { db, close } = createHairClient({ max: 1 });
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      invoiceId: fyhInvoices.id,
      invoiceNumber: fyhInvoices.invoiceNumber,
      status: fyhInvoices.status,
      source: fyhInvoices.source,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
      amountPaidPaise: fyhInvoices.amountPaidPaise,
      checkoutAttemptKey: fyhInvoices.checkoutAttemptKey,
      createdAt: fyhInvoices.createdAt,
      customerName: fyhCustomers.fullName,
      customerCode: fyhCustomers.customerCode,
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
        ilike(fyhCustomers.fullName, `%${name}%`),
        gte(fyhInvoices.createdAt, since),
        lineHint ? ilike(fyhInvoiceLines.nameSnapshot, `%${lineHint}%`) : sql`true`,
      ),
    )
    .orderBy(fyhInvoices.createdAt);

  const filtered =
    amountPaise != null
      ? rows.filter((r) => Math.abs((r.grandTotalPaise ?? 0) - amountPaise) <= 10)
      : rows;

  console.log(
    JSON.stringify(
      {
        query: { name, days, lineHint, amountPaise },
        rowCount: filtered.length,
        rows: filtered.slice(0, 30),
      },
      null,
      2,
    ),
  );
  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
