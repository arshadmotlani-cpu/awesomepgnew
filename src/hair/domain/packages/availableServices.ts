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
