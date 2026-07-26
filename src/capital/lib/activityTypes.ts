/**
 * Vehicle activity types — timeline SSOT for Automotive Capital.
 *
 * Financial SSOT (ADR-016 / Option 2):
 *   Total Vehicle Investment = Purchase Price + Σ Investment Cost activities (signed)
 *   Payment milestones (token / purchase payment) NEVER enter the investment sum.
 */

export const VEHICLE_ACTIVITY_TYPES = [
  'vehicle_created',
  'token_paid',
  'purchase_payment',
  'final_purchase_payment',
  'broker_commission',
  'transport',
  'repair_advance',
  'repair_settlement',
  'fuel',
  'insurance',
  'accessories',
  'washing',
  'service',
  'rto',
  'storage',
  'miscellaneous',
  'investor_contribution',
  'investor_withdrawal',
  'sale',
  'note',
  'document',
  'photo_upload',
] as const;

export type VehicleActivityType = (typeof VEHICLE_ACTIVITY_TYPES)[number];

/** How the activity amount affects Total Vehicle Investment / cash */
export type ActivityCostImpact = 'vehicle_cost' | 'cash_only' | 'none';

/** Dealer-facing category for pickers and docs */
export type ActivityCategory =
  | 'payment_milestone'
  | 'investment_cost'
  | 'cash_float'
  | 'other';

export type ActivityTypeMeta = {
  type: VehicleActivityType;
  label: string;
  costImpact: ActivityCostImpact;
  category: ActivityCategory;
  /** Ledger direction when posting a positive amount (negative flips) */
  ledgerDirection: 'debit' | 'credit' | null;
  requiresAmount: boolean;
  /** Shown in Add Activity picker */
  selectable: boolean;
};

export const VEHICLE_ACTIVITY_TYPE_META: Record<VehicleActivityType, ActivityTypeMeta> = {
  vehicle_created: {
    type: 'vehicle_created',
    label: 'Vehicle Created',
    costImpact: 'none',
    category: 'other',
    ledgerDirection: null,
    requiresAmount: false,
    selectable: false,
  },
  token_paid: {
    type: 'token_paid',
    label: 'Token Paid',
    costImpact: 'cash_only',
    category: 'payment_milestone',
    ledgerDirection: 'debit',
    requiresAmount: true,
    /** Create-time / dedicated payment UI only — not Activities form. */
    selectable: false,
  },
  purchase_payment: {
    type: 'purchase_payment',
    label: 'Purchase Payment',
    costImpact: 'cash_only',
    category: 'payment_milestone',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: false,
  },
  final_purchase_payment: {
    type: 'final_purchase_payment',
    label: 'Final Purchase Payment',
    costImpact: 'cash_only',
    category: 'payment_milestone',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: false,
  },
  broker_commission: {
    type: 'broker_commission',
    label: 'Broker Commission',
    costImpact: 'vehicle_cost',
    category: 'investment_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  transport: {
    type: 'transport',
    label: 'Transportation Charges',
    costImpact: 'vehicle_cost',
    category: 'investment_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  repair_advance: {
    type: 'repair_advance',
    label: 'Repair Advance',
    costImpact: 'cash_only',
    category: 'cash_float',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  repair_settlement: {
    type: 'repair_settlement',
    label: 'Repair Settlement',
    costImpact: 'vehicle_cost',
    category: 'investment_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  fuel: {
    type: 'fuel',
    label: 'Fuel',
    costImpact: 'vehicle_cost',
    category: 'investment_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  insurance: {
    type: 'insurance',
    label: 'Insurance',
    costImpact: 'vehicle_cost',
    category: 'investment_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  accessories: {
    type: 'accessories',
    label: 'Accessories',
    costImpact: 'vehicle_cost',
    category: 'investment_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  washing: {
    type: 'washing',
    label: 'Washing / Detailing',
    costImpact: 'vehicle_cost',
    category: 'investment_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  service: {
    type: 'service',
    label: 'Service',
    costImpact: 'vehicle_cost',
    category: 'investment_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  rto: {
    type: 'rto',
    label: 'Registration / RTO',
    costImpact: 'vehicle_cost',
    category: 'investment_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  storage: {
    type: 'storage',
    label: 'Storage Charges',
    costImpact: 'vehicle_cost',
    category: 'investment_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  miscellaneous: {
    type: 'miscellaneous',
    label: 'Miscellaneous',
    costImpact: 'vehicle_cost',
    category: 'investment_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  investor_contribution: {
    type: 'investor_contribution',
    label: 'Investor Contribution',
    costImpact: 'cash_only',
    category: 'cash_float',
    ledgerDirection: 'credit',
    requiresAmount: true,
    selectable: true,
  },
  investor_withdrawal: {
    type: 'investor_withdrawal',
    label: 'Investor Withdrawal',
    costImpact: 'cash_only',
    category: 'cash_float',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  sale: {
    type: 'sale',
    label: 'Sale',
    costImpact: 'none',
    category: 'other',
    ledgerDirection: 'credit',
    requiresAmount: true,
    selectable: false,
  },
  note: {
    type: 'note',
    label: 'Note',
    costImpact: 'none',
    category: 'other',
    ledgerDirection: null,
    requiresAmount: false,
    selectable: true,
  },
  document: {
    type: 'document',
    label: 'Document',
    costImpact: 'none',
    category: 'other',
    ledgerDirection: null,
    requiresAmount: false,
    selectable: true,
  },
  photo_upload: {
    type: 'photo_upload',
    label: 'Photo Upload',
    costImpact: 'none',
    category: 'other',
    ledgerDirection: null,
    requiresAmount: false,
    selectable: true,
  },
};

export const SELECTABLE_ACTIVITY_TYPES = VEHICLE_ACTIVITY_TYPES.filter(
  (t) => VEHICLE_ACTIVITY_TYPE_META[t].selectable,
);

export const PAYMENT_MILESTONE_TYPES = VEHICLE_ACTIVITY_TYPES.filter(
  (t) => VEHICLE_ACTIVITY_TYPE_META[t].category === 'payment_milestone',
);

export const INVESTMENT_COST_TYPES = VEHICLE_ACTIVITY_TYPES.filter(
  (t) => VEHICLE_ACTIVITY_TYPE_META[t].category === 'investment_cost',
);

/** Map legacy expense category slugs → activity types for backfill. */
export const EXPENSE_CATEGORY_TO_ACTIVITY: Record<string, VehicleActivityType> = {
  purchase: 'purchase_payment',
  repair: 'miscellaneous',
  painting: 'miscellaneous',
  denting: 'miscellaneous',
  engine: 'service',
  accessories: 'accessories',
  fuel: 'fuel',
  insurance: 'insurance',
  broker: 'broker_commission',
  transport: 'transport',
  cleaning: 'washing',
  rto: 'rto',
  miscellaneous: 'miscellaneous',
  expense_adjustment: 'miscellaneous',
};

export function isVehicleActivityType(value: string): value is VehicleActivityType {
  return (VEHICLE_ACTIVITY_TYPES as readonly string[]).includes(value);
}

export function activityCostAmountPaise(
  type: VehicleActivityType,
  amountPaise: number | null | undefined,
): number {
  const meta = VEHICLE_ACTIVITY_TYPE_META[type];
  if (meta.costImpact !== 'vehicle_cost') return 0;
  return Math.round(amountPaise ?? 0);
}

export function isPaymentMilestoneType(type: string): boolean {
  return isVehicleActivityType(type) && VEHICLE_ACTIVITY_TYPE_META[type].category === 'payment_milestone';
}

/** Sum of investment-cost activity amounts only (no purchase base). */
export function sumInvestmentCostActivitiesPaise(
  rows: Array<{ activityType: string; amountPaise: number | null }>,
): {
  repairTotalPaise: number;
  dealerRefundTotalPaise: number;
  totalExpensePaise: number;
} {
  let repairTotalPaise = 0;
  let dealerRefundTotalPaise = 0;
  for (const row of rows) {
    if (!isVehicleActivityType(row.activityType)) continue;
    const amt = activityCostAmountPaise(row.activityType, row.amountPaise);
    if (amt > 0) repairTotalPaise += amt;
    else if (amt < 0) dealerRefundTotalPaise += -amt;
  }
  return {
    repairTotalPaise,
    dealerRefundTotalPaise,
    totalExpensePaise: repairTotalPaise - dealerRefundTotalPaise,
  };
}

/**
 * Frozen Option 2 SSOT:
 * Total Vehicle Investment = Purchase Price + Σ investment-cost activities (signed).
 * Payment milestones are excluded via costImpact = cash_only.
 */
export function computeTotalVehicleInvestment(input: {
  purchasePricePaise: number;
  activities: Array<{ activityType: string; amountPaise: number | null }>;
}): {
  purchasePricePaise: number;
  investmentCostsPaise: number;
  dealerRefundTotalPaise: number;
  /** Alias used by recalc / ROI denominator */
  netVehicleCostPaise: number;
  repairTotalPaise: number;
  totalExpensePaise: number;
} {
  const purchasePricePaise = Math.round(input.purchasePricePaise);
  const costs = sumInvestmentCostActivitiesPaise(input.activities);
  return {
    purchasePricePaise,
    investmentCostsPaise: costs.totalExpensePaise,
    dealerRefundTotalPaise: costs.dealerRefundTotalPaise,
    repairTotalPaise: costs.repairTotalPaise,
    totalExpensePaise: costs.totalExpensePaise,
    netVehicleCostPaise: purchasePricePaise + costs.totalExpensePaise,
  };
}

/** @deprecated Prefer computeTotalVehicleInvestment — kept for callers that only need cost lines. */
export function sumActivityNetVehicleCost(
  rows: Array<{ activityType: string; amountPaise: number | null }>,
): {
  repairTotalPaise: number;
  dealerRefundTotalPaise: number;
  totalExpensePaise: number;
  /** Investment-cost sum only (no purchase base). */
  netVehicleCostPaise: number;
} {
  const costs = sumInvestmentCostActivitiesPaise(rows);
  return {
    ...costs,
    netVehicleCostPaise: costs.totalExpensePaise,
  };
}

export function sumPaymentMilestonesPaise(
  rows: Array<{ activityType: string; amountPaise: number | null }>,
): number {
  let total = 0;
  for (const row of rows) {
    if (!isPaymentMilestoneType(row.activityType)) continue;
    total += Math.round(row.amountPaise ?? 0);
  }
  return total;
}

/**
 * Cash still owed to the seller toward Purchase Price.
 * Token + purchase payments are payment progress — not TVI.
 */
export function remainingPurchasePaymentPaise(
  purchasePricePaise: number,
  milestonesPaidPaise: number,
): number {
  return Math.max(0, Math.round(purchasePricePaise) - Math.round(milestonesPaidPaise));
}

/** Pure settlement math for repair advances. */
export function computeRepairSettlement(input: {
  advancePaise: number;
  actualCostPaise: number;
  returnedPaise: number;
}): {
  outstandingPaise: number;
  vehicleCostPaise: number;
  cashStillHeldPaise: number;
  /** When actual exceeds advance — additional cash the dealer must cover */
  additionalAmountRequiredPaise: number;
} {
  const advancePaise = Math.round(input.advancePaise);
  const actualCostPaise = Math.round(input.actualCostPaise);
  const returnedPaise = Math.round(input.returnedPaise);
  if (advancePaise <= 0) throw new Error('Advance must be positive');
  if (actualCostPaise < 0) throw new Error('Actual cost cannot be negative');
  if (returnedPaise < 0) throw new Error('Returned amount cannot be negative');
  const outstandingPaise = advancePaise - actualCostPaise - returnedPaise;
  return {
    outstandingPaise,
    vehicleCostPaise: actualCostPaise,
    cashStillHeldPaise: Math.max(0, outstandingPaise),
    additionalAmountRequiredPaise: Math.max(0, -outstandingPaise),
  };
}
