/**
 * Vehicle activity types — timeline SSOT for Automotive Capital.
 * Cost impact drives Net Vehicle Cost; cash-only types affect float/receivables only.
 */

export const VEHICLE_ACTIVITY_TYPES = [
  'vehicle_created',
  'token_paid',
  'purchase_payment',
  'broker_commission',
  'transport',
  'repair_advance',
  'repair_settlement',
  'fuel',
  'insurance',
  'accessories',
  'washing',
  'service',
  'miscellaneous',
  'investor_contribution',
  'investor_withdrawal',
  'sale',
  'note',
  'document',
  'photo_upload',
] as const;

export type VehicleActivityType = (typeof VEHICLE_ACTIVITY_TYPES)[number];

export type ActivityCostImpact = 'vehicle_cost' | 'cash_only' | 'none';

export type ActivityTypeMeta = {
  type: VehicleActivityType;
  label: string;
  /** How the activity amount affects Net Vehicle Cost / cash */
  costImpact: ActivityCostImpact;
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
    ledgerDirection: null,
    requiresAmount: false,
    selectable: false,
  },
  token_paid: {
    type: 'token_paid',
    label: 'Token Paid',
    costImpact: 'vehicle_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  purchase_payment: {
    type: 'purchase_payment',
    label: 'Purchase Payment',
    costImpact: 'vehicle_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  broker_commission: {
    type: 'broker_commission',
    label: 'Broker Commission',
    costImpact: 'vehicle_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  transport: {
    type: 'transport',
    label: 'Transport',
    costImpact: 'vehicle_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  repair_advance: {
    type: 'repair_advance',
    label: 'Repair Advance',
    costImpact: 'cash_only',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  repair_settlement: {
    type: 'repair_settlement',
    label: 'Repair Settlement',
    costImpact: 'vehicle_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  fuel: {
    type: 'fuel',
    label: 'Fuel',
    costImpact: 'vehicle_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  insurance: {
    type: 'insurance',
    label: 'Insurance',
    costImpact: 'vehicle_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  accessories: {
    type: 'accessories',
    label: 'Accessories',
    costImpact: 'vehicle_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  washing: {
    type: 'washing',
    label: 'Washing',
    costImpact: 'vehicle_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  service: {
    type: 'service',
    label: 'Service',
    costImpact: 'vehicle_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  miscellaneous: {
    type: 'miscellaneous',
    label: 'Miscellaneous Expense',
    costImpact: 'vehicle_cost',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  investor_contribution: {
    type: 'investor_contribution',
    label: 'Investor Contribution',
    costImpact: 'cash_only',
    ledgerDirection: 'credit',
    requiresAmount: true,
    selectable: true,
  },
  investor_withdrawal: {
    type: 'investor_withdrawal',
    label: 'Investor Withdrawal',
    costImpact: 'cash_only',
    ledgerDirection: 'debit',
    requiresAmount: true,
    selectable: true,
  },
  sale: {
    type: 'sale',
    label: 'Sale',
    costImpact: 'none',
    ledgerDirection: 'credit',
    requiresAmount: true,
    selectable: false,
  },
  note: {
    type: 'note',
    label: 'Note',
    costImpact: 'none',
    ledgerDirection: null,
    requiresAmount: false,
    selectable: true,
  },
  document: {
    type: 'document',
    label: 'Document',
    costImpact: 'none',
    ledgerDirection: null,
    requiresAmount: false,
    selectable: true,
  },
  photo_upload: {
    type: 'photo_upload',
    label: 'Photo Upload',
    costImpact: 'none',
    ledgerDirection: null,
    requiresAmount: false,
    selectable: true,
  },
};

export const SELECTABLE_ACTIVITY_TYPES = VEHICLE_ACTIVITY_TYPES.filter(
  (t) => VEHICLE_ACTIVITY_TYPE_META[t].selectable,
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
  rto: 'miscellaneous',
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

export function sumActivityNetVehicleCost(
  rows: Array<{ activityType: string; amountPaise: number | null }>,
): {
  repairTotalPaise: number;
  dealerRefundTotalPaise: number;
  totalExpensePaise: number;
  netVehicleCostPaise: number;
} {
  let repairTotalPaise = 0;
  let dealerRefundTotalPaise = 0;
  for (const row of rows) {
    if (!isVehicleActivityType(row.activityType)) continue;
    const amt = activityCostAmountPaise(row.activityType, row.amountPaise);
    if (amt > 0) repairTotalPaise += amt;
    else if (amt < 0) dealerRefundTotalPaise += -amt;
  }
  const totalExpensePaise = repairTotalPaise - dealerRefundTotalPaise;
  return {
    repairTotalPaise,
    dealerRefundTotalPaise,
    totalExpensePaise,
    /** Activity-derived net cost (no automatic purchase base). */
    netVehicleCostPaise: totalExpensePaise,
  };
}

/** Pure settlement math: advance = actual + returned + stillHeld (stillHeld may be 0). */
export function computeRepairSettlement(input: {
  advancePaise: number;
  actualCostPaise: number;
  returnedPaise: number;
}): {
  outstandingPaise: number;
  vehicleCostPaise: number;
  cashStillHeldPaise: number;
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
  };
}

