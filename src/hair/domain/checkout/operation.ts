import { randomUUID } from 'node:crypto';
import { tenantWriteDefaults } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { friendlyHairDbError } from '@/src/hair/lib/friendlyDbError';
import {
  hairCheckoutOperationsTableReady,
} from '@/src/hair/lib/checkoutSchemaCapabilities';
import {
  invalidateHairDbOnConnectionError,
  isHairPostgresConnectionError,
  isIdleInTransactionSessionTimeout,
  logCheckoutDbEvent,
} from '@/src/hair/lib/checkoutDbError';
import {
  checkoutFromBasket,
  type CheckoutFromBasketInput,
} from './pipeline';
import { claimCheckoutOperationLease, markCheckoutOperationFailed, markStaleProcessingOperationsFailed } from './claimLease';
import {
  connectionLossOutcome,
  findCommittedInvoiceIdByAttemptKey,
  reconcileCheckoutAttempt,
} from './reconcileAttempt';
import type { BasketCheckoutOperationResult, BasketCheckoutOutcome } from './types';

export type { BasketCheckoutOutcome, BasketCheckoutOperationResult };

export type ExecuteBasketCheckoutParams = CheckoutFromBasketInput & {
  attemptKey: string | null | undefined;
  ctx?: TenantContext | null;
};

export async function lookupBasketCheckoutByAttemptKey(
  attemptKey: string,
  ctx?: TenantContext | null,
): Promise<BasketCheckoutOperationResult | null> {
  const key = attemptKey.trim();
  if (!key) return null;
  const resolved = await resolveTenantContextForService(ctx);

  const reconciled = await reconcileCheckoutAttempt(key, resolved);
  if (!reconciled) return null;

  if (
    reconciled.outcome === 'processing_failed' &&
    reconciled.error?.includes('did not finish')
  ) {
    await markStaleProcessingOperationsFailed(key, resolved, reconciled.error);
  }

  return reconciled;
}

export async function executeBasketCheckout(
  params: ExecuteBasketCheckoutParams,
): Promise<BasketCheckoutOperationResult> {
  const correlationId = randomUUID();
  const attemptKey = params.attemptKey?.trim() || null;
  const ctx = await resolveTenantContextForService(params.ctx);
  const writeDefaults = tenantWriteDefaults(ctx);

  const operationsTableReady = attemptKey ? await hairCheckoutOperationsTableReady() : false;

  if (attemptKey) {
    const prior = await reconcileCheckoutAttempt(attemptKey, ctx, { correlationId });
    if (prior?.outcome === 'already_committed' && prior.invoiceId) {
      return prior;
    }
    if (prior?.outcome === 'ambiguous') {
      return { ...prior, correlationId };
    }
    if (operationsTableReady) {
      const claimed = await claimCheckoutOperationLease({
        attemptKey,
        correlationId,
        ctx,
        writeDefaults,
      });
      logCheckoutDbEvent('claim_lease', {
        attemptKey,
        correlationId,
        claimed,
      });
      if (claimed === 'already_committed') {
        const invoiceId = await findCommittedInvoiceIdByAttemptKey(attemptKey, ctx);
        if (invoiceId) {
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
      }
      if (claimed === 'in_progress') {
        return {
          invoiceId: '',
          pricedGrandTotalPaise: 0,
          amountPaidPaise: 0,
          advancePaise: 0,
          receivablePaise: 0,
          outcome: 'ambiguous',
          correlationId,
          error:
            'Checkout is still in progress. Wait a moment, then verify Billing before retrying.',
        };
      }
    }
  }

  try {
    logCheckoutDbEvent('checkout_transaction', { attemptKey, correlationId, phase: 'start' });
    const result = await checkoutFromBasket({
      ...params,
      checkoutAttemptKey: attemptKey,
      checkoutOperationCorrelationId: operationsTableReady ? correlationId : null,
      ctx,
    });
    logCheckoutDbEvent('checkout_transaction', {
      attemptKey,
      correlationId,
      phase: 'committed',
      invoiceId: result.invoiceId,
    });
    return { ...result, outcome: 'committed', correlationId };
  } catch (e) {
    await invalidateHairDbOnConnectionError(e);
    logCheckoutDbEvent('checkout_transaction', {
      attemptKey,
      correlationId,
      phase: 'error',
      connectionError: isHairPostgresConnectionError(e),
    });

    const message = friendlyHairDbError(e, correlationId);
    const validationFailed =
      message.includes('permission') ||
      message.includes('required') ||
      message.includes('Select');

    if (attemptKey) {
      const reconciled = await reconcileCheckoutAttempt(attemptKey, ctx, { correlationId });
      logCheckoutDbEvent('reconcile', {
        attemptKey,
        correlationId,
        outcome: reconciled?.outcome ?? null,
      });
      if (reconciled?.outcome === 'already_committed' && reconciled.invoiceId) {
        return { ...reconciled, correlationId };
      }
      if (
        isIdleInTransactionSessionTimeout(e) &&
        reconciled?.outcome === 'ambiguous' &&
        operationsTableReady
      ) {
        const stalled =
          'Checkout stalled before it could be saved. Verify Billing, then retry.';
        try {
          await markCheckoutOperationFailed({
            attemptKey,
            ctx,
            correlationId,
            errorMessage: stalled,
            onlyIfProcessing: true,
          });
        } catch {
          // best-effort journal
        }
        return {
          ...reconciled,
          outcome: 'processing_failed',
          correlationId,
          error: stalled,
        };
      }
      if (isHairPostgresConnectionError(e) && reconciled?.outcome === 'ambiguous') {
        return connectionLossOutcome(
          correlationId,
          'Connection to billing database was lost during checkout. Verify Billing before retrying.',
        );
      }
      if (operationsTableReady && reconciled?.outcome === 'processing_failed') {
        try {
          await markStaleProcessingOperationsFailed(
            attemptKey,
            ctx,
            reconciled.error ?? message,
          );
        } catch {
          // best-effort
        }
        return { ...reconciled, correlationId };
      }
      if (operationsTableReady && !validationFailed) {
        try {
          await markCheckoutOperationFailed({
            attemptKey,
            ctx,
            correlationId,
            errorMessage: message,
            onlyIfProcessing: true,
          });
        } catch {
          // best-effort journal
        }
      }
    }

    const outcome: BasketCheckoutOutcome = validationFailed ? 'validation_failed' : 'processing_failed';
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
