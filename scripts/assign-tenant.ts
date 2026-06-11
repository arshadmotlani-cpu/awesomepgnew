/**
 * Find a resident + bed and optionally assign (production ops).
 *
 *   npx tsx scripts/assign-tenant.ts "Aatif" shanti 204 2
 *   npx tsx scripts/assign-tenant.ts "Aatif" shanti 204 2 --assign
 *
 * Uses DATABASE_URL from the environment (pull prod with `vercel env pull`).
 */
import 'dotenv/config';

import { and, eq, ilike, isNull, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db/client';
import {
  bedPrices,
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rooms,
} from '../src/db/schema';
import type { AdminSession } from '../src/lib/auth/session';
import { assignTenantToBed } from '../src/services/tenantAssignment';

const bootstrapSession: AdminSession = {
  kind: 'admin',
  sessionId: 'script',
  adminId: null as unknown as string,
  email: 'script@awesomepg.internal',
  fullName: 'Assign tenant script',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  expiresAt: new Date(Date.now() + 3600_000),
};

async function main() {
  const nameQuery = process.argv[2] ?? 'Aatif';
  const pgQuery = process.argv[3] ?? 'shanti';
  const roomNumber = process.argv[4] ?? '204';
  const bedCode = process.argv[5] ?? '2';

  console.log(`Searching customer matching "${nameQuery}"…`);
  const customerRows = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      email: customers.email,
      phone: customers.phone,
      gender: customers.gender,
    })
    .from(customers)
    .where(and(isNull(customers.archivedAt), ilike(customers.fullName, `%${nameQuery}%`)))
    .limit(10);
  console.table(customerRows);

  console.log(`\nSearching bed: PG ~"${pgQuery}", room ${roomNumber}, bed ${bedCode}…`);
  const bedRows = await db
    .select({
      bedId: beds.id,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      pgName: pgs.name,
      monthlyRatePaise: sql<number>`coalesce((
        SELECT bp.monthly_rate_paise::bigint::int FROM ${bedPrices} bp
        WHERE bp.bed_id = ${beds.id}
        ORDER BY bp.effective_from DESC LIMIT 1
      ), 0)`,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        ilike(pgs.name, `%${pgQuery}%`),
        eq(rooms.roomNumber, roomNumber),
        eq(beds.bedCode, bedCode),
        isNull(beds.archivedAt),
      ),
    )
    .limit(5);
  console.table(bedRows);

  const customer = customerRows[0];
  const bed = bedRows[0];
  if (!customer || !bed) {
    console.error('Customer or bed not found — adjust search args.');
    process.exit(2);
  }

  const [active] = await db
    .select({ bookingId: bookings.id, bookingCode: bookings.bookingCode })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.customerId, customer.id),
        eq(bookings.status, 'confirmed'),
        eq(bedReservations.status, 'active'),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    )
    .limit(1);

  if (active) {
    console.log(`\nCustomer already assigned: ${active.bookingCode} (${active.bookingId})`);
    process.exit(0);
  }

  const [bedConflict] = await db
    .select({ bookingId: bookings.id, bookingCode: bookings.bookingCode })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        eq(bedReservations.bedId, bed.bedId),
        eq(bedReservations.status, 'active'),
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    )
    .limit(1);

  if (bedConflict) {
    console.log(`\nBed occupied by booking ${bedConflict.bookingCode} (${bedConflict.bookingId})`);
    process.exit(3);
  }

  const doAssign = process.argv.includes('--assign');
  if (!doAssign) {
    console.log('\nDry run only. Re-run with --assign to create the booking.');
    console.log({
      customerId: customer.id,
      bedId: bed.bedId,
      monthlyRentInr: 4080,
      depositInr: 4000,
    });
    process.exit(0);
  }

  const now = new Date();
  const startDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

  const result = await assignTenantToBed(bootstrapSession, {
    bedId: bed.bedId,
    startDate,
    customerId: customer.id,
    fullName: customer.fullName,
    email: customer.email,
    phone: customer.phone,
    gender: customer.gender,
    monthlyRentInr: 4080,
    depositInr: 4000,
    notes: 'Grandfathered deposit ₹4000 — assigned via scripts/assign-tenant.ts',
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => {});
  });
