import type { CheckoutSettlementActionState } from '@/src/lib/checkout/checkoutSettlementActionTypes';
import { CHECKOUT_COMPLETE_SUCCESS_MESSAGE } from '@/src/lib/checkout/checkoutSettlementActionTypes';
import { probeCheckoutSettlementCompleteAction } from '@/app/(admin)/admin/checkout-settlements/actions';

export type CheckoutCompleteClientOutcome =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

/** Prefer DB truth when the server committed but the client saw an error. */
export async function resolveCheckoutCompleteClientOutcome(input: {
  settlementId: string;
  result: CheckoutSettlementActionState;
}): Promise<CheckoutCompleteClientOutcome> {
  if (input.result.status === 'ok') {
    return { kind: 'success', message: CHECKOUT_COMPLETE_SUCCESS_MESSAGE };
  }
  if (input.result.status === 'error') {
    const probe = await probeCheckoutSettlementCompleteAction(input.settlementId);
    if (probe.complete) {
      return { kind: 'success', message: CHECKOUT_COMPLETE_SUCCESS_MESSAGE };
    }
    return { kind: 'error', message: input.result.message };
  }
  const probe = await probeCheckoutSettlementCompleteAction(input.settlementId);
  if (probe.complete) {
    return { kind: 'success', message: CHECKOUT_COMPLETE_SUCCESS_MESSAGE };
  }
  return { kind: 'error', message: 'Could not complete checkout.' };
}

export async function resolveCheckoutCompleteAfterClientThrow(input: {
  settlementId: string;
  err: unknown;
}): Promise<CheckoutCompleteClientOutcome> {
  const probe = await probeCheckoutSettlementCompleteAction(input.settlementId);
  if (probe.complete) {
    return { kind: 'success', message: CHECKOUT_COMPLETE_SUCCESS_MESSAGE };
  }
  return {
    kind: 'error',
    message: input.err instanceof Error ? input.err.message : 'Could not complete checkout.',
  };
}
