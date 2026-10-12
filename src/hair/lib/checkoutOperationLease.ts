/** Slightly above client checkout timeout so recovery can fail stale leases safely. */
export const QUICK_SALE_CHECKOUT_OPERATION_STALE_MS = 95_000;

export function isStaleCheckoutOperation(createdAt: Date, nowMs = Date.now()): boolean {
  return nowMs - createdAt.getTime() > QUICK_SALE_CHECKOUT_OPERATION_STALE_MS;
}

export const STALE_CHECKOUT_OPERATION_ERROR =
  'Previous checkout did not finish (server timeout). Verify Billing before retrying.';
