/**
 * Vehicle economics helpers — Seller Payments + Vehicle Costs → Remaining / TVI.
 * Funding Sources ledger removed (dealership OS — not treasury accounting).
 */

import type { SellerPaymentKind } from '@/src/capital/db/schema/sellerPayments';
import type { VehicleCostType } from '@/src/capital/db/schema/vehicleCosts';

export type SellerPaymentAmountRow = {
  amountPaise: number;
  isReversed?: boolean;
};

export type VehicleCostAmountRow = {
  amountPaise: number;
  isReversed?: boolean;
};

/** Σ active seller payments (paise). */
export function sumSellerPaymentsPaise(rows: SellerPaymentAmountRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (row.isReversed) continue;
    total += Math.round(row.amountPaise);
  }
  return total;
}

/** Cash still owed to the seller toward Purchase Price. Null if price is not set. */
export function remainingPurchaseFromSellerPayments(
  purchasePricePaise: number,
  paidPaise: number,
): number | null {
  if (Math.round(purchasePricePaise) <= 0) return null;
  return Math.max(0, Math.round(purchasePricePaise) - Math.round(paidPaise));
}

/** True when a negotiated purchase price exists (required for remaining / funding status). */
export function isPurchasePriceSet(purchasePricePaise: number): boolean {
  return Math.round(purchasePricePaise) > 0;
}

/**
 * TVI = Purchase Price + Σ vehicle cost amounts (signed; refunds negative).
 * ADR-016.
 */
export function computeTviFromCosts(input: {
  purchasePricePaise: number;
  costs: VehicleCostAmountRow[];
}): {
  purchasePricePaise: number;
  costsPaise: number;
  totalVehicleInvestmentPaise: number;
} {
  const purchasePricePaise = Math.round(input.purchasePricePaise);
  let costsPaise = 0;
  for (const row of input.costs) {
    if (row.isReversed) continue;
    costsPaise += Math.round(row.amountPaise);
  }
  return {
    purchasePricePaise,
    costsPaise,
    totalVehicleInvestmentPaise: purchasePricePaise + costsPaise,
  };
}

export const SELLER_PAYMENT_KIND_LABELS: Record<SellerPaymentKind, string> = {
  token: 'Token',
  purchase: 'Purchase Payment',
  final: 'Final Purchase Payment',
};

export const SELLER_PAYMENT_INSTRUMENT_LABELS: Record<
  'cash' | 'upi' | 'neft' | 'rtgs' | 'cheque' | 'bank',
  string
> = {
  cash: 'Cash',
  upi: 'UPI',
  neft: 'NEFT',
  rtgs: 'RTGS',
  cheque: 'Cheque',
  bank: 'Bank',
};

export const VEHICLE_COST_TYPE_LABELS: Record<VehicleCostType, string> = {
  broker_commission: 'Broker Commission',
  transport: 'Transportation Charges',
  repair_settlement: 'Repair Settlement',
  fuel: 'Fuel',
  insurance: 'Insurance',
  accessories: 'Accessories',
  washing: 'Washing / Detailing',
  service: 'Service',
  rto: 'Registration / RTO',
  storage: 'Storage Charges',
  miscellaneous: 'Miscellaneous',
  refund: 'Refund',
};
