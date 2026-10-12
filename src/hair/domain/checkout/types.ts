export type BasketCheckoutOutcome =
  | 'committed'
  | 'already_committed'
  | 'ambiguous'
  | 'processing_failed'
  | 'persistence_failed'
  | 'validation_failed'
  | 'reconciliation_required';

export type BasketCheckoutOperationResult = {
  invoiceId: string;
  pricedGrandTotalPaise: number;
  amountPaidPaise: number;
  advancePaise: number;
  receivablePaise: number;
  outcome: BasketCheckoutOutcome;
  correlationId: string;
  error?: string;
};
