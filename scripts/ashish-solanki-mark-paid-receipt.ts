/* eslint-disable no-console */
/**
 * Mark Ashish Solanki short-stay invoice paid (cash) + report invoice/receipt link.
 *
 *   npx tsx scripts/ashish-solanki-mark-paid-receipt.ts --lookup-only
 *   npx tsx scripts/ashish-solanki-mark-paid-receipt.ts --apply
 */
import { and, eq, inArray } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('ashish-solanki-mark-paid-receipt.ts');

import { closeDb, db } from '../src/db/client';
import {
  adminUsers,
  bedReservations,
  beds,
  bookings,
  customers,
  financialInvoices,
  paymentLinks,
  rooms,
} from '../src/db/schema';
import { buildInvoicePublicUrl } from '../src/lib/billing/sendInvoiceOnWhatsApp';
import { ensureInvoiceShareToken } from '../src/lib/billing/invoiceShareToken';
import { getInvoiceDocumentDetail } from '../src/lib/billing/invoiceDocumentModel';
import { CANONICAL_PRODUCTION_URL } from '../src/lib/url';
import { normaliseIndianPhone } from '../src/lib/phone';
import { markFinancialInvoicePaidWithCash } from '../src/services/adminCashSettlement';
import type { AdminSession } from '../src/lib/auth/session';
import { paymentLinkPublicUrl } from '../src/lib/billing/paymentLinkUrl';

const PHONE_RAW = '9870025033';
const EXPECTED_TOTAL_PAISE = 1_920_000;
const INVOICE_ID = 'c7d0f777-1f5d-421a-bf32-6f4f23284f26';

const APPLY = process.argv.includes('--apply');

async function getSuperAdminSession(): Promise<AdminSession> {
  const [admin] = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      fullName: adminUsers.fullName,
      role: adminUsers.role,
      pgScope: adminUsers.pgScope,
    })
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('No super_admin found');
  return {
    kind: 'admin',
    sessionId: 'ashish-mark-paid-receipt',
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: admin.pgScope ?? [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3600000),
  };
}

async function loadAshishContext() {
  const phone = normaliseIndianPhone(PHONE_RAW)!;
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);
  if (!customer) return null;

  const bookingRows = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      subtotalPaise: bookings.subtotalPaise,
      expectedCheckout: bookings.expectedCheckoutDate,
      status: bookings.status,
    })
    .from(bookings)
    .where(and(eq(bookings.customerId, customer.id), eq(bookings.isTest, false)));

  const bedRows = await db
    .select({
      bookingId: bedReservations.bookingId,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      bedId: beds.id,
    })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(
      and(
        inArray(
          bedReservations.bookingId,
          bookingRows.map((b) => b.id),
        ),
        eq(bedReservations.kind, 'primary'),
        eq(bedReservations.status, 'active'),
      ),
    );

  const [invoice] = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.id, INVOICE_ID))
    .limit(1);

  let paymentLink: (typeof paymentLinks.$inferSelect) | null = null;
  if (invoice?.paymentLinkId) {
    [paymentLink] = await db
      .select()
      .from(paymentLinks)
      .where(eq(paymentLinks.id, invoice.paymentLinkId))
      .limit(1);
  }

  return { customer, bookingRows, bedRows, invoice, paymentLink };
}

async function report(ctx: NonNullable<Awaited<ReturnType<typeof loadAshishContext>>>) {
  const bedsByBooking = new Map<string, typeof ctx.bedRows>();
  for (const row of ctx.bedRows) {
    const list = bedsByBooking.get(row.bookingId) ?? [];
    list.push(row);
    bedsByBooking.set(row.bookingId, list);
  }

  console.log('Resident:', ctx.customer.fullName, ctx.customer.phone);
  for (const b of ctx.bookingRows) {
    const beds = bedsByBooking.get(b.id) ?? [];
    console.log('Booking:', {
      id: b.id,
      code: b.bookingCode,
      subtotalPaise: b.subtotalPaise,
      checkout: b.expectedCheckout,
      status: b.status,
      rooms: [...new Set(beds.map((x) => x.roomNumber))],
      beds: beds.map((x) => ({ room: x.roomNumber, bed: x.bedCode })),
    });
  }

  if (ctx.invoice) {
    const token = ctx.invoice.shareToken ?? (await ensureInvoiceShareToken(ctx.invoice.id));
    const doc = await getInvoiceDocumentDetail(ctx.invoice.id);
    console.log('Invoice:', {
      id: ctx.invoice.id,
      number: ctx.invoice.invoiceNumber,
      amountPaise: ctx.invoice.amountPaise,
      status: ctx.invoice.status,
      paymentId: ctx.invoice.paymentId,
      paymentLinkId: ctx.invoice.paymentLinkId,
      paymentLinkStatus: ctx.paymentLink?.status ?? null,
      INVOICE_LINK: buildInvoicePublicUrl(token, CANONICAL_PRODUCTION_URL),
      docBalanceDue: doc?.totals.balanceDuePaise,
      docPaid: doc?.totals.paidPaise,
      docPaymentMode: doc?.payment.paymentMode,
      docPayCtaWouldShow:
        doc &&
        doc.totals.balanceDuePaise > 0 &&
        doc.status !== 'paid' &&
        Boolean(doc.payment.paymentLinkUrl),
    });
  }
}

async function main() {
  const ctx = await loadAshishContext();
  if (!ctx?.customer || !ctx.invoice) {
    console.error('Ashish or invoice not found');
    process.exit(1);
  }

  await report(ctx);

  if (!APPLY) {
    await closeDb();
    return;
  }

  if (ctx.invoice.status === 'paid' && ctx.invoice.paymentId) {
    console.log('\nInvoice already paid — no cash settlement write.');
    await report(ctx);
    await closeDb();
    return;
  }

  if (ctx.invoice.amountPaise !== EXPECTED_TOTAL_PAISE) {
    throw new Error(`Invoice amount ${ctx.invoice.amountPaise} != ${EXPECTED_TOTAL_PAISE}`);
  }

  const primaryBooking = ctx.bookingRows.find((b) => b.subtotalPaise === EXPECTED_TOTAL_PAISE);
  const beds = ctx.bedRows.filter((r) => r.bookingId === primaryBooking?.id);
  const roomNumbers = [...new Set(beds.map((b) => b.roomNumber))];
  const bedLabels = beds.map((b) => `${b.roomNumber}/${b.bedCode}`).sort();
  if (beds.length > 0) {
    const accommodationNote = `Accommodation: Room ${roomNumbers.join(', ')} · Beds ${beds.map((b) => b.bedCode).sort().join(', ')}`;
    await db
      .update(financialInvoices)
      .set({
        roomNumber: roomNumbers.length === 1 ? roomNumbers[0]! : roomNumbers.join(', '),
        notes: `PG accommodation — 4 beds · ${accommodationNote} · Paid in cash · 16 chargeable days (checkout 26 Sep not charged).`,
        updatedAt: new Date(),
      })
      .where(eq(financialInvoices.id, ctx.invoice.id));
  }

  const session = await getSuperAdminSession();
  const result = await markFinancialInvoicePaidWithCash(session, {
    financialInvoiceId: ctx.invoice.id,
    notes: 'Ashish Solanki short stay — cash collected at reception (4 beds × ₹300 × 16 days).',
    receivedAt: '2026-09-26',
  });

  if (!result.ok) throw new Error(result.error);

  if (ctx.paymentLink?.status === 'active') {
    await db
      .update(paymentLinks)
      .set({ status: 'expired' })
      .where(eq(paymentLinks.id, ctx.paymentLink.id));
    console.log('Expired active payment link:', ctx.paymentLink.id);
  }

  const refreshed = await loadAshishContext();
  if (refreshed) await report(refreshed);

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
