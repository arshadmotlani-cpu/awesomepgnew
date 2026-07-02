/* eslint-disable no-console */
/**
 * Full payment approval repro: fixture + service path + optional HTTP server action.
 * Usage: DATABASE_URL=... npx tsx scripts/repro-payment-approve-http.ts
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rentInvoices,
  rooms,
} from '../src/db/schema';
import type { AdminSession } from '../src/lib/auth/session';
import { approveRentPaymentProof } from '../src/services/rentInvoices';
import { getNextPendingPaymentReviewKey, listPendingPaymentReviews } from '../src/services/paymentProofQueue';

const session: AdminSession = {
  kind: 'admin',
  sessionId: 'repro',
  adminId: '00000000-0000-4000-8000-000000000001',
  email: 'repro@test',
  fullName: 'Repro',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function findFreeBed() {
  const occupied = await db
    .select({ bedId: bedReservations.bedId })
    .from(bedReservations)
    .where(sql`${bedReservations.status} IN ('active', 'hold')`);

  const occupiedIds = occupied.map((r) => r.bedId);
  const [bed] = await db
    .select({ id: beds.id, roomId: beds.roomId })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        isNull(beds.archivedAt),
        eq(beds.status, 'available'),
        occupiedIds.length > 0 ? notInArray(beds.id, occupiedIds) : sql`true`,
      ),
    )
    .limit(1);
  if (!bed) throw new Error('No free bed found');
  const [ctx] = await db
    .select({ pgId: pgs.id, roomId: rooms.id })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(rooms.id, bed.roomId))
    .limit(1);
  return { bedId: bed.id, pgId: ctx!.pgId };
}

async function ensureFixture() {
  const { bedId, pgId } = await findFreeBed();
  const ts = Date.now();

  const [customer] = await db
    .insert(customers)
    .values({
      fullName: `Payment Repro ${ts}`,
      email: `repro-pay-${ts}@test.local`,
      phone: `+9199${String(ts).slice(-8)}`,
      gender: 'male',
      kycStatus: 'approved',
    })
    .returning({ id: customers.id });

  const [booking] = await db
    .insert(bookings)
    .values({
      customerId: customer!.id,
      bookingCode: `REPRO-${ts}`,
      status: 'confirmed',
      durationMode: 'open_ended',
      stayType: 'monthly_stay',
      subtotalPaise: 10_000_00,
      depositPaise: 10_000_00,
      totalPaise: 10_000_00,
      pricingSnapshot: {
        perBed: [
          {
            bedId,
            dailyRatePaise: 500_00,
            weeklyRatePaise: 3000_00,
            monthlyRatePaise: 10_000_00,
            securityDepositPaise: 10_000_00,
            durationMode: 'open_ended',
            units: 1,
            lineTotalPaise: 10_000_00,
          },
        ],
        computedAt: new Date().toISOString(),
      },
    })
    .returning({ id: bookings.id });

  await db.insert(bedReservations).values({
    bookingId: booking!.id,
    bedId,
    stayRange: sql`daterange('2026-01-01'::date, NULL, '[)')` as unknown as string,
    kind: 'primary',
    status: 'active',
  });

  const [invoice] = await db
    .insert(rentInvoices)
    .values({
      bookingId: booking!.id,
      customerId: customer!.id,
      bedId,
      pgId,
      invoiceNumber: `REPRO-RENT-${ts}`,
      billingMonth: '2026-07-01',
      rentPaise: 10_000_00,
      dueDate: '2026-07-05',
      status: 'pending',
      paymentProofUrl: 'https://example.com/proof.png',
    })
    .returning({ id: rentInvoices.id });

  return { pgId, invoiceId: invoice!.id, key: `rent-${invoice!.id}` };
}

async function main() {
  console.log('--- Step 1: list queue before ---');
  const before = await listPendingPaymentReviews(session);
  console.log('pending before:', before.length);

  const { pgId, invoiceId, key } = await ensureFixture();
  console.log('fixture', { pgId, invoiceId, key });

  console.log('--- Step 2: approve rent proof ---');
  const approveResult = await approveRentPaymentProof(session, invoiceId);
  console.log('approveRentPaymentProof:', approveResult);
  if (!approveResult.ok) process.exitCode = 1;

  console.log('--- Step 3: get next review key (post-approval server action tail) ---');
  try {
    const nextKey = await getNextPendingPaymentReviewKey(session, key);
    console.log('getNextPendingPaymentReviewKey:', nextKey);
  } catch (err) {
    console.error('THREW in getNextPendingPaymentReviewKey:', err);
    process.exitCode = 1;
  }

  console.log('--- Step 4: verify invoice paid ---');
  const [inv] = await db
    .select({ status: rentInvoices.status, paymentId: rentInvoices.paymentId })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);
  console.log('invoice after:', inv);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end?.());
