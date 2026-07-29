/**
 * Resolve whether a service consumable row should deduct inventory on paid invoice.
 * Preserves prior DB flags when the form omits an explicit value.
 */
export function resolveConsumableDeductInventory(input: {
  productId: string;
  explicit?: boolean;
  previousByProduct: ReadonlyMap<string, boolean>;
  productIsConsumable?: boolean;
}): boolean {
  if (input.explicit !== undefined) return input.explicit;
  if (input.previousByProduct.has(input.productId)) {
    return input.previousByProduct.get(input.productId)!;
  }
  if (input.productIsConsumable !== undefined) return input.productIsConsumable;
  return true;
}
