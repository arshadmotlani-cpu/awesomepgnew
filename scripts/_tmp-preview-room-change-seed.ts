/* eslint-disable no-console */
/**
 * Disposable Preview-only fixture for Room Change QA.
 * Usage: DOTENV_CONFIG_PATH=/tmp/apg-preview-env.tmp npx tsx scripts/_tmp-preview-room-change-seed.ts
 */
import 'dotenv/config';

import { and, eq, sql } from 'drizzle-orm';
import { closeDb, createClient } from '../src/db/client';
import {
  adminUsers,
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rooms,
  vacatingRequests,
} from '../src/db/schema';
import { upsertPgEcosystemAdmin } from '@/src/lib/auth/upsertEcosystemAdminPg';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import { mergeOrUpsertCustomerForAdminWalkIn } from '@/src/services/adminCustomerMerge';
import { assignTenantToBed } from '@/src/services/tenantAssignment';
import type { AdminSession } from '@/src/lib/auth/session';

const QA_EMAIL = (process.env.DEVELOPER_TEST_EMAIL ?? 'room-change-preview-qa@awesomepg.test').trim();
const QA_NAME = 'Room Change Preview QA';
const QA_PHONE = '+919876543210';

async function ensureAdminSession(): Promise<AdminSession> {
  const { db } = createClient({ max: 1 });
  const result = await upsertPgEcosystemAdmin(db);
  if (result.action === 'skipped') {
    throw new Error(`Admin seed skipped: ${result.reason}`);
  }
  const email = process.env.ECOSYSTEM_ADMIN_EMAIL?.trim() || result.email;
  const [adminRow] = await db
    .select({ id: adminUsers.id, fullName: adminUsers.fullName })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);
  if (!adminRow) throw new Error(`Admin ${email} missing after upsert`);
  return {
    kind: 'admin',
    sessionId: 'preview-room-change-seed',
    adminId: adminRow.id,
    email,
    fullName: adminRow.fullName ?? 'Preview Admin',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86400000),
  };
}

type BedRow = {
  bedId: string;
  bedCode: string;
  roomNumber: string;
  pgId: string;
  pgSlug: string;
  pgName: string;
  monthlyRentPaise: number | null;
  depositPaise: number | null;
};

async function listOpenBeds(limit = 40): Promise<BedRow[]> {
  const { db } = createClient({ max: 1 });
  const rows = await db.execute(sql`
    SELECT b.id AS bed_id, b.bed_code, r.room_number, p.id AS pg_id, p.slug AS pg_slug, p.name AS pg_name,
           b.monthly_rent_paise, b.deposit_paise
    FROM beds b
    JOIN rooms r ON r.id = b.room_id
    JOIN floors f ON f.id = r.floor_id
    JOIN pgs p ON p.id = f.pg_id
    WHERE b.status = 'available'
      AND NOT EXISTS (
        SELECT 1 FROM bed_reservations br
        WHERE br.bed_id = b.id AND br.status = 'active'
      )
    ORDER BY p.slug, r.room_number, b.bed_code
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    bedId: String(r.bed_id),
    bedCode: String(r.bed_code),
    roomNumber: String(r.room_number),
    pgId: String(r.pg_id),
    pgSlug: String(r.pg_slug),
    pgName: String(r.pg_name),
    monthlyRentPaise: r.monthly_rent_paise != null ? Number(r.monthly_rent_paise) : null,
    depositPaise: r.deposit_paise != null ? Number(r.deposit_paise) : null,
  }));
}

async function seedOccupantOnBed(session: AdminSession, bed: BedRow, fullName: string) {
  const phone = `+9199${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  const created = await mergeOrUpsertCustomerForAdminWalkIn({
    fullName,
    phone,
    gender: 'male',
    adminVerifiedKyc: true,
  });
  if (!created.ok) throw new Error(created.error);
  const assign = await assignTenantToBed(session, {
    bedId: bed.bedId,
    startDate: new Date().toISOString().slice(0, 10),
    customerId: created.customerId,
    fullName,
    phone,
    gender: 'male',
    monthlyRentInr: 8000,
    depositInr: 8000,
    notes: 'Preview vacating occupant — disposable',
  });
  if (!assign.ok) throw new Error(`vacating occupant assign failed: ${assign.error}`);
  console.log(`Occupant ${fullName} on ${bed.roomNumber} ${bed.bedCode} booking ${assign.bookingCode}`);
}

async function ensureQaResident(session: AdminSession) {
  const { db } = createClient({ max: 1 });
  const openBeds = await listOpenBeds(60);
  if (openBeds.length < 3) {
    throw new Error(`Need at least 3 open beds on preview; found ${openBeds.length}`);
  }

  const pgSlugs = [...new Set(openBeds.map((b) => b.pgSlug))];
  console.log('Open-bed PGs:', pgSlugs.join(', '));

  const shantinagarBeds = openBeds.filter((b) => b.pgSlug.includes('shantinagar'));
  const sourceBed = shantinagarBeds[0] ?? openBeds[0];
  const immediateDest =
    openBeds.find((b) => b.bedId !== sourceBed.bedId && b.pgSlug !== sourceBed.pgSlug) ??
    openBeds.find((b) => b.bedId !== sourceBed.bedId)!;
  const scheduledDest =
    openBeds.find(
      (b) =>
        b.bedId !== sourceBed.bedId &&
        b.bedId !== immediateDest.bedId &&
        b.pgSlug !== sourceBed.pgSlug,
    ) ?? openBeds.find((b) => b.bedId !== sourceBed.bedId && b.bedId !== immediateDest.bedId)!;

  if (!scheduledDest) throw new Error('Could not pick scheduled destination bed');

  let customerId: string;
  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.email, QA_EMAIL))
    .limit(1);

  if (existing) {
    customerId = existing.id;
    console.log(`Reusing QA customer ${customerId}`);
    const tenancy = await getActiveTenancyForCustomer(customerId);
    if (tenancy?.bedId) {
      console.log(
        `Active tenancy: ${tenancy.pgName} · ${tenancy.roomNumber} · ${tenancy.bedCode} (${tenancy.bookingCode})`,
      );
      return {
        customerId,
        sourceBedId: tenancy.bedId,
        immediateDestBedId: immediateDest.bedId,
        scheduledDestBedId: scheduledDest.bedId,
        pgSlugs,
      };
    }
  } else {
    const created = await mergeOrUpsertCustomerForAdminWalkIn({
      fullName: QA_NAME,
      phone: QA_PHONE,
      email: QA_EMAIL,
      gender: 'male',
      adminVerifiedKyc: true,
    });
    if (!created.ok) throw new Error(created.error);
    customerId = created.customerId;
    console.log(`Created QA customer ${customerId}`);
  }

  const checkInDate = new Date().toISOString().slice(0, 10);
  const rentInr = Math.max(5000, Math.round((sourceBed.monthlyRentPaise ?? 800000) / 100));
  const depositInr = Math.max(rentInr, Math.round((sourceBed.depositPaise ?? 800000) / 100));

  const assign = await assignTenantToBed(session, {
    bedId: sourceBed.bedId,
    startDate: checkInDate,
    customerId,
    fullName: QA_NAME,
    email: QA_EMAIL,
    phone: QA_PHONE,
    gender: 'male',
    monthlyRentInr: rentInr,
    depositInr,
    notes: 'Preview Room Change QA fixture — disposable',
  });
  if (!assign.ok) throw new Error(`assignTenantToBed failed: ${assign.error}`);
  console.log(
    `Assigned source bed ${sourceBed.pgSlug} ${sourceBed.roomNumber} ${sourceBed.bedCode} booking ${assign.bookingCode}`,
  );

  return {
    customerId,
    sourceBedId: sourceBed.bedId,
    immediateDestBedId: immediateDest.bedId,
    scheduledDestBedId: scheduledDest.bedId,
    pgSlugs,
  };
}

async function ensureScheduledVacatingFixture(session: AdminSession, scheduledDestBedId: string) {
  const { db } = createClient({ max: 1 });

  const [destBed] = await db
    .select({
      bedId: beds.id,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      pgName: pgs.name,
      pgSlug: pgs.slug,
      pgId: pgs.id,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(beds.id, scheduledDestBedId))
    .limit(1);
  if (!destBed) throw new Error('Scheduled destination bed missing');

  const [activeOnDest] = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .where(and(eq(bedReservations.bedId, scheduledDestBedId), eq(bedReservations.status, 'active')))
    .limit(1);

  if (!activeOnDest) {
    await seedOccupantOnBed(
      session,
      {
        bedId: scheduledDestBedId,
        bedCode: destBed.bedCode,
        roomNumber: destBed.roomNumber,
        pgSlug: destBed.pgSlug,
        pgName: destBed.pgName,
        pgId: destBed.pgId,
        monthlyRentPaise: 800000,
        depositPaise: 800000,
      },
      'Vacating Preview Occupant',
    );
  }

  const [occupantRes] = await db
    .select({
      bookingId: bedReservations.bookingId,
      customerId: bookings.customerId,
      monthlyRentPaise: bookings.subtotalPaise,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(and(eq(bedReservations.bedId, scheduledDestBedId), eq(bedReservations.status, 'active')))
    .limit(1);

  if (!occupantRes) throw new Error('No occupant on scheduled destination bed');

  const vacatingDate = new Date();
  vacatingDate.setUTCDate(vacatingDate.getUTCDate() + 7);
  const vacatingDateStr = vacatingDate.toISOString().slice(0, 10);
  const noticeGivenDate = new Date().toISOString().slice(0, 10);

  const [existingVr] = await db
    .select({ id: vacatingRequests.id, status: vacatingRequests.status })
    .from(vacatingRequests)
    .where(
      and(
        eq(vacatingRequests.bookingId, occupantRes.bookingId),
        sql`${vacatingRequests.status} IN ('approved', 'pending')`,
      ),
    )
    .limit(1);

  if (existingVr?.status === 'approved') {
    console.log(`Approved vacating request already exists on scheduled dest (${existingVr.id})`);
    return { vacatingRequestId: existingVr.id, vacatingDate: vacatingDateStr };
  }

  if (existingVr) {
    await db
      .update(vacatingRequests)
      .set({ status: 'approved', vacatingDate: vacatingDateStr, updatedAt: new Date() })
      .where(eq(vacatingRequests.id, existingVr.id));
    console.log(`Approved existing vacating request ${existingVr.id} for ${vacatingDateStr}`);
    return { vacatingRequestId: existingVr.id, vacatingDate: vacatingDateStr };
  }

  const monthlyRent = occupantRes.monthlyRentPaise ?? 800000;
  const [inserted] = await db
    .insert(vacatingRequests)
    .values({
      bookingId: occupantRes.bookingId,
      customerId: occupantRes.customerId,
      noticeGivenDate,
      vacatingDate: vacatingDateStr,
      noticeCompliant: true,
      deductionPaise: 0,
      depositRefundPaise: 800000,
      monthlyRentPaiseSnapshot: monthlyRent,
      status: 'approved',
      notes: 'Preview Room Change QA scheduled transfer fixture',
      originalNoticeSubmittedAt: new Date(),
      originalVacatingDate: vacatingDateStr,
    })
    .returning({ id: vacatingRequests.id });

  console.log(`Created approved vacating request ${inserted.id} on scheduled dest for ${vacatingDateStr}`);
  return { vacatingRequestId: inserted.id, vacatingDate: vacatingDateStr };
}

async function main() {
  createClient({ max: 3 });
  const session = await ensureAdminSession();
  const fixture = await ensureQaResident(session);
  const vacating = await ensureScheduledVacatingFixture(session, fixture.scheduledDestBedId);

  const summary = {
    customerId: fixture.customerId,
    email: QA_EMAIL,
    sourceBedId: fixture.sourceBedId,
    immediateDestBedId: fixture.immediateDestBedId,
    scheduledDestBedId: fixture.scheduledDestBedId,
    pgSlugs: fixture.pgSlugs,
    vacatingRequestId: vacating.vacatingRequestId,
    vacatingDate: vacating.vacatingDate,
  };
  console.log('\n=== PREVIEW ROOM CHANGE FIXTURE ===');
  console.log(JSON.stringify(summary, null, 2));
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
