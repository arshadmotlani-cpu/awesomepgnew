import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhCheckoutOperations, fyhInvoices } from '@/src/hair/db/schema';
import { orgFilter, locationFilter, tenantWriteDefaults } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { friendlyHairDbError } from '@/src/hair/lib/friendlyDbError';
import {
  checkoutFromBasket,
  type CheckoutFromBasketInput,
  type CheckoutFromBasketResult,
} from './pipeline';

export type BasketCheckoutOutcome =
  | 'committed'
  | 'already_committed'
  | 'ambiguous'
  | 'processing_failed'
  | 'persistence_failed'
  | 'validation_failed';

export type BasketCheckoutOperationResult = CheckoutFromBasketResult & {
  outcome: BasketCheckoutOutcome;
  correlationId: string;
  error?: string;
};

export type ExecuteBasketCheckoutParams = CheckoutFromBasketInput & {
  attemptKey: string | null | undefined;
  ctx?: TenantContext | null;
};

async function findInvoiceIdByAttemptKey(
  attemptKey: string,
  ctx: TenantContext | null,
): Promise<string | null> {
  const key = attemptKey.trim();
  if (!key) return null;
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

export async function lookupBasketCheckoutByAttemptKey(
  attemptKey: string,
  ctx?: TenantContext | null,
): Promise<BasketCheckoutOperationResult | null> {
  const key = attemptKey.trim();
  if (!key) return null;
  const resolved = await resolveTenantContextForService(ctx);

  const invoiceId = await findInvoiceIdByAttemptKey(key, resolved);
  if (invoiceId) {
    return {
      outcome: 'already_committed',
      invoiceId,
      pricedGrandTotalPaise: 0,
      amountPaidPaise: 0,
      advancePaise: 0,
      receivablePaise: 0,
      correlationId: key,
    };
  }

  const [op] = await hairDb
    .select()
    .from(fyhCheckoutOperations)
    .where(
      and(
        orgFilter(fyhCheckoutOperations.organizationId, resolved),
        eq(fyhCheckoutOperations.attemptKey, key),
      ),
    )
    .limit(1);
  if (!op) return null;
  if (op.status === 'committed' && op.invoiceId) {
    return {
      outcome: 'already_committed',
      invoiceId: op.invoiceId,
      pricedGrandTotalPaise: 0,
      amountPaidPaise: 0,
      advancePaise: 0,
      receivablePaise: 0,
      correlationId: op.correlationId,
    };
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

export async function executeBasketCheckout(
  params: ExecuteBasketCheckoutParams,
): Promise<BasketCheckoutOperationResult> {
  const correlationId = randomUUID();
  const attemptKey = params.attemptKey?.trim() || null;
  const ctx = await resolveTenantContextForService(params.ctx);
  const writeDefaults = tenantWriteDefaults(ctx);

  if (attemptKey) {
    const prior = await lookupBasketCheckoutByAttemptKey(attemptKey, ctx);
    if (prior?.invoiceId && prior.outcome === 'already_committed') {
      return prior;
    }
    try {
      await hairDb.insert(fyhCheckoutOperations).values({
        ...writeDefaults,
        attemptKey,
        kind: 'basket_checkout',
        status: 'processing',
        correlationId,
      });
    } catch {
      const again = await lookupBasketCheckoutByAttemptKey(attemptKey, ctx);
      if (again?.invoiceId) return again;
    }
  }

  try {
    const result = await checkoutFromBasket({
      ...params,
      checkoutAttemptKey: attemptKey,
      ctx,
    });
    if (attemptKey) {
      await hairDb
        .update(fyhCheckoutOperations)
        .set({
          status: 'committed',
          invoiceId: result.invoiceId,
          committedAt: new Date(),
          errorMessage: null,
        })
        .where(
          and(
            orgFilter(fyhCheckoutOperations.organizationId, ctx),
            eq(fyhCheckoutOperations.attemptKey, attemptKey),
          ),
        );
    }
    return { ...result, outcome: 'committed', correlationId };
  } catch (e) {
    const message = friendlyHairDbError(e, correlationId);
    const outcome: BasketCheckoutOutcome =
      message.includes('permission') || message.includes('required') || message.includes('Select')
        ? 'validation_failed'
        : 'processing_failed';
    if (attemptKey) {
      try {
        const invoiceId = await findInvoiceIdByAttemptKey(attemptKey, ctx);
        if (invoiceId) {
          return {
            ...{
              invoiceId,
              pricedGrandTotalPaise: 0,
              amountPaidPaise: 0,
              advancePaise: 0,
              receivablePaise: 0,
            },
            outcome: 'already_committed',
            correlationId,
          };
        }
        await hairDb
          .update(fyhCheckoutOperations)
          .set({ status: 'failed', errorMessage: message })
          .where(
            and(
              orgFilter(fyhCheckoutOperations.organizationId, ctx),
              eq(fyhCheckoutOperations.attemptKey, attemptKey),
            ),
          );
      } catch {
        // journal update best-effort
      }
    }
    return {
      invoiceId: '',
      pricedGrandTotalPaise: 0,
      amountPaidPaise: 0,
      advancePaise: 0,
      receivablePaise: 0,
      outcome,
      correlationId,
      error: message,
    };
  }
}
