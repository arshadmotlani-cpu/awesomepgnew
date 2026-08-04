#!/usr/bin/env npx tsx
/**
 * Reproduce production Approve failure using PRODUCTION writerRebuild code
 * (commit 19bc39a5) against production DB. Capture full stack + commit state.
 *
 * Does NOT deploy. Restores nothing — run after stashing/restoring writerRebuild externally.
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('repro-prod-approve-failure');

import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { adminUsers, rentInvoices } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { approveRentPaymentProof } from '@/src/services/rentInvoices';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'tmp');

async function main() {
  mkdirSync(OUT, { recursive: true });

  // Confirm outbox table missing (production fact)
  const [reg] = await db.execute<{ present: boolean }>(sql`
    SELECT to_regclass('public.room_os_outbox') IS NOT NULL AS present
  `);
  console.log('room_os_outbox present:', (reg as { present: boolean })?.present);

  const [admin] = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      fullName: adminUsers.fullName,
      role: adminUsers.role,
    })
    .from(adminUsers)
    .where(eq(adminUsers.email, 'admin@foryour.in'))
    .limit(1);
  if (!admin) throw new Error('admin missing');

  const session: AdminSession = {
    kind: 'admin',
    sessionId: 'repro-prod-fail',
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  const [booking] = await db.execute<{
    booking_id: string;
    customer_id: string;
    bed_id: string;
    pg_id: string;
    customer_name: string;
  }>(sql`
    SELECT b.id AS booking_id, b.customer_id, br.bed_id, f.pg_id, c.full_name AS customer_name
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.status = 'active'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE b.status = 'confirmed'
    ORDER BY random()
    LIMIT 1
  `);
  if (!booking) throw new Error('no booking');

  const tag = `REPROFAIL_${Date.now()}`;
  const [inv] = await db
    .insert(rentInvoices)
    .values({
      bookingId: booking.booking_id,
      customerId: booking.customer_id,
      bedId: booking.bed_id,
      pgId: booking.pg_id,
      invoiceNumber: `REPRO-${tag}`,
      billingMonth: '2099-02-01',
      dueDate: '2099-02-05',
      rentPaise: 10_000,
      status: 'pending',
      isAdhoc: true,
      paymentProofUrl: `https://example.com/repro-fail/${tag}.png`,
      proofSubmittedAt: new Date(),
      proofSnapshotOutstandingPaise: 10_000,
      proofSnapshotLateFeePaise: 0,
      proofSnapshotPrincipalDuePaise: 10_000,
      notes: `${tag} reproduce production approve failure`,
    })
    .returning({ id: rentInvoices.id });

  console.log('invoice', inv!.id);

  const t0 = performance.now();
  let result: Awaited<ReturnType<typeof approveRentPaymentProof>> | null = null;
  let thrown: unknown = null;
  try {
    result = await approveRentPaymentProof(session, inv!.id);
  } catch (err) {
    thrown = err;
  }
  const durationMs = Math.round((performance.now() - t0) * 10) / 10;

  const [after] = await db
    .select({
      status: rentInvoices.status,
      paymentId: rentInvoices.paymentId,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, inv!.id))
    .limit(1);

  const [pay] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM payments
    WHERE provider_payment_id = ${`rent-proof-${inv!.id}`}
  `);

  const [settlement] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM invoice_audit_events
    WHERE action = 'billing_settlement_committed'
      AND (diff->>'sourceInvoiceId') = ${inv!.id}
  `);

  const report = {
    invoiceId: inv!.id,
    durationMs,
    result,
    thrown: thrown
      ? {
          name: thrown instanceof Error ? thrown.name : typeof thrown,
          message: thrown instanceof Error ? thrown.message : String(thrown),
          stack: thrown instanceof Error ? thrown.stack : null,
          cause:
            thrown instanceof Error && thrown.cause instanceof Error
              ? { message: thrown.cause.message, stack: thrown.cause.stack }
              : thrown instanceof Error
                ? String(thrown.cause)
                : null,
          full: (() => {
            try {
              return JSON.stringify(thrown, Object.getOwnPropertyNames(thrown as object), 2);
            } catch {
              return String(thrown);
            }
          })(),
        }
      : null,
    invoiceAfter: after,
    paymentRows: Number((pay as { n: number })?.n ?? 0),
    settlementRows: Number((settlement as { n: number })?.n ?? 0),
    classification:
      after?.status === 'paid' && Number((pay as { n: number })?.n ?? 0) >= 1
        ? 'A_or_D_committed'
        : result && !result.ok
          ? 'B_or_E_rolled_back_or_failed_before_commit'
          : thrown
            ? 'thrown'
            : 'unknown',
  };

  writeFileSync(join(OUT, 'prod-approve-failure-repro.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error('TOPLEVEL', e);
    if (e instanceof Error) console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
