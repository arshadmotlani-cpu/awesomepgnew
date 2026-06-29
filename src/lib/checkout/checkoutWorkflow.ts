/**
 * Checkout workflow SSOT — monthly (approval-based) vs fixed-stay (refund-only).
 */

export const FIXED_STAY_DURATION_MODES = ['fixed_stay', 'daily', 'weekly'] as const;
export const MONTHLY_DURATION_MODES = ['monthly', 'open_ended'] as const;

export type CheckoutWorkflowKind = 'monthly' | 'fixed_stay';

export function isFixedStayDurationMode(durationMode: string | null | undefined): boolean {
  if (!durationMode) return false;
  return (FIXED_STAY_DURATION_MODES as readonly string[]).includes(durationMode);
}

export function isMonthlyDurationMode(durationMode: string | null | undefined): boolean {
  if (!durationMode) return false;
  return (MONTHLY_DURATION_MODES as readonly string[]).includes(durationMode);
}

export function checkoutWorkflowKind(input: {
  durationMode?: string | null;
  stayType?: string | null;
}): CheckoutWorkflowKind {
  if (input.stayType === 'fixed_date_stay') return 'fixed_stay';
  if (input.stayType === 'monthly_stay') return 'monthly';
  if (isFixedStayDurationMode(input.durationMode)) return 'fixed_stay';
  return 'monthly';
}

/** Monthly residents must get admin approval before move-out proceeds. */
export function requiresMoveOutApproval(durationMode: string | null | undefined): boolean {
  return isMonthlyDurationMode(durationMode);
}

/** Fixed-stay residents never enter the move-out approval queue. */
export function usesRefundOnlyCheckout(durationMode: string | null | undefined): boolean {
  return isFixedStayDurationMode(durationMode);
}
