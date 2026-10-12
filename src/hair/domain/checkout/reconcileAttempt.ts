import { and, eq, isNull } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhCheckoutOperations, fyhInvoices } from '@/src/hair/db/schema';
import { hairCheckoutAttemptKeyColumnReady } from '@/src/hair/lib/checkoutSchemaCapabilities';
import {
  isStaleCheckoutOperation,
  STALE_CHECKOUT_OPERATION_ERROR,
} from '@/src/hair/lib/checkoutOperationLease';
import { orgFilter } from '@/src/hair/lib/tenant/filters';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import type { BasketCheckoutOperationResult } from './types';

export async function findCommittedInvoiceIdByAttemptKey(
  attemptKey: string,
  ctx: TenantContext | null,
): Promise<string | null> {
  const key = attemptKey.trim();
  if (!key) return null;
  if (!(await hairCheckoutAttemptKeyColumnReady())) return null;
  const [row] = await hairDb
    .select({ id: fyhInvoices.id })
    .from(fyhInvoices)
    .where(
      and(
        orgFilter(fyhInvoices.organizationId, ctx),
        eq(fyhInvoices.checkoutAttemptKey, key),
        isNull(fyhInvoices.voidedAt),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

function committedResult(
  invoiceId: string,
  correlationId: string,
): BasketCheckoutOperationResult {
  return {
    outcome: 'already_committed',
    invoiceId,
    pricedGrandTotalPaise: 0,
    amountPaidPaise: 0,
    advancePaise: 0,
    receivablePaise: 0,
    correlationId,
  };
}

/**
 * Invoice row is SSOT for commit. Journal augments recovery but never overrides a committed invoice.
 */
export async function reconcileCheckoutAttempt(
  attemptKey: string,
  ctx: TenantContext | null,
  opts?: { correlationId?: string },
): Promise<BasketCheckoutOperationResult | null> {
  const key = attemptKey.trim();
  if (!key) return null;

  const invoiceId = await findCommittedInvoiceIdByAttemptKey(key, ctx);
  if (invoiceId) {
    return committedResult(invoiceId, opts?.correlationId ?? key);
  }

  const [op] = await hairDb
    .select()
    .from(fyhCheckoutOperations)
    .where(
      and(
        orgFilter(fyhCheckoutOperations.organizationId, ctx),
        eq(fyhCheckoutOperations.attemptKey, key),
      ),
    )
    .limit(1);

  if (!op) return null;

  if (op.status === 'committed' && op.invoiceId) {
    return committedResult(op.invoiceId, op.correlationId);
  }

  if (op.status === 'failed') {
    return {
      outcome: 'processing_failed',
      invoiceId: op.invoiceId ?? '',
      pricedGrandTotalPaise: 0,
      amountPaidPaise: 0,
      advancePaise: 0,
      receivablePaise: 0,
      correlationId: op.correlationId,
      error: op.errorMessage ?? 'Checkout failed',
    };
  }

  if (op.status === 'processing' && !op.invoiceId) {
    if (!isStaleCheckoutOperation(op.createdAt)) {
      return {
        outcome: 'ambiguous',
        invoiceId: '',
        pricedGrandTotalPaise: 0,
        amountPaidPaise: 0,
        advancePaise: 0,
        receivablePaise: 0,
        correlationId: op.correlationId,
        error:
          'Checkout is still in progress. Wait a moment, then verify Billing before retrying.',
      };
    }
    return {
      outcome: 'processing_failed',
      invoiceId: '',
      pricedGrandTotalPaise: 0,
      amountPaidPaise: 0,
      advancePaise: 0,
      receivablePaise: 0,
      correlationId: op.correlationId,
      error: STALE_CHECKOUT_OPERATION_ERROR,
    };
  }

  return {
    outcome: 'ambiguous',
    invoiceId: op.invoiceId ?? '',
    pricedGrandTotalPaise: 0,
    amountPaidPaise: 0,
    advancePaise: 0,
    receivablePaise: 0,
    correlationId: op.correlationId,
    error: 'Checkout outcome uncertain — verify Billing before retrying.',
  };
}

export function connectionLossOutcome(
  correlationId: string,
  message: string,
): BasketCheckoutOperationResult {
  return {
    outcome: 'reconciliation_required',
    invoiceId: '',
    pricedGrandTotalPaise: 0,
    amountPaidPaise: 0,
    advancePaise: 0,
    receivablePaise: 0,
    correlationId,
    error: message,
  };
}

