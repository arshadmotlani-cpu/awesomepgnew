import type { BasketLine } from '@/src/hair/domain/basket/types';
import { computePackageDiscount } from '@/src/hair/domain/packages/economics';

export type AvailableServiceCreditRow = {
  creditId: string;
  customerPackageId: string;
  packageName: string | null;
  serviceId: string;
  serviceName: string;
  remainingCredits: number;
  effectiveUnitValuePaise: number;
  expiresOn: string | null;
};

export type BasketPrepaidRedemptionMeta = {
  creditId: string;
  customerPackageId: string;
  serviceId: string;
  quantity: number;
  /** Performance value at package effective unit × qty; cash charged is ₹0 */
  effectiveValuePaise: number;
  cashPaise: 0;
};

export function clampRedemptionQty(requested: number, remaining: number): number {
  const req = Math.floor(Number(requested) || 0);
  const rem = Math.floor(Number(remaining) || 0);
  if (req <= 0 || rem <= 0) return 0;
  return Math.min(req, rem);
}

export function buildRedemptionBasketLine(input: {
  credit: AvailableServiceCreditRow;
  requestedQuantity: number;
}): BasketPrepaidRedemptionMeta | null {
  const quantity = clampRedemptionQty(input.requestedQuantity, input.credit.remainingCredits);
  if (quantity <= 0) return null;
  return {
    creditId: input.credit.creditId,
    customerPackageId: input.credit.customerPackageId,
    serviceId: input.credit.serviceId,
    quantity,
    effectiveValuePaise: input.credit.effectiveUnitValuePaise * quantity,
    cashPaise: 0,
  };
}

/** Display economics for package redemption lines — SSOT for basket + invoice presentation. */
export type PackageRedemptionDisplay = {
  unitValuePaise: number;
  packageValuePaise: number;
  packageDiscountPaise: number;
  customerPayablePaise: 0;
  paymentLabel: 'Prepaid / Package';
};

export function projectPackageRedemptionDisplay(input: {
  effectiveUnitValuePaise: number;
  quantity: number;
}): PackageRedemptionDisplay {
  const quantity = Math.max(0, Number(input.quantity) || 0);
  const unitValuePaise = Math.max(0, Math.floor(Number(input.effectiveUnitValuePaise) || 0));
  const packageValuePaise = unitValuePaise * quantity;
  return {
    unitValuePaise,
    packageValuePaise,
    packageDiscountPaise: packageValuePaise,
    customerPayablePaise: 0,
    paymentLabel: 'Prepaid / Package',
  };
}

export function isPackageRedemptionLineName(nameSnapshot: string): boolean {
  return nameSnapshot.includes('Package Redemption');
}

/** Sum draft basket quantities reserved per credit entitlement (keyed by creditId). */
export function sumDraftReservedQtyByCreditId(lines: BasketLine[]): Record<string, number> {
  const reserved: Record<string, number> = {};
  for (const line of lines) {
    const creditId = line.prepaidRedemption?.creditId;
    if (!creditId) continue;
    const qty = Math.max(0, Math.floor(Number(line.quantity) || 0));
    reserved[creditId] = (reserved[creditId] ?? 0) + qty;
  }
  return reserved;
}

export function computeDraftAvailableCredits(input: {
  persistedRemaining: number;
  creditId: string;
  draftReservedByCreditId: Record<string, number>;
}): number {
  const persisted = Math.max(0, Math.floor(Number(input.persistedRemaining) || 0));
  const reserved = Math.max(0, Math.floor(Number(input.draftReservedByCreditId[input.creditId]) || 0));
  return Math.max(0, persisted - reserved);
}

export type DraftRedemptionQtyValidation =
  | { ok: true; quantity: number }
  | { ok: false; error: string };

export function validateDraftRedemptionQty(input: {
  requestedQty: number;
  persistedRemaining: number;
  creditId: string;
  draftReservedByCreditId: Record<string, number>;
}): DraftRedemptionQtyValidation {
  const requested = Math.floor(Number(input.requestedQty) || 0);
  if (requested <= 0) {
    return { ok: false, error: 'Quantity must be positive' };
  }
  const available = computeDraftAvailableCredits({
    persistedRemaining: input.persistedRemaining,
    creditId: input.creditId,
    draftReservedByCreditId: input.draftReservedByCreditId,
  });
  if (requested > available) {
    return {
      ok: false,
      error: `Only ${available} credit${available === 1 ? '' : 's'} available`,
    };
  }
  return { ok: true, quantity: requested };
}

export function computePackageRedemptionUnitDiscount(
  retailUnitPaise: number,
  effectiveUnitPaise: number,
): number {
  const retail = Math.max(0, Math.floor(Number(retailUnitPaise) || 0));
  const effective = Math.max(0, Math.floor(Number(effectiveUnitPaise) || 0));
  if (retail <= 0) return 0;
  return computePackageDiscount(retail, effective).discountPercentDisplay;
}

export function formatPackageRedemptionDiscountLabel(discountPercent: number): string {
  const pct = Math.max(0, Number(discountPercent) || 0);
  const formatted = pct % 1 === 0 ? String(pct) : pct.toFixed(2);
  return `${formatted}% off`;
}
