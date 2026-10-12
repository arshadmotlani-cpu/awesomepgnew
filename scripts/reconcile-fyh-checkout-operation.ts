/* eslint-disable no-console */
/**
 * Reconcile fyh_checkout_operations against committed invoices (SSOT: fyh_invoices.checkout_attempt_key).
 *
 * Default: dry-run (read-only classification).
 *   npx tsx scripts/reconcile-fyh-checkout-operation.ts --attempt bb5dff01-...
 * Apply status repair (journal only, never creates invoices):
 *   npx tsx scripts/reconcile-fyh-checkout-operation.ts --attempt bb5dff01-... --apply
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { and, eq, isNull, lt } from 'drizzle-orm';
import { createHairClient } from '@/src/hair/db/client';
import { fyhCheckoutOperations, fyhInvoices } from '@/src/hair/db/schema';
import { QUICK_SALE_CHECKOUT_OPERATION_STALE_MS } from '@/src/hair/lib/checkoutOperationLease';
import { getHairDatabaseHost } from '@/src/hair/lib/db/env';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const attempt = arg('--attempt');
  const apply = process.argv.includes('--apply');
  if (!attempt) {
    console.error('Usage: --attempt <uuid> [--apply]');
    process.exit(1);
  }

  console.log(`Hair DB host: ${getHairDatabaseHost() ?? 'unknown'}`);
  const { db, close } = createHairClient({ max: 1 });

  const [invoice] = await db
    .select({
      id: fyhInvoices.id,
      invoiceNumber: fyhInvoices.invoiceNumber,
      grandTotalPaise: fyhInvoices.grandTotalPaise,
      status: fyhInvoices.status,
    })
    .from(fyhInvoices)
    .where(and(eq(fyhInvoices.checkoutAttemptKey, attempt), isNull(fyhInvoices.voidedAt)))
    .limit(1);

  const [op] = await db
    .select()
    .from(fyhCheckoutOperations)
    .where(eq(fyhCheckoutOperations.attemptKey, attempt))
    .limit(1);

  const staleBefore = new Date(Date.now() - QUICK_SALE_CHECKOUT_OPERATION_STALE_MS);
  const classification = (() => {
    if (invoice) return 'COMMITTED_INVOICE_EXISTS';
    if (!op) return 'NO_OPERATION_ROW';
    if (op.status === 'committed' && op.invoiceId) return 'JOURNAL_COMMITTED';
    if (op.status === 'failed') return 'FAILED';
    if (op.status === 'processing' && op.createdAt < staleBefore) {
      return 'STALE_PROCESSING_NO_INVOICE';
    }
    if (op.status === 'processing') return 'ACTIVE_PROCESSING';
    return 'UNKNOWN';
  })();

  const report = {
    attempt,
    classification,
    invoice: invoice ?? null,
    operation: op
      ? {
          status: op.status,
          invoiceId: op.invoiceId,
          errorMessage: op.errorMessage,
          createdAt: op.createdAt,
          correlationId: op.correlationId,
        }
      : null,
    apply,
  };
  console.log(JSON.stringify(report, null, 2));

  if (apply && classification === 'STALE_PROCESSING_NO_INVOICE' && op) {
    await db
      .update(fyhCheckoutOperations)
      .set({
        status: 'failed',
        errorMessage:
          'Reconciled: stale processing with no invoice (operator repair script).',
      })
      .where(
        and(
          eq(fyhCheckoutOperations.attemptKey, attempt),
          eq(fyhCheckoutOperations.status, 'processing'),
          isNull(fyhCheckoutOperations.invoiceId),
          lt(fyhCheckoutOperations.createdAt, staleBefore),
        ),
      );
    console.log('Applied journal repair: processing -> failed');
  } else if (apply && classification === 'COMMITTED_INVOICE_EXISTS' && op && op.status !== 'committed') {
    await db
      .update(fyhCheckoutOperations)
      .set({
        status: 'committed',
        invoiceId: invoice!.id,
        committedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(fyhCheckoutOperations.attemptKey, attempt));
    console.log('Applied journal repair: aligned with existing invoice');
  }

  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
