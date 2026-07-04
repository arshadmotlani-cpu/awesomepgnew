#!/usr/bin/env npx tsx
/**
 * End-to-end verification for payment proof rejection migrations + flows.
 *
 *   npx tsx scripts/verify-payment-proof-rejection-e2e.ts
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';

loadAppEnv();

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { and, eq } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { createClient } from '@/src/db/client';
import {
  bedReservations,
  bookings,
  pgPaymentRecords,
  paymentProofRejections,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { getDatabaseConnectionInfo } from '@/src/lib/db/env';
import { isBedAvailable } from '@/src/services/availability';
import { createBooking } from '@/src/services/booking';
import {
  getActiveRejectionForEntity,
  listActiveRejectionsForCustomer,
  rejectPaymentProof,
} from '@/src/services/paymentProofRejectionService';
import { submitBookingPaymentRecord } from '@/src/services/qrPayments';

const MIGRATION_TAGS = [
  '0099_payment_proof_rejections',
  '0100_booking_approval_action_item',
  '0100_pg_payment_screenshot_nullable',
] as const;

const adminSession: AdminSession = {
  kind: 'admin',
  sessionId: 'verify-ppr-e2e',
  adminId: '00000000-0000-4000-8000-000000000001',
  email: 'verify-ppr@awesomepg.internal',
  fullName: 'Payment Proof Rejection E2E',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 3600_000),
};

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function pickFreeBed(start: Date, end: Date): Promise<string> {
  const { beds } = await import('@/src/db/schema');
  const { db } = await import('@/src/db/client');
  const candidates = await db
    .select({ id: beds.id })
    .from(beds)
    .where(eq(beds.status, 'available'))
    .limit(64);
  for (const c of candidates) {
    if (await isBedAvailable({ bedId: c.id, startDate: start, endDate: end })) return c.id;
  }
  throw new Error('No free bed for test window');
}

async function assertMigrationsApplied(pg: ReturnType<typeof createClient>['sql']) {
  const migrations = readMigrationFiles({ migrationsFolder: 'src/db/migrations' });
  const appliedRows = await pg<{ hash: string }[]>`
    SELECT hash FROM drizzle.__drizzle_migrations
  `;
  const applied = new Set(appliedRows.map((r) => r.hash));

  for (const tag of MIGRATION_TAGS) {
    const path = `src/db/migrations/${tag}.sql`;
    const hash = sha256File(path);
    const idx = migrations.findIndex((m) => m.hash === hash);
    if (idx < 0) throw new Error(`Migration file not discovered by Drizzle: ${tag}`);
    if (!applied.has(hash)) {
      throw new Error(`Migration ${tag} registered but NOT applied (hash ${hash})`);
    }
    console.log(`[PASS] migration applied: ${tag}`);
  }
}

async function main() {
  const connection = getDatabaseConnectionInfo();
  console.log('═'.repeat(72));
  console.log('PAYMENT PROOF REJECTION E2E VERIFICATION');
  console.log('═'.repeat(72));
  console.log(`Database: ${connection.label} (${connection.host})`);

  const { db, sql: pg, close } = createClient({ max: 1 });

  try {
    await assertMigrationsApplied(pg);

    const jitter = Math.floor(Math.random() * 200) + 100;
    const start = new Date(Date.now() + jitter * 86400_000);
    const end = new Date(start.getTime() + 30 * 86400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const bedId = await pickFreeBed(start, end);

    const bookingRes = await createBooking({
      bedIds: [bedId],
      startDate: fmt(start),
      endDate: fmt(end),
      durationMode: 'monthly',
      customer: {
        fullName: 'PPR E2E Verify',
        phone: `+9199${String(Date.now()).slice(-8)}`,
        email: `ppr-e2e-${Date.now()}@verify.internal`,
        gender: 'other',
      },
    });
    if (!bookingRes.ok) throw new Error(`createBooking failed: ${bookingRes.message}`);

    const bookingCode = bookingRes.bookingCode;
    const customerId = bookingRes.customerId;
    const bookingId = bookingRes.bookingId;
    const proofUrl = `https://verify.internal/ppr-e2e/${Date.now()}.jpg`;

    console.log(`[INFO] booking ${bookingCode} customer ${customerId}`);

    const record = await submitBookingPaymentRecord({
      bookingCode,
      customerId,
      amountPaise: bookingRes.totalPaise,
      paymentScreenshotUrl: proofUrl,
    });
    console.log(`[PASS] payment proof upload: record ${record.id}`);

    const [bookingAfterUpload] = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (bookingAfterUpload?.status !== 'pending_approval') {
      throw new Error(`Expected pending_approval after upload, got ${bookingAfterUpload?.status}`);
    }
    console.log('[PASS] booking status pending_approval after upload');

    const dashboardRejections = await listActiveRejectionsForCustomer(customerId);
    console.log(`[PASS] resident dashboard query: ${dashboardRejections.length} active rejection(s)`);

    const rejectResult = await rejectPaymentProof(adminSession, {
      reviewKey: `pg_payment_record:${record.id}`,
      entityType: 'pg_payment_record',
      entityId: record.id,
      reasonCode: 'not_clear',
      residentMessage: 'Please upload a clearer payment screenshot.',
      sendWhatsApp: false,
      context: {
        customerId,
        bookingId,
        pgId: record.pgId,
      },
    });
    if (!rejectResult.ok) throw new Error(`rejectPaymentProof failed: ${rejectResult.message}`);
    console.log(`[PASS] admin rejection: rejection id ${rejectResult.rejectionId}`);

    const activeRejection = await getActiveRejectionForEntity('pg_payment_record', record.id);
    if (!activeRejection) throw new Error('Expected active rejection after admin reject');
    console.log('[PASS] active rejection visible on entity');

    const dashboardAfterReject = await listActiveRejectionsForCustomer(customerId);
    if (dashboardAfterReject.length < 1) {
      throw new Error('Resident dashboard should show active rejection after admin reject');
    }
    console.log(`[PASS] resident dashboard shows rejection banner data (${dashboardAfterReject.length})`);

    const [recordAfterReject] = await db
      .select({ screenshot: pgPaymentRecords.paymentScreenshotUrl, status: pgPaymentRecords.status })
      .from(pgPaymentRecords)
      .where(eq(pgPaymentRecords.id, record.id))
      .limit(1);
    if (recordAfterReject?.screenshot != null) {
      throw new Error('Expected payment_screenshot_url cleared (nullable) after rejection');
    }
    console.log('[PASS] screenshot cleared on rejection (nullable column)');

    const reuploadUrl = `https://verify.internal/ppr-e2e/reupload-${Date.now()}.jpg`;
    const record2 = await submitBookingPaymentRecord({
      bookingCode,
      customerId,
      amountPaise: bookingRes.totalPaise,
      paymentScreenshotUrl: reuploadUrl,
    });
    if (record2.id !== record.id) {
      throw new Error('Re-upload should update same pending pg_payment_record');
    }
    console.log('[PASS] resident re-upload on same record');

    const activeAfterReupload = await getActiveRejectionForEntity('pg_payment_record', record.id);
    if (activeAfterReupload) {
      throw new Error('Active rejection should be superseded after re-upload');
    }
    console.log('[PASS] rejection superseded after re-upload');

    const [rejectionRow] = await db
      .select({ status: paymentProofRejections.status })
      .from(paymentProofRejections)
      .where(eq(paymentProofRejections.id, rejectResult.rejectionId!))
      .limit(1);
    if (rejectionRow?.status !== 'superseded') {
      throw new Error(`Expected rejection status superseded, got ${rejectionRow?.status}`);
    }
    console.log('[PASS] rejection row status superseded in DB');

    await db
      .update(bedReservations)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.status, 'hold')));
    await db
      .update(bookings)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(bookings.id, bookingId));
    await db
      .update(pgPaymentRecords)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(pgPaymentRecords.id, record.id));

    console.log('');
    console.log('✓ PAYMENT PROOF REJECTION E2E — ALL CHECKS PASSED');
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error('✗ E2E verification failed:', err);
  process.exit(1);
});
