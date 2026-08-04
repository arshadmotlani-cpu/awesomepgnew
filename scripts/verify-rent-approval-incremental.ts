#!/usr/bin/env npx tsx
/**
 * Incremental measured approvals — one invoice per process invocation is safest,
 * but this loop reconnects lightly and continues after transient Neon timeouts.
 *
 *   PAYMENT_APPROVAL_TIMING=1 npx tsx scripts/verify-rent-approval-incremental.ts
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

process.env.PAYMENT_APPROVAL_TIMING = '1';
loadProductionAuditEnv();
requireDatabaseUrl('verify-rent-approval-incremental.ts');

import { and, eq, inArray, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import {
  adminUsers,
  auditLog,
  billingEvents,
  paymentReceipts,
  payments,
  rentInvoices,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { scheduleAfterPaymentApproval } from '@/src/lib/payments/scheduleAfterPaymentApproval';
import { approveRentPaymentProof } from '@/src/services/rentInvoices';
import { persistApprovalAllocationAfterSuccess } from '@/src/services/persistPaymentApprovalAllocation';

const TARGET = 10;
const OUT = join(process.cwd(), 'tmp');
const RESULTS = join(OUT, 'rent-approval-incremental.json');
const BILLING_MONTH = '2099-01-01';
const RENT_PAISE = 10_000;
const RUN_TAG = `OPTVERIFY_INC_${Date.now()}`;

type Row = {
  invoiceId: string;
  auth_ms: number;
  load_invoice_ms: number;
  settlement_ms: number;
  commit_ms: number;
  response_returned_ms: number;
  deferred_tasks_ms: number;
  checks: Record<string, boolean | string | number>;
  profiler: Record<string, number>;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadResults(): Row[] {
  if (!existsSync(RESULTS)) return [];
  try {
    return JSON.parse(readFileSync(RESULTS, 'utf8')).timings ?? [];
  } catch {
    return [];
  }
}

function saveResults(timings: Row[], extra: Record<string, unknown> = {}) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    RESULTS,
    JSON.stringify({ updatedAt: new Date().toISOString(), timings, ...extra }, null, 2),
  );
}

async function session(): Promise<AdminSession> {
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
  return {
    kind: 'admin',
    sessionId: `inc-${Date.now()}`,
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

async function listPending() {
  const rows = await db.execute<{ id: string; pg_id: string }>(sql`
    SELECT id, pg_id FROM rent_invoices
    WHERE notes LIKE 'OPTVERIFY_%'
      AND status = 'pending'
      AND payment_proof_url IS NOT NULL
      AND billing_month = ${BILLING_MONTH}::date
    ORDER BY created_at
    LIMIT 20
  `);
  return (Array.isArray(rows) ? rows : []) as Array<{ id: string; pg_id: string }>;
}

async function waitDeferred(invoiceId: string, timeoutMs = 20_000) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    const [row] = await db.execute<{ a: number; e: number; r: number; s: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM audit_log
          WHERE entity = 'rent_invoice' AND entity_id = ${invoiceId}::uuid
            AND action IN ('paid','partial_payment')) AS a,
        (SELECT count(*)::int FROM billing_events
          WHERE rent_invoice_id = ${invoiceId}::uuid
            AND event_type IN ('invoice.paid','invoice.partial')) AS e,
        (SELECT count(*)::int FROM payment_receipts
          WHERE rent_invoice_id = ${invoiceId}::uuid) AS r,
        (SELECT count(*)::int FROM invoice_audit_events
          WHERE action = 'billing_settlement_committed'
            AND (diff->>'sourceInvoiceId') = ${invoiceId}) AS s
    `);
    const rec = row as { a: number; e: number; r: number; s: number };
    if (Number(rec?.s) >= 1 && Number(rec?.a) >= 1 && Number(rec?.e) >= 1 && Number(rec?.r) >= 1) {
      return { ms: Math.round((performance.now() - t0) * 10) / 10, ok: true, counts: rec };
    }
    await sleep(200);
  }
  return { ms: Math.round((performance.now() - t0) * 10) / 10, ok: false, counts: null };
}

async function verify(invoiceId: string) {
  const [inv] = await db
    .select({
      status: rentInvoices.status,
      paymentId: rentInvoices.paymentId,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);
  const pays = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.providerPaymentId, `rent-proof-${invoiceId}`));
  const audits = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, 'rent_invoice'),
        eq(auditLog.entityId, invoiceId),
        inArray(auditLog.action, ['paid', 'partial_payment']),
      ),
    );
  const events = await db
    .select({ id: billingEvents.id })
    .from(billingEvents)
    .where(
      and(
        eq(billingEvents.rentInvoiceId, invoiceId),
        inArray(billingEvents.eventType, ['invoice.paid', 'invoice.partial']),
      ),
    );
  const receipts = await db
    .select({ id: paymentReceipts.id })
    .from(paymentReceipts)
    .where(eq(paymentReceipts.rentInvoiceId, invoiceId));
  const [settlement] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM invoice_audit_events
    WHERE action = 'billing_settlement_committed'
      AND (diff->>'sourceInvoiceId') = ${invoiceId}
  `);

  return {
    settlement_committed: Number((settlement as { n: number })?.n ?? 0) >= 1,
    invoice_updated: inv?.status === 'paid' && inv.paymentId != null,
    ledger_updated: pays.length === 1,
    audit_written: audits.length >= 1,
    timeline_written: events.length >= 1,
    receipt_created: receipts.length >= 1,
    payment_left_pending_queue: inv?.status === 'paid',
    revenue_dashboard_reflects: pays.length === 1,
    deposit_updated: 'n/a_rent_only',
    notifications_created: 'best_effort',
    paymentCount: pays.length,
    auditCount: audits.length,
    eventCount: events.length,
    receiptCount: receipts.length,
  };
}

async function approveOne(sess: AdminSession, invoiceId: string, pgId: string): Promise<Row> {
  const captured: string[] = [];
  const oi = console.info;
  const oe = console.error;
  console.info = (...a: unknown[]) => {
    captured.push(a.map(String).join(' '));
    oi.apply(console, a as never);
  };
  console.error = (...a: unknown[]) => {
    captured.push(a.map(String).join(' '));
    oe.apply(console, a as never);
  };

  try {
    const tAuth0 = performance.now();
    await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.id, sess.adminId)).limit(1);
    const auth_ms = Math.round((performance.now() - tAuth0) * 10) / 10;

    const tHot0 = performance.now();
    const result = await approveRentPaymentProof(sess, invoiceId);
    if (!result.ok) throw new Error(result.message);

    scheduleAfterPaymentApproval(async () => {
      await persistApprovalAllocationAfterSuccess({
        kind: 'rent',
        entityId: invoiceId,
        pgId,
        approvedByAdminId: sess.adminId,
      });
    });
    const response_returned_ms = Math.round((performance.now() - tHot0) * 10) / 10 + auth_ms;

    const deferred = await waitDeferred(invoiceId);
    await sleep(300);

    const profiler: Record<string, number> = {};
    for (const line of captured) {
      if (!line.includes('[payment-approval-timing]')) continue;
      const i = line.indexOf('{');
      if (i < 0) continue;
      try {
        const parsed = JSON.parse(line.slice(i)) as {
          steps?: Record<string, number>;
          invoiceId?: string;
        };
        if (parsed.invoiceId && parsed.invoiceId !== invoiceId) continue;
        Object.assign(profiler, parsed.steps ?? {});
      } catch {
        /* ignore */
      }
    }

    const load_invoice_ms = (profiler.load_invoice ?? 0) + (profiler.ensure_proof_snapshot ?? 0);
    const settlement_ms =
      profiler.apply_approved_payment_atomic ?? profiler.settlement_transaction ?? 0;
    const commit_ms = profiler.settlement_transaction ?? settlement_ms;
    const checks = await verify(invoiceId);

    console.log(`Auth ................ ${auth_ms} ms`);
    console.log(`Load invoice ........ ${load_invoice_ms} ms`);
    console.log(`Settlement .......... ${settlement_ms} ms`);
    console.log(`Commit .............. ${commit_ms} ms`);
    console.log(`Response returned ... ${response_returned_ms} ms`);
    console.log(`Deferred tasks ...... ${deferred.ms} ms`);

    return {
      invoiceId,
      auth_ms,
      load_invoice_ms,
      settlement_ms,
      commit_ms,
      response_returned_ms,
      deferred_tasks_ms: deferred.ms,
      checks,
      profiler,
    };
  } finally {
    console.info = oi;
    console.error = oe;
  }
}

async function createOne() {
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
  const ts = Date.now();
  const [inv] = await db
    .insert(rentInvoices)
    .values({
      bookingId: booking.booking_id,
      customerId: booking.customer_id,
      bedId: booking.bed_id,
      pgId: booking.pg_id,
      invoiceNumber: `OPTV-${RUN_TAG}-${ts}`,
      billingMonth: BILLING_MONTH,
      dueDate: '2099-01-05',
      rentPaise: RENT_PAISE,
      status: 'pending',
      isAdhoc: true,
      paymentProofUrl: `https://example.com/opt-verify/${RUN_TAG}.png`,
      proofSubmittedAt: new Date(),
      proofSnapshotOutstandingPaise: RENT_PAISE,
      proofSnapshotLateFeePaise: 0,
      proofSnapshotPrincipalDuePaise: RENT_PAISE,
      notes: `${RUN_TAG} synthetic verification for ${booking.customer_name}`,
    })
    .returning({ id: rentInvoices.id, pgId: rentInvoices.pgId });
  return inv!;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const timings = loadResults();
  const doneIds = new Set(timings.map((t) => t.invoiceId));

  // Seed from already-paid OPTVERIFY if not in results
  const paid = await db.execute<{ id: string; pg_id: string }>(sql`
    SELECT id, pg_id FROM rent_invoices
    WHERE notes LIKE 'OPTVERIFY_%'
      AND status = 'paid'
      AND billing_month = ${BILLING_MONTH}::date
      AND created_at > now() - interval '24 hours'
    ORDER BY paid_at NULLS LAST, created_at
  `);
  const paidRows = (Array.isArray(paid) ? paid : []) as Array<{ id: string; pg_id: string }>;
  for (const p of paidRows) {
    if (doneIds.has(p.id)) continue;
    if (timings.length >= TARGET) break;
    console.log('Backfilling checks for already-paid', p.id);
    const checks = await verify(p.id);
    timings.push({
      invoiceId: p.id,
      auth_ms: 0,
      load_invoice_ms: 0,
      settlement_ms: 0,
      commit_ms: 0,
      response_returned_ms: 0,
      deferred_tasks_ms: 0,
      checks: { ...checks, backfilled: true },
      profiler: {},
    });
    doneIds.add(p.id);
  }
  saveResults(timings);

  const sess = await session();
  let attempts = 0;
  while (timings.filter((t) => t.checks.invoice_updated === true).length < TARGET && attempts < 30) {
    attempts++;
    let pending = (await listPending()).filter((p) => !doneIds.has(p.id));
    if (pending.length === 0) {
      console.log('Creating new synthetic invoice…');
      const inv = await createOne();
      pending = [{ id: inv.id, pg_id: inv.pgId }];
    }
    const next = pending[0]!;
    console.log(`\n--- Approve ${timings.length + 1}/${TARGET} ${next.id} (attempt ${attempts}) ---`);
    try {
      const row = await approveOne(sess, next.id, next.pg_id);
      timings.push(row);
      doneIds.add(next.id);
      saveResults(timings);
      console.log('checks', row.checks);
    } catch (err) {
      console.error('approve attempt failed', err instanceof Error ? err.message : err);
      await sleep(2000);
    }
  }

  const measured = timings.filter((t) => t.response_returned_ms > 0);
  console.log(`\nDone. Total timed approvals: ${measured.length}, total rows: ${timings.length}`);
  saveResults(timings, { measuredCount: measured.length });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
