import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhCheckoutOperations } from '@/src/hair/db/schema';
import { QUICK_SALE_CHECKOUT_OPERATION_STALE_MS } from '@/src/hair/lib/checkoutOperationLease';
import { orgFilter, tenantWriteDefaults } from '@/src/hair/lib/tenant/filters';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { findCommittedInvoiceIdByAttemptKey } from './reconcileAttempt';

export type ClaimLeaseResult = 'claimed' | 'in_progress' | 'already_committed';

export async function claimCheckoutOperationLease(params: {
  attemptKey: string;
  correlationId: string;
  ctx: TenantContext | null;
  writeDefaults: ReturnType<typeof tenantWriteDefaults>;
}): Promise<ClaimLeaseResult> {
  const { attemptKey, correlationId, ctx, writeDefaults } = params;

  const invoiceId = await findCommittedInvoiceIdByAttemptKey(attemptKey, ctx);
  if (invoiceId) return 'already_committed';

  const staleBefore = new Date(Date.now() - QUICK_SALE_CHECKOUT_OPERATION_STALE_MS);

  const reclaimed = await hairDb
    .update(fyhCheckoutOperations)
    .set({
      status: 'processing',
      correlationId,
      errorMessage: null,
      invoiceId: null,
      committedAt: null,
    })
    .where(
      and(
        orgFilter(fyhCheckoutOperations.organizationId, ctx),
        eq(fyhCheckoutOperations.attemptKey, attemptKey),
        isNull(fyhCheckoutOperations.invoiceId),
        or(
          eq(fyhCheckoutOperations.status, 'failed'),
          and(
            eq(fyhCheckoutOperations.status, 'processing'),
            lt(fyhCheckoutOperations.createdAt, staleBefore),
          ),
        ),
      ),
    )
    .returning({ id: fyhCheckoutOperations.id });

  if (reclaimed.length > 0) return 'claimed';

  const [existing] = await hairDb
    .select()
    .from(fyhCheckoutOperations)
    .where(
      and(
        orgFilter(fyhCheckoutOperations.organizationId, ctx),
        eq(fyhCheckoutOperations.attemptKey, attemptKey),
      ),
    )
    .limit(1);

  if (existing?.status === 'committed' && existing.invoiceId) {
    return 'already_committed';
  }

  if (existing?.status === 'processing' && !existing.invoiceId) {
    if (existing.createdAt >= staleBefore) {
      return 'in_progress';
    }
  }

  if (existing?.status === 'failed') {
    await hairDb
      .update(fyhCheckoutOperations)
      .set({
        status: 'processing',
        correlationId,
        errorMessage: null,
        invoiceId: null,
        committedAt: null,
      })
      .where(
        and(
          orgFilter(fyhCheckoutOperations.organizationId, ctx),
          eq(fyhCheckoutOperations.attemptKey, attemptKey),
          eq(fyhCheckoutOperations.status, 'failed'),
        ),
      );
    return 'claimed';
  }

  try {
    await hairDb.insert(fyhCheckoutOperations).values({
      ...writeDefaults,
      attemptKey,
      kind: 'basket_checkout',
      status: 'processing',
      correlationId,
    });
    return 'claimed';
  } catch {
    const invoiceAgain = await findCommittedInvoiceIdByAttemptKey(attemptKey, ctx);
    if (invoiceAgain) return 'already_committed';
    const [row] = await hairDb
      .select({ status: fyhCheckoutOperations.status, createdAt: fyhCheckoutOperations.createdAt })
      .from(fyhCheckoutOperations)
      .where(
        and(
          orgFilter(fyhCheckoutOperations.organizationId, ctx),
          eq(fyhCheckoutOperations.attemptKey, attemptKey),
        ),
      )
      .limit(1);
    if (row?.status === 'processing' && row.createdAt >= staleBefore) {
      return 'in_progress';
    }
    return 'claimed';
  }
}

export async function markCheckoutOperationFailed(params: {
  attemptKey: string;
  ctx: TenantContext | null;
  correlationId: string;
  errorMessage: string;
  onlyIfProcessing?: boolean;
}): Promise<void> {
  const { attemptKey, ctx, correlationId, errorMessage, onlyIfProcessing } = params;
  await hairDb
    .update(fyhCheckoutOperations)
    .set({ status: 'failed', errorMessage })
    .where(
      and(
        orgFilter(fyhCheckoutOperations.organizationId, ctx),
        eq(fyhCheckoutOperations.attemptKey, attemptKey),
        eq(fyhCheckoutOperations.correlationId, correlationId),
        onlyIfProcessing ? eq(fyhCheckoutOperations.status, 'processing') : sql`true`,
      ),
    );
}

export async function markStaleProcessingOperationsFailed(
  attemptKey: string,
  ctx: TenantContext | null,
  errorMessage: string,
): Promise<void> {
  const staleBefore = new Date(Date.now() - QUICK_SALE_CHECKOUT_OPERATION_STALE_MS);
  await hairDb
    .update(fyhCheckoutOperations)
    .set({ status: 'failed', errorMessage })
    .where(
      and(
        orgFilter(fyhCheckoutOperations.organizationId, ctx),
        eq(fyhCheckoutOperations.attemptKey, attemptKey),
        eq(fyhCheckoutOperations.status, 'processing'),
        isNull(fyhCheckoutOperations.invoiceId),
        lt(fyhCheckoutOperations.createdAt, staleBefore),
      ),
    );
}
