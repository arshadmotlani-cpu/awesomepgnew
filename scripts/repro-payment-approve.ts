/* eslint-disable no-console */
/**
 * Reproduce payment proof approval server-action path locally.
 * Usage: DATABASE_URL=postgres://... npx tsx scripts/repro-payment-approve.ts
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
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

async function ensureFixture() {
  const [pg] = await db.select().from(pgs).limit(1);
  if (!pg) throw new Error('No PG in database — seed data first.');

  let customerId: string;
  const [existingCustomer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.phone, '+919999990001'))
    .limit(1);
  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const [c] = await db
      .insert(customers)
      .values({
        fullName: 'Payment Repro Resident',
        email: 'repro-pay@test.local',
        phone: '+919999990001',
        gender: 'male',
        kycStatus: 'approved',
      })
      .returning({ id: customers.id });
    customerId = c!.id;
  }

  const [floor] = await db.select().from(floors).where(eq(floors.pgId, pg.id)).limit(1);
  if (!floor) throw new Error('No floor for PG');

  const [room] = await db.select().from(rooms).where(eq(rooms.floorId, floor.id)).limit(1);
  if (!room) throw new Error('No room');

  const [bed] = await db.select().from(beds).where(eq(beds.roomId, room.id)).limit(1);
  if (!bed) throw new Error('No bed');

  const [booking] = await db
    .insert(bookings)
    .values({
      customerId,
      bookingCode: `REPRO-${Date.now()}`,
      status: 'confirmed',
      durationMode: 'open_ended',
      stayType: 'monthly_stay',
      subtotalPaise: 10_000_00,
      depositPaise: 10_000_00,
      totalPaise: 10_000_00,
      pricingSnapshot: {
        perBed: [
          {
            bedId: bed.id,
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
    bedId: bed.id,
    stayRange: `[2026-01-01,)` as unknown as string,
    kind: 'primary',
    status: 'active',
  });

  const [invoice] = await db
    .insert(rentInvoices)
    .values({
      bookingId: booking!.id,
      customerId,
      bedId: bed.id,
      pgId: pg.id,
      invoiceNumber: `REPRO-RENT-${Date.now()}`,
      billingMonth: '2026-07-01',
      rentPaise: 10_000_00,
      dueDate: '2026-07-05',
      status: 'pending',
      paymentProofUrl: 'https://example.com/proof.png',
    })
    .returning({ id: rentInvoices.id });

  return { pgId: pg.id, invoiceId: invoice!.id };
}

async function main() {
  const { pgId, invoiceId } = await ensureFixture();
  console.log('Fixture invoice', invoiceId);

  try {
    const approveResult = await approveRentPaymentProof(session, invoiceId);
    console.log('approveRentPaymentProof result:', approveResult);
    if (!approveResult.ok) {
      process.exitCode = 1;
      return;
    }
    const nextKey = await getNextPendingPaymentReviewKey(session, `rent-${invoiceId}`);
    console.log('getNextPendingPaymentReviewKey result:', nextKey);
  } catch (err) {
    console.error('THREW (would cause unexpected server response):', err);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end?.());
