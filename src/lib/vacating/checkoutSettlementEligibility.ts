/** Vacating statuses that may have an active checkout settlement row created. */
export const CHECKOUT_SETTLEMENT_VACATING_STATUSES = ['approved', 'completed'] as const;

export type CheckoutSettlementVacatingStatus =
  (typeof CHECKOUT_SETTLEMENT_VACATING_STATUSES)[number];

export function vacatingStatusAllowsCheckoutSettlement(status: string): boolean {
  return (CHECKOUT_SETTLEMENT_VACATING_STATUSES as readonly string[]).includes(status);
}

export const CHECKOUT_SETTLEMENT_BLOCKED_VACATING_MESSAGE =
  'Move-out must be approved before checkout settlement can be created.';
