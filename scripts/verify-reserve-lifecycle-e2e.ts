/* eslint-disable no-console */
/**
 * Reserve lifecycle E2E — proof submit → admin approve → purple inventory.
 *
 * Usage: DATABASE_URL=... npx tsx scripts/verify-reserve-lifecycle-e2e.ts
 */
import 'dotenv/config';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import { bedReserveHolds, beds, bookings, customers, payments } from '../src/db/schema';
import type { AdminSession } from '../src/lib/auth/session';
import { createBedReserve } from '../src/services/bedReserve';
import { fetchBedOccupancyRows, resolveBedOccupancyRows } from '../src/services/bedOccupancyBatch';
import { isBedInventoryAvailable } from '../src/lib/inventoryBlocking';
import { reviewPaymentRecord, submitBookingPaymentRecord } from '../src/services/qrPayments';
import { addDays, todayString } from '../src/lib/dates';

const adminSession: AdminSession = {
  kind: 'admin',
  sessionId: 'reserve-e2e',
  adminId: '00000000-0000-4000-8000-000000000001',
  email: 'e2e@awesomepg.internal',
  fullName: 'Reserve E2E',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 3600_000),
};

async function pickBed(): Promise<string> {
  const start = todayString();
  const end = addDays(start, 14);
  const candidates = await db.select({ id: beds.id, bedCode: beds.bedCode }).from(beds).limit(40);
  for (const bed of candidates) {
    if (await isBedInventoryAvailable({ bedId: bed.id, startDate: start, endDate: end })) {
      return bed.id;
    }
  }
  throw new Error('No available bed for reserve window');
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const [customer] = await db.select().from(customers).limit(1);
  if (!customer) throw new Error('No customer row');

  const bedId = await pickBed();
  const reserveStart = todayString();
  const checkInDate = addDays(reserveStart, 7);

  const created = await createBedReserve({
    bedId,
    customerId: customer.id,
    reserveStart,
    checkInDate,
    customer: {
      fullName: customer.fullName,
      email: customer.email,
      phone: customer.phone,
      gender: customer.gender,
    },
  });

  console.log('1. draft created', created.bookingCode);

  const amountPaise = created.feePaise;
  const proof = await submitBookingPaymentRecord({
    bookingCode: created.bookingCode,
    customerId: customer.id,
    amountPaise,
    paymentScreenshotUrl: 'https://example.com/reserve-e2e-proof.jpg',
    transactionRef: 'E2E-RESERVE',
  });
  console.log('2. proof submitted', proof.id);

  const [holdAfterProof] = await db
    .select()
    .from(bedReserveHolds)
    .where(eq(bedReserveHolds.bookingId, created.bookingId))
    .limit(1);
  if (holdAfterProof?.status !== 'under_review') {
    throw new Error(`Expected under_review hold, got ${holdAfterProof?.status}`);
  }
  console.log('3. hold under_review', holdAfterProof.reserveCode);

  const occUnderReview = resolveBedOccupancyRows(await fetchBedOccupancyRows({ bedId }))[0];
  if (occUnderReview?.adminView.state !== 'reserved') {
    throw new Error(`Expected purple under review, got ${occUnderReview?.adminView.state}`);
  }
  console.log('4. inventory purple during review');

  await reviewPaymentRecord(adminSession, proof.id, 'approved');
  console.log('5. admin approved');

  const [bookingAfter] = await db
    .select({ status: bookings.status, durationMode: bookings.durationMode })
    .from(bookings)
    .where(eq(bookings.id, created.bookingId))
    .limit(1);
  const [holdAfter] = await db
    .select()
    .from(bedReserveHolds)
    .where(eq(bedReserveHolds.bookingId, created.bookingId))
    .limit(1);
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, created.bookingId), eq(payments.purpose, 'bed_reserve')))
    .limit(1);

  console.log('6. state', {
    bookingStatus: bookingAfter?.status,
    durationMode: bookingAfter?.durationMode,
    holdStatus: holdAfter?.status,
    holdId: holdAfter?.id,
    paymentId: payment?.id,
    approvedAt: holdAfter?.status === 'active' ? holdAfter.updatedAt.toISOString() : null,
    expiresAt: holdAfter?.holdExpiresAt,
  });

  if (holdAfter?.status !== 'active') throw new Error('Hold not active after approval');
  if (bookingAfter?.status !== 'pending_approval') throw new Error('Booking should stay pending_approval');

  const occActive = resolveBedOccupancyRows(await fetchBedOccupancyRows({ bedId }))[0];
  if (occActive?.adminView.state !== 'reserved') {
    throw new Error(`Expected purple after approval, got ${occActive?.adminView.state}`);
  }

  console.log('\nPASS — reserve lifecycle E2E');
}

main()
  .catch((err) => {
    console.error('\nFAIL', err);
    process.exit(1);
  })
  .finally(() => closeDb());
