#!/usr/bin/env npx tsx
/**
 * Capture FULL stack for production Approve failure (room_os_outbox missing).
 * Uses production writerRebuild (must be checked out before run).
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('repro-prod-approve-stack');

import { eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { rentInvoices } from '@/src/db/schema';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'tmp');

function serializeErr(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { value: String(err) };
  const anyErr = err as Error & {
    cause?: unknown;
    code?: string;
    detail?: string;
    constraint?: string;
    table?: string;
    schema?: string;
  };
  return {
    name: anyErr.name,
    message: anyErr.message,
    stack: anyErr.stack ?? null,
    code: anyErr.code ?? null,
    detail: anyErr.detail ?? null,
    cause:
      anyErr.cause instanceof Error
        ? {
            name: anyErr.cause.name,
            message: anyErr.cause.message,
            stack: anyErr.cause.stack ?? null,
            code: (anyErr.cause as { code?: string }).code ?? null,
          }
        : anyErr.cause
          ? String(anyErr.cause)
          : null,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // Find a pending REPROFAIL / synthetic invoice or create one quickly
  let [inv] = await db.execute<{ id: string }>(sql`
    SELECT id FROM rent_invoices
    WHERE notes LIKE 'REPROFAIL_%'
      AND status = 'pending'
      AND payment_proof_url IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (!inv) {
    throw new Error('No pending REPROFAIL invoice — run repro-prod-approve-failure first');
  }

  console.log('Using invoice', inv.id);

  const [row] = await db.select().from(rentInvoices).where(eq(rentInvoices.id, inv.id)).limit(1);
  if (!row) throw new Error('invoice missing');

  // Call the same settlement entry as Approve
  const { applyApprovedPaymentAtomic } = await import('@/src/services/paymentSettlementAtomic');

  const t0 = performance.now();
  let caught: unknown = null;
  let result: unknown = null;
  try {
    result = await applyApprovedPaymentAtomic({
      purpose: 'rent',
      provider: 'mock',
      offlineProvider: 'upi_manual',
      providerPaymentId: `rent-proof-stack-${inv.id}`,
      amountPaise: 10_000,
      invoiceId: inv.id,
      rawPayload: { source: 'stack-capture' },
    });
  } catch (err) {
    caught = err;
  }
  const durationMs = Math.round((performance.now() - t0) * 10) / 10;

  // If result is ok:false with reason, also dig into formatPostgresError path by
  // forcing the outbox insert to surface via direct call.
  const { enqueuePropertyIndexRebuildFromWriter } = await import(
    '@/src/roomOs/outbox/writerRebuild'
  );

  let directOutboxErr: unknown = null;
  try {
    await db.transaction(async (tx) => {
      await enqueuePropertyIndexRebuildFromWriter(tx, {
        pgId: row.pgId,
        billingMonth: row.billingMonth,
        sourceRef: 'repro.directOutbox',
      });
    });
  } catch (err) {
    directOutboxErr = err;
  }

  const report = {
    invoiceId: inv.id,
    durationMs,
    applyResult: result,
    applyThrown: caught ? serializeErr(caught) : null,
    directOutboxThrown: directOutboxErr ? serializeErr(directOutboxErr) : null,
    exactLine:
      'src/roomOs/outbox/writerRebuild.ts → enqueuePropertyIndexRebuildFromWriter → appendRoomOsOutboxEntry (insert into room_os_outbox) called from src/services/rentInvoices.ts recordRentPaymentSuccess inside db.transaction',
  };

  writeFileSync(join(OUT, 'prod-approve-failure-stack.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    if (e instanceof Error) console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
