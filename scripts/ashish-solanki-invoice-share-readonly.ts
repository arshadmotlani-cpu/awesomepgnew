/* eslint-disable no-console */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('ashish-solanki-invoice-share-readonly.ts');

import { closeDb, db } from '../src/db/client';
import { eq } from 'drizzle-orm';
import { bookings, customers, financialInvoices, paymentLinks } from '../src/db/schema';
import { getInvoiceDocumentDetail } from '../src/lib/billing/invoiceDocumentModel';
import { ensureInvoiceShareToken } from '../src/lib/billing/invoiceShareToken';
import { buildInvoicePublicUrl } from '../src/lib/billing/sendInvoiceOnWhatsApp';
import { paymentLinkPublicUrl } from '../src/lib/billing/paymentLinkUrl';
import { CANONICAL_PRODUCTION_URL } from '../src/lib/url';

const CUSTOMER_ID = 'f6b4c2d0-bf32-496b-af79-bd66235072cd';

async function main() {
  const [c] = await db.select().from(customers).where(eq(customers.id, CUSTOMER_ID)).limit(1);
  const invs = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.customerId, CUSTOMER_ID));

  console.log('Customer:', c?.fullName, c?.phone);

  for (const inv of invs) {
    const token = inv.shareToken ?? (await ensureInvoiceShareToken(inv.id));
    const invoiceUrl = buildInvoicePublicUrl(token, CANONICAL_PRODUCTION_URL);
    const payUrl = inv.paymentLinkId
      ? paymentLinkPublicUrl(inv.paymentLinkId, CANONICAL_PRODUCTION_URL)
      : null;
    const doc = await getInvoiceDocumentDetail(inv.id);
    console.log('\n--- Invoice ---');
    console.log({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      amountPaise: inv.amountPaise,
      status: inv.status,
      shareToken: token,
      INVOICE_LINK: invoiceUrl,
      PAYMENT_LINK: payUrl,
      sentAt: inv.sentAt,
      dueDate: inv.dueDate,
      notes: inv.notes,
      breakdown: inv.breakdown,
    });
    if (doc) {
      console.log('Document model:', {
        customerName: doc.customerName,
        customerPhone: doc.customerPhone,
        totalPaise: doc.totals.totalPaise,
        balanceDuePaise: doc.totals.balanceDuePaise,
        lineCount: doc.lines?.length ?? 0,
        lines: doc.lines,
      });
    }
  }

  const bks = await db.select().from(bookings).where(eq(bookings.customerId, CUSTOMER_ID));
  console.log(
    '\nBookings:',
    bks.map((b) => ({
      id: b.id,
      code: b.bookingCode,
      subtotalPaise: b.subtotalPaise,
      checkout: b.expectedCheckoutDate,
    })),
  );

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
