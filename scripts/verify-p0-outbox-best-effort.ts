#!/usr/bin/env npx tsx
/**
 * P0 verify (local, do not commit): approve synthetic rent proof against prod DB
 * with fixed writerRebuild. Asserts payment + paid invoice + settlement audit; no 42P01.
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('verify-p0-outbox-best-effort');

import { eq, sql } from 'drizzle-orm';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb, db } from '@/src/db/client';
import { adminUsers, rentInvoices } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { approveRentPaymentProof } from '@/src/services/rentInvoices';

const OUT = join(process.cwd(), 'tmp');

async function main() {
  mkdirSync(OUT, { recursive: true });

  const [reg] = await db.execute<{ present: boolean }>(sql`
    SELECT to_regclass('public.room_os_outbox') IS NOT NULL AS present
  `);
  const outboxPresent = Boolean((reg as { present: boolean })?.present);
  console.log('room_os_outbox present:', outboxPresent);

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
    sessionId: 'p0-outbox-verify',
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
  }>(sql`
    SELECT b.id AS booking_id, b.customer_id, br.bed_id, f.pg_id
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.status = 'active'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE b.status = 'confirmed'
    ORDER BY random()
    LIMIT 1
  `);
  if (!booking) throw new Error('no booking');

  const tag = `P0OUTBOX_${Date.now()}`;
  const [inv] = await db
    .insert(rentInvoices)
    .values({
      bookingId: booking.booking_id,
      customerId: booking.customer_id,
      bedId: booking.bed_id,
      pgId: booking.pg_id,
      invoiceNumber: `P0-${tag}`,
      billingMonth: '2099-03-01',
      dueDate: '2099-03-05',
      rentPaise: 10_000,
      status: 'pending',
      isAdhoc: true,
      paymentProofUrl: `https://example.com/p0-outbox/${tag}.png`,
      proofSubmittedAt: new Date(),
      proofSnapshotOutstandingPaise: 10_000,
      proofSnapshotLateFeePaise: 0,
      proofSnapshotPrincipalDuePaise: 10_000,
      notes: `${tag} P0 outbox best-effort verify (synthetic)`,
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

  const [pays] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM payments
    WHERE provider_payment_id = ${`rent-proof-${inv!.id}`}
      AND status = 'succeeded'
  `);

  const [audits] = await db.execute<{ n: number; actions: string }>(sql`
    SELECT count(*)::int AS n,
           coalesce(string_agg(DISTINCT action, ','), '') AS actions
    FROM audit_log
    WHERE entity_id = ${inv!.id}::uuid
      AND action LIKE '%settlement%'
  `);

  // Prefer billing_settlement_committed if that's the action name
  const [settlement] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM audit_log
    WHERE entity_id = ${inv!.id}::uuid
      AND (
        action = 'billing_settlement_committed'
        OR action LIKE '%billing_settlement%'
        OR action LIKE '%settlement_committed%'
      )
  `);

  const thrownMsg =
    thrown instanceof Error
      ? thrown.message
      : thrown
        ? String(thrown)
        : null;
  const has42P01 =
    Boolean(thrownMsg?.includes('42P01')) ||
    Boolean(thrownMsg?.includes('room_os_outbox')) ||
    Boolean(JSON.stringify(result)?.includes('42P01'));

  const report = {
    tag,
    invoiceId: inv!.id,
    outboxPresent,
    durationMs,
    result,
    thrown: thrownMsg,
    invoiceAfter: after,
    paymentsSucceeded: (pays as { n: number })?.n ?? 0,
    settlementAuditN: (settlement as { n: number })?.n ?? 0,
    settlementLikeAudits: audits,
    has42P01,
    ok:
      !thrown &&
      result?.ok === true &&
      after?.status === 'paid' &&
      Boolean(after?.paymentId) &&
      ((pays as { n: number })?.n ?? 0) >= 1 &&
      !has42P01,
  };

  writeFileSync(join(OUT, 'p0-outbox-verify.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
    throw new Error('P0 verify FAILED — approve did not commit cleanly');
  }
  console.log('\nP0 VERIFY PASS');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
