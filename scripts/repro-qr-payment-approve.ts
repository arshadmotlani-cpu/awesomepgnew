/* eslint-disable no-console */
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
  pgPaymentCategories,
  pgPaymentRecords,
  pgs,
  rooms,
} from '../src/db/schema';
import type { AdminSession } from '../src/lib/auth/session';
import { reviewPaymentRecord } from '../src/services/qrPayments';
import { getNextPendingPaymentReviewKey } from '../src/services/paymentProofQueue';

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

async function findFreeBed(pgId: string) {
  const occupied = await db
    .select({ bedId: bedReservations.bedId })
    .from(bedReservations)
    .where(sql`${bedReservations.status} IN ('active', 'hold')`);
  const occupiedIds = occupied.map((r) => r.bedId);
  const [bed] = await db
    .select({ id: beds.id })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(
      and(
        eq(floors.pgId, pgId),
        isNull(beds.archivedAt),
        eq(beds.status, 'available'),
        occupiedIds.length > 0 ? notInArray(beds.id, occupiedIds) : sql`true`,
      ),
    )
    .limit(1);
  if (!bed) throw new Error('No free bed');
  return bed.id;
}

async function main() {
  const [pg] = await db.select({ id: pgs.id }).from(pgs).limit(1);
  if (!pg) throw new Error('No PG');

  const [category] = await db
    .select({ id: pgPaymentCategories.id })
    .from(pgPaymentCategories)
    .where(eq(pgPaymentCategories.pgId, pg.id))
    .limit(1);
  if (!category) throw new Error('No payment category');

  const ts = Date.now();
  const [customer] = await db
    .insert(customers)
    .values({
      fullName: `QR Repro ${ts}`,
      email: `qr-repro-${ts}@test.local`,
      phone: `+9188${String(ts).slice(-8)}`,
      gender: 'male',
      kycStatus: 'approved',
    })
    .returning({ id: customers.id });

  const bedId = await findFreeBed(pg.id);
  const totalPaise = 15_000_00;
  const depositPaise = 10_000_00;

  const [booking] = await db
    .insert(bookings)
    .values({
      customerId: customer!.id,
      bookingCode: `QR-REPRO-${ts}`,
      status: 'pending_payment',
      durationMode: 'open_ended',
      stayType: 'monthly_stay',
      subtotalPaise: 5_000_00,
      depositPaise,
      totalPaise,
      pricingSnapshot: {
        perBed: [
          {
            bedId,
            dailyRatePaise: 200_00,
            weeklyRatePaise: 1200_00,
            monthlyRatePaise: 5_000_00,
            securityDepositPaise: depositPaise,
            durationMode: 'open_ended',
            units: 1,
            lineTotalPaise: 5_000_00,
          },
        ],
        computedAt: new Date().toISOString(),
      },
    })
    .returning({ id: bookings.id, bookingCode: bookings.bookingCode });

  await db.insert(bedReservations).values({
    bookingId: booking!.id,
    bedId,
    stayRange: sql`daterange('2026-08-01'::date, NULL, '[)')` as unknown as string,
    kind: 'primary',
    status: 'hold',
    holdExpiresAt: new Date(Date.now() + 86_400_000),
  });

  const [record] = await db
    .insert(pgPaymentRecords)
    .values({
      pgId: pg.id,
      categoryId: category.id,
      customerId: customer!.id,
      bookingId: booking!.id,
      amountPaise: totalPaise,
      status: 'pending',
      paymentScreenshotUrl: 'https://example.com/qr-proof.png',
    })
    .returning({ id: pgPaymentRecords.id });

  const key = `qr-${record!.id}`;
  console.log('fixture', { recordId: record!.id, key, bookingCode: booking!.bookingCode });

  try {
    await reviewPaymentRecord(session, record!.id, 'approved');
    console.log('reviewPaymentRecord: OK');
  } catch (err) {
    console.error('reviewPaymentRecord THREW:', err);
    process.exitCode = 1;
    return;
  }

  try {
    const next = await getNextPendingPaymentReviewKey(session, key);
    console.log('getNextPendingPaymentReviewKey:', next);
  } catch (err) {
    console.error('getNextPendingPaymentReviewKey THREW:', err);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end?.());
