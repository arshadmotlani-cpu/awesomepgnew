#!/usr/bin/env npx tsx
/**
 * Production repair: Ameet APG-2026-0122 (Room 201 B1) — reinstate after mistaken proof rejection.
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-ameet-0122-reinstate-production.ts
 *   USE_PRODUCTION_DB=1 npx tsx scripts/repair-ameet-0122-reinstate-production.ts --execute
 */
import { and, eq } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('repair-ameet-0122-reinstate-production.ts');

import { closeDb, db } from '@/src/db/client';
import { adminUsers, bookings, pgPaymentRecords } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { reinstateRejectedBookingRequest } from '@/src/lib/bookingApproval';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { loadPgElectricityBillingChecklist } from '@/src/lib/billing/pgElectricityBillingChecklist';
import { reviewPaymentRecord } from '@/src/services/qrPayments';

const execute = process.argv.includes('--execute');

const BOOKING_ID = 'e6352751-fb81-4c72-959b-0d9bcbfc0d81';
const BOOKING_CODE = 'APG-2026-0122';
const PG_PAYMENT_RECORD_ID = 'd4662da1-9d9f-4987-b65b-d8badc3cc840';
const ROOM_ID = 'dd469fbf-5eba-4ebc-b28b-d4f06ea3c8d1';
const PG_ID = '64ead929-b7a0-43a6-8ac4-cafdd398ecde';
const BILLING_MONTH = '2026-10-01';

async function findAdmin(): Promise<typeof adminUsers.$inferSelect> {
  const fromEnv = process.env.REPAIR_ADMIN_ID?.trim();
  if (fromEnv) {
    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, fromEnv)).limit(1);
    if (row) return row;
  }
  const [row] = await db
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.role, 'super_admin'), eq(adminUsers.isActive, true)))
    .limit(1);
  if (!row) throw new Error('No super_admin found. Set REPAIR_ADMIN_ID.');
  return row;
}

function adminSession(admin: typeof adminUsers.$inferSelect): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'repair-ameet-0122',
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName ?? admin.email,
    role: admin.role,
    pgScope: admin.pgScope ?? [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3600_000),
  };
}

async function snapshot(label: string) {
  const [bk] = await db.select().from(bookings).where(eq(bookings.id, BOOKING_ID)).limit(1);
  const [pay] = await db
    .select()
    .from(pgPaymentRecords)
    .where(eq(pgPaymentRecords.id, PG_PAYMENT_RECORD_ID))
    .limit(1);
  const occ = await loadRoomElectricityOccupantsForMonth({
    roomId: ROOM_ID,
    billingMonth: BILLING_MONTH,
    includeFixedStay: true,
    useProRataByActiveDays: true,
  });
  const checklist = await loadPgElectricityBillingChecklist({
    pgId: PG_ID,
    billingMonth: BILLING_MONTH,
  });
  const room201 = checklist?.rooms.find((r) => r.roomNumber === '201');
  console.log(
    `\n--- ${label} ---\n`,
    JSON.stringify(
      {
        booking: bk
          ? {
              status: bk.status,
              cancelledAt: bk.cancelledAt,
              billingAnchorDate: bk.billingAnchorDate,
            }
          : null,
        pgPayment: pay ? { status: pay.status, amountPaise: pay.amountPaise } : null,
        occupantCount: occ.occupants.length,
        occupants: occ.occupants.map((o) => ({
          customerId: o.customerId,
          name: o.customerName,
          days: o.weight,
        })),
        room201ChecklistStatus: room201?.status,
        billableOccupantCount: room201?.billableOccupantCount,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const admin = await findAdmin();
  const session = adminSession(admin);

  await snapshot('BEFORE');

  if (!execute) {
    console.log('\nDry run only. Pass --execute to reinstate + approve pending payment proof.');
    await closeDb();
    return;
  }

  const reinstate = await reinstateRejectedBookingRequest({
    bookingId: BOOKING_ID,
    reinstatedByAdminId: admin.id,
    reason: `Production repair: ${BOOKING_CODE} Room 201 B1 — resident still in room after proof rejection; restore for payment review.`,
  });
  if (!reinstate.ok) {
    throw new Error(reinstate.reason);
  }
  console.log('Reinstated:', reinstate.bookingCode);

  const review = await reviewPaymentRecord(session, PG_PAYMENT_RECORD_ID, 'approved', {
    verificationOnly: true,
    reviewMeta: {
      approvalNotes: 'Production repair: confirm tenancy after reinstate (Room 201 B1).',
    },
  });
  console.log('Payment review outcome:', review);

  await snapshot('AFTER');

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
