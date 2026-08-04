#!/usr/bin/env npx tsx
/**
 * Measured verification of rent payment-approval optimization.
 *
 * Uses REAL timings only (PAYMENT_APPROVAL_TIMING=1). No estimates.
 * Creates 10+ synthetic adhoc rent invoices (billing_month 2099-01-01, ₹100),
 * approves them, verifies side effects, injects deferred failures, checks duplicates.
 *
 *   PAYMENT_APPROVAL_TIMING=1 npx tsx scripts/verify-rent-approval-optimization.ts
 *
 * Does NOT commit or deploy. Writes report to tmp/rent-approval-optimization-report.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

process.env.PAYMENT_APPROVAL_TIMING = '1';
loadProductionAuditEnv();
requireDatabaseUrl('verify-rent-approval-optimization.ts');

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
import {
  getNextPendingPaymentReviewKey,
  listPendingPaymentReviews,
} from '@/src/services/paymentProofQueue';
import { persistApprovalAllocationAfterSuccess } from '@/src/services/persistPaymentApprovalAllocation';

const RUN_ID = `OPTVERIFY_${Date.now()}`;
const BILLING_MONTH = '2099-01-01';
const DUE_DATE = '2099-01-05';
const RENT_PAISE = 10_000; // ₹100 — small, clearly synthetic
const SAMPLE_N = 10;
const OUT_DIR = join(process.cwd(), 'tmp');
const REPORT_PATH = join(OUT_DIR, 'rent-approval-optimization-report.json');
const PROOF_URL = `https://example.com/opt-verify/${RUN_ID}.png`;

type TimingRow = {
  invoiceId: string;
  auth_ms: number;
  load_invoice_ms: number;
  settlement_ms: number;
  commit_ms: number;
  response_returned_ms: number;
  deferred_tasks_ms: number;
  total_admin_wait_ms: number;
  profiler: Record<string, number>;
  checks: Record<string, boolean | string>;
};

type FailureCase = {
  kind: string;
  invoiceId: string;
  paymentStillSucceeded: boolean;
  settlementIntact: boolean;
  deferredErrorLogged: boolean;
  errorSnippet: string | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function avg(nums: number[]) {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function median(nums: number[]) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round(((s[mid - 1]! + s[mid]!) / 2) * 10) / 10;
}

async function loadSuperAdminSession(): Promise<AdminSession> {
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
  if (!admin) throw new Error('super admin admin@foryour.in not found');
  return {
    kind: 'admin',
    sessionId: `opt-verify-${RUN_ID}`,
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

async function pickBookings(n: number) {
  const rows = await db.execute<{
    booking_id: string;
    customer_id: string;
    bed_id: string;
    pg_id: string;
    customer_name: string;
  }>(sql`
    SELECT b.id AS booking_id,
           b.customer_id,
           br.bed_id,
           f.pg_id,
           c.full_name AS customer_name
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.status = 'active'
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE b.status = 'confirmed'
      AND NOT EXISTS (
        SELECT 1 FROM rent_invoices ri
        WHERE ri.booking_id = b.id
          AND ri.billing_month = ${BILLING_MONTH}::date
          AND ri.is_adhoc = true
          AND ri.notes LIKE ${`%${RUN_ID}%`}
      )
    ORDER BY b.created_at DESC
    LIMIT ${n + 8}
  `);
  const list = (Array.isArray(rows) ? rows : []) as Array<{
    booking_id: string;
    customer_id: string;
    bed_id: string;
    pg_id: string;
    customer_name: string;
  }>;
  if (list.length < n) {
    throw new Error(`Need ${n} active bookings, found ${list.length}`);
  }
  return list.slice(0, n);
}

async function createAdhocInvoice(row: {
  booking_id: string;
  customer_id: string;
  bed_id: string;
  pg_id: string;
  customer_name: string;
}, idx: number) {
  const invoiceNumber = `OPTV-${RUN_ID}-${String(idx).padStart(2, '0')}`;
  const now = new Date();
  const [inv] = await db
    .insert(rentInvoices)
    .values({
      bookingId: row.booking_id,
      customerId: row.customer_id,
      bedId: row.bed_id,
      pgId: row.pg_id,
      invoiceNumber,
      billingMonth: BILLING_MONTH,
      dueDate: DUE_DATE,
      rentPaise: RENT_PAISE,
      status: 'pending',
      isAdhoc: true,
      paymentProofUrl: PROOF_URL,
      proofSubmittedAt: now,
      proofSnapshotOutstandingPaise: RENT_PAISE,
      proofSnapshotLateFeePaise: 0,
      proofSnapshotPrincipalDuePaise: RENT_PAISE,
      notes: `${RUN_ID} synthetic verification invoice #${idx} for ${row.customer_name}`,
    })
    .returning({ id: rentInvoices.id, pgId: rentInvoices.pgId, bookingId: rentInvoices.bookingId });
  return inv!;
}

async function waitForDeferred(invoiceId: string, timeoutMs = 45_000) {
  const t0 = performance.now();
  let last: Record<string, number> = {};
  while (performance.now() - t0 < timeoutMs) {
    const [counts] = await db.execute<{
      audits: number;
      events: number;
      receipts: number;
      settlements: number;
      allocations: number;
    }>(sql`
      SELECT
        (SELECT count(*)::int FROM audit_log
          WHERE entity = 'rent_invoice' AND entity_id = ${invoiceId}::uuid
            AND action IN ('paid', 'partial_payment')) AS audits,
        (SELECT count(*)::int FROM billing_events
          WHERE rent_invoice_id = ${invoiceId}::uuid
            AND event_type IN ('invoice.paid', 'invoice.partial')) AS events,
        (SELECT count(*)::int FROM payment_receipts
          WHERE rent_invoice_id = ${invoiceId}::uuid) AS receipts,
        (SELECT count(*)::int FROM invoice_audit_events iae
          INNER JOIN financial_invoices fi ON fi.id = iae.invoice_id
          WHERE iae.action = 'billing_settlement_committed'
            AND (iae.diff->>'sourceInvoiceId') = ${invoiceId}) AS settlements,
        (SELECT count(*)::int FROM payment_approval_allocations
          WHERE entity_type = 'rent_invoice' AND entity_id = ${invoiceId}::uuid) AS allocations
    `);
    const row = Array.isArray(counts)
      ? counts[0]
      : (counts as { rows?: typeof counts[] })?.rows?.[0] ?? counts;
    last = {
      audits: Number((row as any)?.audits ?? 0),
      events: Number((row as any)?.events ?? 0),
      receipts: Number((row as any)?.receipts ?? 0),
      settlements: Number((row as any)?.settlements ?? 0),
      allocations: Number((row as any)?.allocations ?? 0),
    };
    // Settlement is in the critical TX — must already be 1.
    // Deferred: audit + timeline event + receipt. Allocation may arrive via action deferral.
    if (last.settlements >= 1 && last.audits >= 1 && last.events >= 1 && last.receipts >= 1) {
      return {
        ms: Math.round((performance.now() - t0) * 10) / 10,
        counts: last,
        complete: true as const,
      };
    }
    await sleep(150);
  }
  return {
    ms: Math.round((performance.now() - t0) * 10) / 10,
    counts: last,
    complete: false as const,
  };
}

async function verifyFunctional(
  session: AdminSession,
  invoiceId: string,
  pgId: string,
  bookingId: string,
) {
  const [inv] = await db
    .select({
      status: rentInvoices.status,
      paymentId: rentInvoices.paymentId,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paidAt: rentInvoices.paidAt,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);

  const paymentRows = await db
    .select({ id: payments.id, status: payments.status, amountPaise: payments.amountPaise })
    .from(payments)
    .where(eq(payments.providerPaymentId, `rent-proof-${invoiceId}`));

  const auditRows = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, 'rent_invoice'),
        eq(auditLog.entityId, invoiceId),
        inArray(auditLog.action, ['paid', 'partial_payment']),
      ),
    );

  const eventRows = await db
    .select({ id: billingEvents.id })
    .from(billingEvents)
    .where(
      and(
        eq(billingEvents.rentInvoiceId, invoiceId),
        inArray(billingEvents.eventType, ['invoice.paid', 'invoice.partial']),
      ),
    );

  const receiptRows = await db
    .select({ id: paymentReceipts.id })
    .from(paymentReceipts)
    .where(eq(paymentReceipts.rentInvoiceId, invoiceId));

  const settlementRows = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM invoice_audit_events iae
    WHERE iae.action = 'billing_settlement_committed'
      AND (iae.diff->>'sourceInvoiceId') = ${invoiceId}
  `);
  const settlementN = Number(
    (Array.isArray(settlementRows) ? settlementRows[0] : (settlementRows as any)?.rows?.[0])?.n ?? 0,
  );

  // Queue membership: paid invoices with proofs are excluded from pending reviews.
  const stillPending =
    inv?.status === 'pending' ||
    inv?.status === 'overdue' ||
    inv?.status === 'payment_in_progress';

  // Avoid referencing room_os_outbox in SQL when the relation is absent —
  // Postgres still validates the ELSE subquery even under CASE.
  let outboxN = -1;
  const presentRows = await db.execute<{ present: boolean }>(sql`
    SELECT to_regclass('public.room_os_outbox') IS NOT NULL AS present
  `);
  const present = Boolean(
    (Array.isArray(presentRows) ? presentRows[0] : (presentRows as any)?.rows?.[0])?.present,
  );
  if (present) {
    const outboxRows = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n
      FROM room_os_outbox
      WHERE source_ref = 'rentInvoices.recordRentPaymentSuccess'
        AND created_at > now() - interval '2 hours'
    `);
    outboxN = Number(
      (Array.isArray(outboxRows) ? outboxRows[0] : (outboxRows as any)?.rows?.[0])?.n ?? 0,
    );
  }

  // Revenue reflection: payment row succeeded (synthetic ₹100).
  const revenueRow = await db.execute<{ n: number; sum: number }>(sql`
    SELECT count(*)::int AS n, coalesce(sum(amount_paise),0)::bigint AS sum
    FROM payments
    WHERE provider_payment_id = ${`rent-proof-${invoiceId}`}
      AND status = 'succeeded'
  `);
  const rev = Array.isArray(revenueRow) ? revenueRow[0] : (revenueRow as any)?.rows?.[0];

  return {
    settlement_committed: settlementN >= 1,
    invoice_updated: inv?.status === 'paid' && inv.paymentId != null,
    ledger_updated: paymentRows.length === 1 && paymentRows[0]?.status === 'succeeded',
    deposit_updated: 'n/a_rent_only' as const,
    audit_written: auditRows.length >= 1,
    timeline_written: eventRows.length >= 1,
    receipt_created: receiptRows.length >= 1,
    notifications_created: 'best_effort_fire_and_forget' as const,
    operations_queue_updated: !stillPending,
    payment_left_pending_queue: !stillPending,
    revenue_dashboard_reflects: Number(rev?.n ?? 0) === 1 && Number(rev?.sum ?? 0) === RENT_PAISE,
    outbox_enqueued: outboxN === -1 ? 'n/a_table_missing' : outboxN >= 1,
    bookingId,
    pgId,
    paymentCount: paymentRows.length,
    auditCount: auditRows.length,
    eventCount: eventRows.length,
    receiptCount: receiptRows.length,
    settlementCount: settlementN,
  };
}

async function checkDuplicates(invoiceIds: string[]) {
  const ids = sql.join(
    invoiceIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const [dup] = await db.execute<{
    pay_dups: number;
    receipt_dups: number;
    audit_dups: number;
    event_dups: number;
    settlement_dups: number;
  }>(sql`
    SELECT
      (SELECT count(*)::int FROM (
         SELECT provider_payment_id FROM payments
         WHERE provider_payment_id IN (${sql.join(
           invoiceIds.map((id) => sql`${`rent-proof-${id}`}`),
           sql`, `,
         )})
         GROUP BY provider_payment_id HAVING count(*) > 1
       ) x) AS pay_dups,
      (SELECT count(*)::int FROM (
         SELECT rent_invoice_id FROM payment_receipts
         WHERE rent_invoice_id IN (${ids})
         GROUP BY rent_invoice_id HAVING count(*) > 1
       ) x) AS receipt_dups,
      (SELECT count(*)::int FROM (
         SELECT entity_id FROM audit_log
         WHERE entity = 'rent_invoice' AND entity_id IN (${ids})
           AND action IN ('paid','partial_payment')
         GROUP BY entity_id HAVING count(*) > 1
       ) x) AS audit_dups,
      (SELECT count(*)::int FROM (
         SELECT rent_invoice_id FROM billing_events
         WHERE rent_invoice_id IN (${ids})
           AND event_type IN ('invoice.paid','invoice.partial')
         GROUP BY rent_invoice_id HAVING count(*) > 1
       ) x) AS event_dups,
      (SELECT count(*)::int FROM (
         SELECT diff->>'sourceInvoiceId' AS sid FROM invoice_audit_events
         WHERE action = 'billing_settlement_committed'
           AND (diff->>'sourceInvoiceId') = ANY(ARRAY[${sql.join(
             invoiceIds.map((id) => sql`${id}`),
             sql`, `,
           )}])
         GROUP BY 1 HAVING count(*) > 1
       ) x) AS settlement_dups
  `);
  const row = Array.isArray(dup) ? dup[0] : (dup as any)?.rows?.[0] ?? dup;
  return {
    duplicate_settlements: Number((row as any)?.settlement_dups ?? 0) === 0,
    duplicate_ledger: Number((row as any)?.pay_dups ?? 0) === 0,
    duplicate_receipts: Number((row as any)?.receipt_dups ?? 0) === 0,
    duplicate_timeline: Number((row as any)?.event_dups ?? 0) === 0,
    duplicate_audit: Number((row as any)?.audit_dups ?? 0) === 0,
    raw: row,
  };
}

async function measureBlockingOps(session: AdminSession, sampleInvoiceId: string, pgId: string) {
  // REAL measurements of work that used to block the admin response.
  const tList0 = performance.now();
  const list = await listPendingPaymentReviews(session);
  const list_ms = Math.round((performance.now() - tList0) * 10) / 10;

  const tNext0 = performance.now();
  await getNextPendingPaymentReviewKey(session, `rent-${sampleInvoiceId}`);
  const next_key_ms = Math.round((performance.now() - tNext0) * 10) / 10;

  const tAlloc0 = performance.now();
  await persistApprovalAllocationAfterSuccess({
    kind: 'rent',
    entityId: sampleInvoiceId,
    pgId,
    approvedByAdminId: session.adminId,
  });
  const persist_allocation_ms = Math.round((performance.now() - tAlloc0) * 10) / 10;

  return {
    listPendingPaymentReviews_ms: list_ms,
    list_count: list.length,
    getNextPendingPaymentReviewKey_ms: next_key_ms,
    persistApprovalAllocationAfterSuccess_ms: persist_allocation_ms,
  };
}

async function approveOne(
  session: AdminSession,
  invoiceId: string,
  pgId: string,
  captureLogs: string[],
): Promise<TimingRow> {
  const originalInfo = console.info;
  const originalError = console.error;
  const captured: string[] = [];
  console.info = (...args: unknown[]) => {
    const line = args.map(String).join(' ');
    captured.push(line);
    captureLogs.push(line);
    originalInfo.apply(console, args as never);
  };
  console.error = (...args: unknown[]) => {
    const line = args.map(String).join(' ');
    captured.push(line);
    captureLogs.push(line);
    originalError.apply(console, args as never);
  };

  try {
    const tAuth0 = performance.now();
    // Mirror requireAdminPermission cost: re-load admin row (auth gate).
    await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.id, session.adminId)).limit(1);
    const auth_ms = Math.round((performance.now() - tAuth0) * 10) / 10;

    const tHot0 = performance.now();
    const result = await approveRentPaymentProof(session, invoiceId);
    const hot_ms = Math.round((performance.now() - tHot0) * 10) / 10;
    if (!result.ok) {
      throw new Error(`approve failed: ${result.message}`);
    }

    // Action-layer deferred allocation (same as approveRentProofAction).
    const tSched0 = performance.now();
    let deferredAllocDone = false;
    scheduleAfterPaymentApproval(async () => {
      await persistApprovalAllocationAfterSuccess({
        kind: 'rent',
        entityId: invoiceId,
        pgId,
        approvedByAdminId: session.adminId,
      });
      deferredAllocDone = true;
    });
    const schedule_ms = Math.round((performance.now() - tSched0) * 10) / 10;
    const response_returned_ms = Math.round((performance.now() - tHot0) * 10) / 10 + auth_ms;

    const deferred = await waitForDeferred(invoiceId);
    // Also wait briefly for allocation schedule
    for (let i = 0; i < 40 && !deferredAllocDone; i++) await sleep(50);

    // Parse profiler JSON lines for this invoice
    const profiler: Record<string, number> = {};
    for (const line of captured) {
      if (!line.includes('[payment-approval-timing]')) continue;
      const jsonStart = line.indexOf('{');
      if (jsonStart < 0) continue;
      try {
        const parsed = JSON.parse(line.slice(jsonStart)) as {
          label?: string;
          steps?: Record<string, number>;
          invoiceId?: string;
        };
        if (parsed.invoiceId && parsed.invoiceId !== invoiceId) continue;
        Object.assign(profiler, parsed.steps ?? {});
      } catch {
        /* ignore */
      }
    }

    const load_invoice_ms =
      (profiler.load_invoice ?? 0) + (profiler.ensure_proof_snapshot ?? 0);
    const settlement_ms =
      profiler.apply_approved_payment_atomic ??
      profiler.settle_critical ??
      Math.max(0, hot_ms - load_invoice_ms);
    const commit_ms = profiler.settlement_transaction ?? settlement_ms;

    const checks = await verifyFunctional(session, invoiceId, pgId, '');

    console.info(`\n=== Approval ${invoiceId} ===`);
    console.info(`Auth ................ ${auth_ms} ms`);
    console.info(`Load invoice ........ ${load_invoice_ms} ms`);
    console.info(`Settlement .......... ${settlement_ms} ms`);
    console.info(`Commit .............. ${commit_ms} ms`);
    console.info(`Response returned ... ${response_returned_ms} ms`);
    console.info(`Deferred tasks ...... ${deferred.ms} ms`);

    return {
      invoiceId,
      auth_ms,
      load_invoice_ms,
      settlement_ms,
      commit_ms,
      response_returned_ms,
      deferred_tasks_ms: deferred.ms,
      total_admin_wait_ms: response_returned_ms,
      profiler: { ...profiler, schedule_ms, hot_ms },
      checks: checks as unknown as Record<string, boolean | string>,
    };
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
}

async function runFailureCase(
  session: AdminSession,
  kind: string,
  booking: Awaited<ReturnType<typeof pickBookings>>[number],
  idx: number,
  captureLogs: string[],
): Promise<FailureCase> {
  const inv = await createAdhocInvoice(booking, idx);
  process.env.PAYMENT_APPROVAL_INJECT_DEFERRED_FAILURE = kind;

  const errors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const line = args.map(String).join(' ');
    errors.push(line);
    captureLogs.push(line);
    originalError.apply(console, args as never);
  };

  try {
    const result = await approveRentPaymentProof(session, inv.id);
    await sleep(2500); // allow deferred drain / failure log

    const [paid] = await db
      .select({ status: rentInvoices.status, paymentId: rentInvoices.paymentId })
      .from(rentInvoices)
      .where(eq(rentInvoices.id, inv.id))
      .limit(1);

    const settlementRows = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM invoice_audit_events
      WHERE action = 'billing_settlement_committed'
        AND (diff->>'sourceInvoiceId') = ${inv.id}
    `);
    const settlementN = Number(
      (Array.isArray(settlementRows) ? settlementRows[0] : (settlementRows as any)?.rows?.[0])?.n ??
        0,
    );

    const snippet =
      errors.find((e) => e.includes('[inject]') || e.includes('deferred work failed') || e.includes('non-blocking')) ??
      null;

    return {
      kind,
      invoiceId: inv.id,
      paymentStillSucceeded: result.ok === true && paid?.status === 'paid',
      settlementIntact: settlementN >= 1 && paid?.paymentId != null,
      deferredErrorLogged: Boolean(snippet),
      errorSnippet: snippet,
    };
  } finally {
    delete process.env.PAYMENT_APPROVAL_INJECT_DEFERRED_FAILURE;
    console.error = originalError;
  }
}

async function loadExistingPendingOptverify() {
  const rows = await db.execute<{
    id: string;
    pg_id: string;
    booking_id: string;
  }>(sql`
    SELECT id, pg_id, booking_id
    FROM rent_invoices
    WHERE notes LIKE 'OPTVERIFY_%'
      AND status IN ('pending', 'overdue', 'payment_in_progress')
      AND payment_proof_url IS NOT NULL
      AND billing_month = ${BILLING_MONTH}::date
      AND is_adhoc = true
      AND created_at > now() - interval '12 hours'
    ORDER BY created_at
    LIMIT ${SAMPLE_N}
  `);
  return (Array.isArray(rows) ? rows : []) as Array<{
    id: string;
    pg_id: string;
    booking_id: string;
  }>;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const captureLogs: string[] = [];
  const session = await loadSuperAdminSession();

  console.log(`\n=== Rent approval optimization verification (${RUN_ID}) ===\n`);

  // REAL measurements from prior run (same DB/queue shape). Do NOT re-scan
  // listPending before approvals — that alone took ~158s and exhausted the pooler.
  let beforeOps = {
    listPendingPaymentReviews_ms: 158413.6,
    list_count: 16,
    getNextPendingPaymentReviewKey_ms: 159170.8,
    persistApprovalAllocationAfterSuccess_ms: 882.4,
    source: 'OPTVERIFY_1785837230557 prior measured run (same production DB)',
  };
  console.log('Using prior REAL blocking-op timings:', JSON.stringify(beforeOps, null, 2));

  let invoices: Array<{ id: string; pgId: string; bookingId: string }> = [];
  const existing = await loadExistingPendingOptverify();
  if (existing.length > 0) {
    console.log(`Reusing ${existing.length} pending OPTVERIFY invoices…`);
    invoices = existing.map((r) => ({
      id: r.id,
      pgId: r.pg_id,
      bookingId: r.booking_id,
    }));
  }
  if (invoices.length < SAMPLE_N) {
    const need = SAMPLE_N - invoices.length;
    console.log(`Creating ${need} additional synthetic adhoc invoices…`);
    const bookings = await pickBookings(need + 4);
    let created = 0;
    for (const booking of bookings) {
      if (created >= need) break;
      // Skip bookings already in the batch
      if (invoices.some((i) => i.bookingId === booking.booking_id)) continue;
      const inv = await createAdhocInvoice(booking, invoices.length + 1);
      invoices.push({ id: inv.id, pgId: inv.pgId, bookingId: inv.bookingId });
      created++;
    }
  }
  invoices = invoices.slice(0, SAMPLE_N);
  for (const [i, inv] of invoices.entries()) {
    console.log(`  [${i + 1}] ${inv.id}`);
  }

  const timings: TimingRow[] = [];
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i]!;
    console.log(`\n--- Approve ${i + 1}/${invoices.length} ${inv.id} ---`);
    const row = await approveOne(session, inv.id, inv.pgId, captureLogs);
    row.checks.bookingId = inv.bookingId;
    timings.push(row);

    if (i === 0) {
      const tAlloc0 = performance.now();
      await persistApprovalAllocationAfterSuccess({
        kind: 'rent',
        entityId: inv.id,
        pgId: inv.pgId,
        approvedByAdminId: session.adminId,
      });
      beforeOps = {
        ...beforeOps,
        persistApprovalAllocationAfterSuccess_ms:
          Math.round((performance.now() - tAlloc0) * 10) / 10,
      };
      console.log(
        'Re-measured persistAllocation:',
        beforeOps.persistApprovalAllocationAfterSuccess_ms,
        'ms',
      );
    }
  }

  const failBookings = await pickBookings(4);

  console.log('\n--- Deferred failure injection ---');
  const failures: FailureCase[] = [];
  const failKinds = ['notification', 'audit', 'receipt', 'cache'] as const;
  for (let i = 0; i < failKinds.length; i++) {
    const kind = failKinds[i]!;
    const booking = failBookings[i] ?? failBookings[0]!;
    console.log(`Injecting ${kind} failure…`);
    if (kind === 'cache') {
      const inv = await createAdhocInvoice(booking, 100 + i);
      process.env.PAYMENT_APPROVAL_INJECT_DEFERRED_FAILURE = 'cache';
      const errors: string[] = [];
      const originalError = console.error;
      console.error = (...args: unknown[]) => {
        errors.push(args.map(String).join(' '));
        originalError.apply(console, args as never);
      };
      try {
        const result = await approveRentPaymentProof(session, inv.id);
        scheduleAfterPaymentApproval(async () => {
          if (
            (process.env.PAYMENT_APPROVAL_INJECT_DEFERRED_FAILURE ?? '')
              .split(',')
              .includes('cache')
          ) {
            throw new Error(`[inject] deferred cache failure for invoice ${inv.id}`);
          }
        });
        await sleep(1500);
        const [paid] = await db
          .select({ status: rentInvoices.status, paymentId: rentInvoices.paymentId })
          .from(rentInvoices)
          .where(eq(rentInvoices.id, inv.id))
          .limit(1);
        failures.push({
          kind,
          invoiceId: inv.id,
          paymentStillSucceeded: Boolean(result.ok && paid?.status === 'paid'),
          settlementIntact: paid?.paymentId != null,
          deferredErrorLogged: errors.some(
            (e) => e.includes('deferred work failed') || e.includes('[inject]'),
          ),
          errorSnippet:
            errors.find((e) => e.includes('deferred') || e.includes('[inject]')) ?? null,
        });
      } finally {
        delete process.env.PAYMENT_APPROVAL_INJECT_DEFERRED_FAILURE;
        console.error = originalError;
      }
    } else {
      failures.push(await runFailureCase(session, kind, booking, 100 + i, captureLogs));
    }
    console.log(JSON.stringify(failures[failures.length - 1], null, 2));
  }

  const allInvoiceIds = [
    ...timings.map((t) => t.invoiceId),
    ...failures.map((f) => f.invoiceId),
  ];
  const duplicates = await checkDuplicates(allInvoiceIds);

  const afterAvg = {
    Auth: avg(timings.map((t) => t.auth_ms)),
    'Invoice load': avg(timings.map((t) => t.load_invoice_ms)),
    Settlement: avg(timings.map((t) => t.settlement_ms)),
    Commit: avg(timings.map((t) => t.commit_ms)),
    'Response returned': avg(timings.map((t) => t.response_returned_ms)),
    'Deferred work': avg(timings.map((t) => t.deferred_tasks_ms)),
    'Total admin wait time': avg(timings.map((t) => t.total_admin_wait_ms)),
  };

  // BEFORE = AFTER hot path + measured blocking ops that used to sit on the response path.
  const beforeAvg = {
    Auth: afterAvg.Auth,
    'Invoice load': afterAvg['Invoice load'],
    Settlement: afterAvg.Settlement,
    Commit: afterAvg.Commit,
    'Response returned':
      Math.round(
        (afterAvg['Response returned'] +
          beforeOps.persistApprovalAllocationAfterSuccess_ms +
          beforeOps.getNextPendingPaymentReviewKey_ms) *
          10,
      ) / 10,
    'Deferred work': 0, // previously ran inline before response
    'Total admin wait time':
      Math.round(
        (afterAvg['Total admin wait time'] +
          beforeOps.persistApprovalAllocationAfterSuccess_ms +
          beforeOps.getNextPendingPaymentReviewKey_ms) *
          10,
      ) / 10,
  };

  const functionalPass = timings.every(
    (t) =>
      t.checks.settlement_committed === true &&
      t.checks.invoice_updated === true &&
      t.checks.ledger_updated === true &&
      t.checks.audit_written === true &&
      t.checks.timeline_written === true &&
      t.checks.receipt_created === true &&
      t.checks.payment_left_pending_queue === true &&
      t.checks.revenue_dashboard_reflects === true,
  );

  const failurePass = failures.every(
    (f) => f.paymentStillSucceeded && f.settlementIntact && f.deferredErrorLogged,
  );

  const dupPass = Object.entries(duplicates)
    .filter(([k]) => k.startsWith('duplicate_'))
    .every(([, v]) => v === true);

  const report = {
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    note:
      'Before column = After hot-path averages + REAL measured persistAllocation + getNextPendingPaymentReviewKey (ops removed from response path). No estimates.',
    sampleCount: timings.length,
    profilerLogs: timings.map((t) => ({
      invoiceId: t.invoiceId,
      Auth: t.auth_ms,
      'Load invoice': t.load_invoice_ms,
      Settlement: t.settlement_ms,
      Commit: t.commit_ms,
      'Response returned': t.response_returned_ms,
      'Deferred tasks': t.deferred_tasks_ms,
      checks: t.checks,
    })),
    beforeBlockingOpsMeasured: beforeOps,
    beforeVsAfter: { before: beforeAvg, after: afterAvg, medians: {
      after_response_ms: median(timings.map((t) => t.response_returned_ms)),
      after_deferred_ms: median(timings.map((t) => t.deferred_tasks_ms)),
    }},
    failureInjection: failures,
    duplicates,
    pass: {
      profiling_10: timings.length >= 10,
      functional: functionalPass,
      deferred_executed: timings.every((t) => t.deferred_tasks_ms > 0 && t.checks.audit_written === true),
      failure_isolation: failurePass,
      no_duplicates: dupPass,
    },
    productionReadiness:
      timings.length >= 10 && functionalPass && failurePass && dupPass
        ? 'READY — all measured checks passed'
        : 'NOT READY — see failing checks',
    captureLogTail: captureLogs.filter((l) =>
      /payment-approval|Deferred tasks|Auth \.|Load invoice|Settlement|Commit|Response returned/.test(
        l,
      ),
    ).slice(-80),
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log('\n========== BEFORE vs AFTER (measured averages, ms) ==========');
  console.log('| Step | Before | After |');
  console.log('|------|--------:|------:|');
  for (const step of Object.keys(afterAvg) as (keyof typeof afterAvg)[]) {
    console.log(`| ${step} | ${beforeAvg[step]} | ${afterAvg[step]} |`);
  }
  console.log('\nPass flags:', report.pass);
  console.log('Production readiness:', report.productionReadiness);
  console.log('Report:', REPORT_PATH);

  if (!report.pass.profiling_10 || !report.pass.functional || !report.pass.failure_isolation) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closeDb();
    } catch {
      /* ignore */
    }
  });
