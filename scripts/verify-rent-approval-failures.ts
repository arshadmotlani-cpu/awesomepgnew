#!/usr/bin/env npx tsx
/**
 * Deferred-failure injection + duplicate regression for rent approval optimization.
 *   npx tsx --tsconfig tsconfig.json ./scripts/verify-rent-approval-failures.ts
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

process.env.PAYMENT_APPROVAL_TIMING = '1';
loadProductionAuditEnv();
requireDatabaseUrl('verify-rent-approval-failures.ts');

import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { adminUsers, rentInvoices } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { scheduleAfterPaymentApproval } from '@/src/lib/payments/scheduleAfterPaymentApproval';
import { approveRentPaymentProof } from '@/src/services/rentInvoices';

const OUT = join(process.cwd(), 'tmp');
const REPORT = join(OUT, 'rent-approval-failures-report.json');
const INC = join(OUT, 'rent-approval-incremental.json');
const BILLING_MONTH = '2099-01-01';
const RENT_PAISE = 10_000;
const TAG = `OPTFAIL_${Date.now()}`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function adminSession(): Promise<AdminSession> {
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
    sessionId: `fail-${Date.now()}`,
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

async function createInvoice(idx: number) {
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
  const [inv] = await db
    .insert(rentInvoices)
    .values({
      bookingId: booking.booking_id,
      customerId: booking.customer_id,
      bedId: booking.bed_id,
      pgId: booking.pg_id,
      invoiceNumber: `OPTFAIL-${TAG}-${idx}`,
      billingMonth: BILLING_MONTH,
      dueDate: '2099-01-05',
      rentPaise: RENT_PAISE,
      status: 'pending',
      isAdhoc: true,
      paymentProofUrl: `https://example.com/opt-fail/${TAG}.png`,
      proofSubmittedAt: new Date(),
      proofSnapshotOutstandingPaise: RENT_PAISE,
      proofSnapshotLateFeePaise: 0,
      proofSnapshotPrincipalDuePaise: RENT_PAISE,
      notes: `${TAG} deferred-failure inject #${idx} for ${booking.customer_name}`,
    })
    .returning({ id: rentInvoices.id, pgId: rentInvoices.pgId });
  return inv!;
}

async function runInject(kind: string, idx: number) {
  const inv = await createInvoice(idx);
  process.env.PAYMENT_APPROVAL_INJECT_DEFERRED_FAILURE = kind;
  const errors: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
    orig.apply(console, args as never);
  };

  try {
    const session = await adminSession();
    const result = await approveRentPaymentProof(session, inv.id);

    if (kind === 'cache') {
      scheduleAfterPaymentApproval(async () => {
        throw new Error(`[inject] deferred cache failure for invoice ${inv.id}`);
      });
    }

    await sleep(3500);

    const [paid] = await db
      .select({ status: rentInvoices.status, paymentId: rentInvoices.paymentId })
      .from(rentInvoices)
      .where(eq(rentInvoices.id, inv.id))
      .limit(1);

    const [settlement] = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM invoice_audit_events
      WHERE action = 'billing_settlement_committed'
        AND (diff->>'sourceInvoiceId') = ${inv.id}
    `);

    const snippet =
      errors.find(
        (e) =>
          e.includes('[inject]') ||
          e.includes('deferred work failed') ||
          e.includes('non-blocking') ||
          e.includes('post-payment side effects failed') ||
          e.includes('audit_log insert failed') ||
          e.includes('receipt create failed'),
      ) ?? null;

    return {
      kind,
      invoiceId: inv.id,
      paymentStillSucceeded: Boolean(result.ok && paid?.status === 'paid'),
      settlementIntact:
        Number((settlement as { n: number })?.n ?? 0) >= 1 && paid?.paymentId != null,
      deferredErrorLogged: Boolean(snippet),
      errorSnippet: snippet,
      adminWouldSeeSuccess: result.ok === true,
    };
  } finally {
    delete process.env.PAYMENT_APPROVAL_INJECT_DEFERRED_FAILURE;
    console.error = orig;
  }
}

async function checkDuplicates(invoiceIds: string[]) {
  if (invoiceIds.length === 0) return { empty: true };
  const [row] = await db.execute<{
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
         WHERE rent_invoice_id IN (${sql.join(
           invoiceIds.map((id) => sql`${id}::uuid`),
           sql`, `,
         )})
         GROUP BY rent_invoice_id HAVING count(*) > 1
       ) x) AS receipt_dups,
      (SELECT count(*)::int FROM (
         SELECT entity_id FROM audit_log
         WHERE entity = 'rent_invoice'
           AND entity_id IN (${sql.join(
             invoiceIds.map((id) => sql`${id}::uuid`),
             sql`, `,
           )})
           AND action IN ('paid','partial_payment')
         GROUP BY entity_id HAVING count(*) > 1
       ) x) AS audit_dups,
      (SELECT count(*)::int FROM (
         SELECT rent_invoice_id FROM billing_events
         WHERE rent_invoice_id IN (${sql.join(
           invoiceIds.map((id) => sql`${id}::uuid`),
           sql`, `,
         )})
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
  const r = row as {
    pay_dups: number;
    receipt_dups: number;
    audit_dups: number;
    event_dups: number;
    settlement_dups: number;
  };
  return {
    duplicate_settlements: Number(r?.settlement_dups ?? 0) === 0,
    duplicate_ledger: Number(r?.pay_dups ?? 0) === 0,
    duplicate_receipts: Number(r?.receipt_dups ?? 0) === 0,
    duplicate_timeline: Number(r?.event_dups ?? 0) === 0,
    duplicate_audit: Number(r?.audit_dups ?? 0) === 0,
    raw: r,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const failures = [];
  for (const [i, kind] of (['notification', 'audit', 'receipt', 'cache'] as const).entries()) {
    console.log(`\n=== Inject ${kind} ===`);
    const result = await runInject(kind, i + 1);
    console.log(JSON.stringify(result, null, 2));
    failures.push(result);
  }

  const happyIds: string[] = existsSync(INC)
    ? (JSON.parse(readFileSync(INC, 'utf8')).timings ?? []).map(
        (t: { invoiceId: string }) => t.invoiceId,
      )
    : [];
  const allIds = [...happyIds, ...failures.map((f) => f.invoiceId)];
  console.log('\n=== Duplicate check ===');
  const duplicates = await checkDuplicates(allIds);
  console.log(JSON.stringify(duplicates, null, 2));

  const failurePass = failures.every(
    (f) => f.paymentStillSucceeded && f.settlementIntact && f.deferredErrorLogged,
  );
  const dupPass = Object.entries(duplicates)
    .filter(([k]) => k.startsWith('duplicate_'))
    .every(([, v]) => v === true);

  const report = {
    generatedAt: new Date().toISOString(),
    tag: TAG,
    failures,
    duplicates,
    pass: { failure_isolation: failurePass, no_duplicates: dupPass },
  };
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\nPass:', report.pass);
  console.log('Wrote', REPORT);
  if (!failurePass || !dupPass) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
