/* eslint-disable no-console */
/**
 * Generic adhoc rent invoice creator — idempotent by booking + amount + period in notes.
 *
 * Usage:
 *   npx tsx scripts/create-adhoc-rent-invoice.ts \
 *     --booking-code APG-2026-0090 \
 *     --amount-paise 220000 \
 *     --title "Daily rent" \
 *     --period-start 2026-08-31 \
 *     --period-end 2026-09-09 \
 *     --billing-month 2026-09-01
 *
 *   Add --execute to write; omit for dry-run.
 */
import { and, eq, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

import { formatAdhocRentNotes } from '../src/lib/billing/adhocRentInvoiceNotes';

async function main() {
  loadProductionAuditEnv();
  requireDatabaseUrl('create-adhoc-rent-invoice.ts');

  const bookingCode = arg('booking-code');
  const amountPaise = Number(arg('amount-paise'));
  const title = arg('title') ?? 'Adhoc rent';
  const periodStart = arg('period-start');
  const periodEnd = arg('period-end');
  const billingMonth = arg('billing-month');
  const execute = process.argv.includes('--execute');

  if (!bookingCode || !Number.isFinite(amountPaise) || amountPaise <= 0 || !periodStart || !periodEnd) {
    console.error(
      'Required: --booking-code --amount-paise --period-start --period-end [--title] [--billing-month] [--execute]',
    );
    process.exit(1);
  }

  const { db, closeDb } = await import('../src/db/client');
  const { bookings, bedReservations, beds, floors, pgs, rentInvoices, rooms } = await import(
    '../src/db/schema'
  );
  const { createAdhocRentInvoice } = await import('../src/services/rentInvoices');
  const { syncRentInvoiceToUnified, createPaymentLinkForInvoice } = await import(
 '../src/services/unifiedInvoices'
  );
  const { buildInvoicePublicUrlForInvoice } = await import('../src/lib/billing/sendInvoiceOnWhatsApp');
  const { firstOfMonth } = await import('../src/services/billing');

  const { description, notes } = formatAdhocRentNotes({
    title,
    periodStart,
    periodEnd,
    amountPaise,
  });

  const [booking] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      bedId: bedReservations.bedId,
      pgId: pgs.id,
    })
    .from(bookings)
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);

  if (!booking?.bedId || !booking.pgId) {
    console.error(`Booking not found or missing bed/pg context: ${bookingCode}`);
    process.exit(1);
  }

  const existing = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      notes: rentInvoices.notes,
      rentPaise: rentInvoices.rentPaise,
      status: rentInvoices.status,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, booking.id),
        eq(rentInvoices.isAdhoc, true),
        eq(rentInvoices.rentPaise, amountPaise),
        sql`${rentInvoices.status}::text NOT IN ('cancelled')`,
        sql`${rentInvoices.notes} LIKE ${'%' + periodStart + '%'}`,
        sql`${rentInvoices.notes} LIKE ${'%' + periodEnd + '%'}`,
      ),
    )
    .limit(1);

  console.log(
    JSON.stringify(
      {
        mode: execute ? 'execute' : 'dry-run',
        bookingCode,
        amountPaise,
        title,
        periodStart,
        periodEnd,
        billingMonth: billingMonth ?? firstOfMonth(periodEnd),
        notes,
      },
      null,
      2,
    ),
  );

  if (existing[0]) {
    console.log('Idempotent skip — matching adhoc invoice already exists:', existing[0].invoiceNumber);
    process.exit(0);
  }

  if (!execute) {
    console.log('Dry run — pass --execute to create invoice');
    await closeDb();
    process.exit(0);
  }

  const created = await createAdhocRentInvoice({
    bookingId: booking.id,
    customerId: booking.customerId,
    bedId: booking.bedId,
    pgId: booking.pgId,
    amountPaise,
    title,
    description,
    billingMonth: billingMonth ?? firstOfMonth(periodEnd),
  });

  if (!created.ok) {
    console.error('Create failed:', created.error);
    process.exit(1);
  }

  const financialInvoiceId = await syncRentInvoiceToUnified(created.invoiceId);
  if (financialInvoiceId) {
    await createPaymentLinkForInvoice(financialInvoiceId).catch((err) => {
      console.error('[adhoc-rent] payment link failed', err);
    });
    const shareUrl = await buildInvoicePublicUrlForInvoice(financialInvoiceId);
    console.log(
      JSON.stringify(
        {
          ok: true,
          rentInvoiceId: created.invoiceId,
          invoiceNumber: created.invoiceNumber,
          financialInvoiceId,
          shareUrl,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      JSON.stringify(
        {
          ok: true,
          rentInvoiceId: created.invoiceId,
          invoiceNumber: created.invoiceNumber,
          financialInvoiceId: null,
        },
        null,
        2,
      ),
    );
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
