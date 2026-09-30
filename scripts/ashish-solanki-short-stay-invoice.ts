/* eslint-disable no-console */
/**
 * One-time short-stay invoice + payment link for Ashish Solanki (9870025033).
 *
 *   npx tsx scripts/ashish-solanki-short-stay-invoice.ts --lookup-only
 *   npx tsx scripts/ashish-solanki-short-stay-invoice.ts --apply
 *
 * Uses SSOT: mergeOrUpsertCustomerForAdminWalkIn, createBooking (admin),
 * createResidentCharge (rent_charge) with explicit amount.
 */
import { and, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('ashish-solanki-short-stay-invoice.ts');

import { closeDb, db } from '../src/db/client';
import {
  adminUsers,
  bedReservations,
  beds,
  bookings,
  customers,
  financialInvoices,
  floors,
  paymentLinks,
  pgs,
  rentInvoices,
  rooms,
} from '../src/db/schema';
import { diffDays } from '../src/lib/dates';
import { normaliseIndianPhone } from '../src/lib/phone';
import { paymentLinkPublicUrl } from '../src/lib/billing/paymentLinkUrl';
import { CANONICAL_PRODUCTION_URL } from '../src/lib/url';
import { isBedInventoryAvailable } from '../src/lib/inventoryBlocking';
import { reconcileOrphanBedReservations } from '../src/lib/occupancySync';
import { mergeOrUpsertCustomerForAdminWalkIn } from '../src/services/adminCustomerMerge';
import { isBedAvailable } from '../src/services/availability';
import { clearBedAdminMarks } from '../src/services/bookingAdminOps';
import { createBooking } from '../src/services/booking';
import { createResidentCharge } from '../src/services/residentCharges';
import { quoteAdminTenantAssignment } from '../src/services/pricing';

const RESIDENT_NAME = 'Ashish Solanki';
const PHONE_RAW = '9870025033';
const CHECK_IN = '2026-09-10';
const CHECK_OUT = '2026-09-26';
const BED_COUNT = 4;
const DAILY_RATE_PAISE = 30_000; // ₹300
const CHARGEABLE_DAYS = diffDays(CHECK_IN, CHECK_OUT);
const PER_BED_STAY_TOTAL_PAISE = DAILY_RATE_PAISE * CHARGEABLE_DAYS; // 480_000
const EXPECTED_TOTAL_PAISE = PER_BED_STAY_TOTAL_PAISE * BED_COUNT; // 1_920_000

const APPLY = process.argv.includes('--apply');
const LOOKUP_ONLY = process.argv.includes('--lookup-only') || !APPLY;

async function getSuperAdminId(): Promise<string> {
  const [admin] = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.role, 'super_admin'))
    .limit(1);
  if (!admin) throw new Error('No super_admin found');
  return admin.id;
}

async function lookupResident() {
  const phone = normaliseIndianPhone(PHONE_RAW);
  const digits = PHONE_RAW.replace(/\D/g, '');

  const rows = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      phone: customers.phone,
      email: customers.email,
    })
    .from(customers)
    .where(
      or(
        phone ? eq(customers.phone, phone) : sql`false`,
        ilike(customers.phone, `%${digits.slice(-10)}%`),
        ilike(customers.fullName, '%ashish%solanki%'),
      ),
    );

  return { phone, rows };
}

async function lookupBookings(customerIds: string[]) {
  if (customerIds.length === 0) return [];
  return db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      expectedCheckout: bookings.expectedCheckoutDate,
      status: bookings.status,
      isTest: bookings.isTest,
      subtotalPaise: bookings.subtotalPaise,
      stayStart: sql<string>`lower(${bedReservations.stayRange})`.as('stay_start'),
    })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .where(
      and(
        inArray(bookings.customerId, customerIds),
        eq(bookings.isTest, false),
        eq(bedReservations.kind, 'primary'),
        sql`lower(${bedReservations.stayRange})::date = ${CHECK_IN}::date`,
      ),
    );
}

async function lookupInvoicesForBookings(bookingIds: string[]) {
  if (bookingIds.length === 0) {
    return { rent: [] as typeof rentInvoices.$inferSelect[], financial: [] as typeof financialInvoices.$inferSelect[], links: [] as typeof paymentLinks.$inferSelect[] };
  }
  const rent = await db.select().from(rentInvoices).where(inArray(rentInvoices.bookingId, bookingIds));
  const financial = await db
    .select()
    .from(financialInvoices)
    .where(inArray(financialInvoices.bookingId, bookingIds));
  const linkIds = financial.map((f) => f.paymentLinkId).filter(Boolean) as string[];
  const links =
    linkIds.length > 0
      ? await db.select().from(paymentLinks).where(inArray(paymentLinks.id, linkIds))
      : [];
  return { rent, financial, links };
}

async function findFourAvailableBeds(): Promise<{ pgName: string; roomNumber: string; bedIds: string[] } | null> {
  const candidates = await db.execute<{
    bed_id: string;
    room_number: string;
    pg_name: string;
    room_id: string;
  }>(sql`
    SELECT b.id::text AS bed_id, r.room_number, p.name AS pg_name, r.id::text AS room_id
    FROM beds b
    JOIN rooms r ON r.id = b.room_id AND r.archived_at IS NULL
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id AND p.archived_at IS NULL
    WHERE b.archived_at IS NULL AND b.status = 'available'
    ORDER BY p.name, r.room_number, b.bed_code
  `);

  const picked: typeof candidates = [];

  for (const row of candidates) {
    if (picked.length >= BED_COUNT) break;
    if (
      !(await isBedInventoryAvailable({
        bedId: row.bed_id,
        startDate: CHECK_IN,
        endDate: CHECK_OUT,
      }))
    ) {
      continue;
    }
    await clearBedAdminMarks(row.bed_id);
    await reconcileOrphanBedReservations(row.bed_id);
    if (
      !(await isBedAvailable({
        bedId: row.bed_id,
        startDate: CHECK_IN,
        endDate: CHECK_OUT,
      }))
    ) {
      continue;
    }
    picked.push(row);
  }

  if (picked.length < BED_COUNT) return null;

  const first = picked[0]!;
  const sameRoom = picked.every((p) => p.room_id === first.room_id);
  return {
    pgName: first.pg_name,
    roomNumber: sameRoom ? first.room_number : `${first.room_number} (+multi)`,
    bedIds: picked.map((p) => p.bed_id),
  };
}

async function reportLookup() {
  console.log('=== Expected billing ===');
  console.log({
    chargeableDays: CHARGEABLE_DAYS,
    calculation: `${BED_COUNT} × ₹${DAILY_RATE_PAISE / 100}/bed/day × ${CHARGEABLE_DAYS} days`,
    expectedTotalPaise: EXPECTED_TOTAL_PAISE,
    expectedTotalInr: EXPECTED_TOTAL_PAISE / 100,
  });

  const { phone, rows } = await lookupResident();
  console.log('\n=== Resident lookup ===');
  console.log({ normalizedPhone: phone, matches: rows });

  const bookingRows = await lookupBookings(rows.map((r) => r.id));
  console.log('\n=== Bookings (check-in', CHECK_IN, ') ===');
  console.log(bookingRows);

  const { rent, financial, links } = await lookupInvoicesForBookings(bookingRows.map((b) => b.id));
  console.log('\n=== Rent invoices ===');
  for (const inv of rent) {
    console.log({
      id: inv.id,
      number: inv.invoiceNumber,
      bookingId: inv.bookingId,
      rentPaise: inv.rentPaise,
      status: inv.status,
      billingMonth: inv.billingMonth,
    });
  }
  console.log('\n=== Financial invoices ===');
  for (const inv of financial) {
    console.log({
      id: inv.id,
      number: inv.invoiceNumber,
      bookingId: inv.bookingId,
      totalPaise: inv.amountPaise,
      status: inv.status,
      paymentLinkId: inv.paymentLinkId,
    });
  }
  console.log('\n=== Payment links ===');
  for (const link of links) {
    console.log({
      id: link.id,
      status: link.status,
      amountPaise: link.amount,
      url: paymentLinkPublicUrl(link.id, CANONICAL_PRODUCTION_URL),
      bookingId: link.bookingId,
    });
  }

  const correctInvoice = rent.find((r) => r.rentPaise === EXPECTED_TOTAL_PAISE);
  const correctFin = financial.find((f) => f.amountPaise === EXPECTED_TOTAL_PAISE);
  return { rows, bookingRows, correctInvoice, correctFin, links, rent, financial };
}

function productionPaymentUrl(linkId: string): string {
  return paymentLinkPublicUrl(linkId, CANONICAL_PRODUCTION_URL);
}

async function applyFlow(actorId: string) {
  const state = await reportLookup();
  if (state.correctFin?.paymentLinkId) {
    const link = state.links.find((l) => l.id === state.correctFin!.paymentLinkId);
    if (link && link.status === 'active') {
      console.log('\n=== Reusing existing invoice + link (no writes) ===');
      console.log({
        customerId: state.rows[0]?.id,
        bookingId: state.correctFin.bookingId,
        invoiceId: state.correctFin.id,
        invoiceNumber: state.correctFin.invoiceNumber,
        paymentLinkUrl: productionPaymentUrl(link.id),
      });
      return;
    }
  }

  if (state.correctInvoice && state.links.length > 0) {
    const link = state.links.find((l) => l.amountPaise === EXPECTED_TOTAL_PAISE && l.status === 'active');
    if (link) {
      console.log('\n=== Reusing existing invoice + link (no writes) ===');
      console.log({
        customerId: state.rows[0]?.id,
        bookingId: state.correctInvoice.bookingId,
        invoiceId: state.correctInvoice.id,
        invoiceNumber: state.correctInvoice.invoiceNumber,
        paymentLinkUrl: paymentLinkPublicUrl(link.id),
      });
      return;
    }
  }

  let customerId = state.rows[0]?.id;
  if (!customerId) {
    const upsert = await mergeOrUpsertCustomerForAdminWalkIn({
      fullName: RESIDENT_NAME,
      phone: PHONE_RAW,
      gender: 'male',
      adminVerifiedKyc: true,
    });
    if (!upsert.ok) throw new Error(upsert.error);
    customerId = upsert.customerId;
    console.log('\nCreated/merged customer:', upsert);
  }

  let bookingId = state.bookingRows.find(
    (b) =>
      b.status === 'confirmed' &&
      String(b.expectedCheckout).slice(0, 10) === CHECK_OUT,
  )?.id;

  if (!bookingId) {
    const bedsPick = await findFourAvailableBeds();
    if (!bedsPick) {
      throw new Error('Could not find 4 beds available for ' + CHECK_IN + ' → ' + CHECK_OUT);
    }
    console.log('\nSelected beds:', bedsPick);

    const quote = await quoteAdminTenantAssignment({
      bedIds: bedsPick.bedIds,
      startDate: CHECK_IN,
      endDate: CHECK_OUT,
      durationMode: 'daily',
      includeDeposit: true,
      customMonthlyRatePaise: PER_BED_STAY_TOTAL_PAISE,
      customDepositPaise: 0,
    });
    if (quote.subtotalPaise !== EXPECTED_TOTAL_PAISE) {
      throw new Error(
        `Quote mismatch: got ${quote.subtotalPaise}, expected ${EXPECTED_TOTAL_PAISE}`,
      );
    }

    const phone = normaliseIndianPhone(PHONE_RAW)!;
    const created = await createBooking({
      bedIds: bedsPick.bedIds,
      startDate: CHECK_IN,
      endDate: CHECK_OUT,
      durationMode: 'daily',
      customer: {
        fullName: RESIDENT_NAME,
        email: `walkin+${phone.replace(/\D/g, '')}@residents.awesomepg.in`,
        phone,
        gender: 'male',
      },
      customerId,
      createdVia: 'admin',
      createdByAdminId: actorId,
      customMonthlyRatePaise: PER_BED_STAY_TOTAL_PAISE,
      customDepositPaise: 0,
    });
    if (!created.ok) throw new Error(`createBooking: ${created.message}`);
    bookingId = created.bookingId;
    console.log('\nCreated booking:', created);
  }

  const existingRent = await db
    .select()
    .from(rentInvoices)
    .where(and(eq(rentInvoices.bookingId, bookingId), eq(rentInvoices.rentPaise, EXPECTED_TOTAL_PAISE)));

  if (existingRent.length > 0) {
    const inv = existingRent[0]!;
    const [fi] = await db
      .select()
      .from(financialInvoices)
      .where(
        and(
          eq(financialInvoices.sourceTable, 'rent_invoices'),
          eq(financialInvoices.sourceId, inv.id),
        ),
      )
      .limit(1);
    let url: string | null = null;
    if (fi?.paymentLinkId) {
      url = paymentLinkPublicUrl(fi.paymentLinkId);
    }
    if (url) {
      console.log('\n=== Existing rent invoice (reused) ===', {
        bookingId,
        rentInvoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        paymentLinkUrl: url,
      });
      return;
    }
  }

  const charge = await createResidentCharge({
    customerId,
    bookingId,
    chargeType: 'custom_charge',
    customKind: 'custom',
    title: `Short stay ${CHECK_IN} → ${CHECK_OUT} (${BED_COUNT} beds × ₹300/day × ${CHARGEABLE_DAYS} days)`,
    description: `Daily-rate PG stay. Checkout ${CHECK_OUT} not charged.`,
    amountPaise: EXPECTED_TOTAL_PAISE,
    dueDate: CHECK_IN,
    actorId,
  });
  if (!charge.ok) throw new Error(charge.error);

  console.log('\n=== Created charge + payment link ===');
  console.log({
    customerId,
    bookingId,
    invoiceNumber: charge.invoiceNumber,
    rentInvoiceId: charge.rentInvoiceId,
    amountPaise: charge.amountPaise,
    paymentLinkUrl: charge.paymentLinkUrl,
    linkId: charge.linkId,
  });
}

async function main() {
  if (LOOKUP_ONLY) {
    await reportLookup();
    await closeDb();
    return;
  }
  const actorId = await getSuperAdminId();
  await applyFlow(actorId);
  await reportLookup();
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});