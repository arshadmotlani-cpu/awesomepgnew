export const FYH_PRODUCT_TYPES = ['professional', 'retail'] as const;
export type FyhProductType = (typeof FYH_PRODUCT_TYPES)[number];

export function productTypeLabel(type: FyhProductType): string {
  return type === 'professional' ? 'Professional' : 'Retail';
}

export function parseProductType(raw: string): FyhProductType {
  return raw === 'professional' ? 'professional' : 'retail';
}

export function productProfitPaise(product: {
  productType: FyhProductType;
  sellingPricePaise: number;
  costPricePaise: number;
}): number {
  if (product.productType !== 'retail') return 0;
  return Math.max(0, product.sellingPricePaise - product.costPricePaise);
}

export function productMarginPercent(product: {
  productType: FyhProductType;
  sellingPricePaise: number;
  costPricePaise: number;
}): number {
  if (product.productType !== 'retail' || product.sellingPricePaise <= 0) return 0;
  return Math.round(
    (productProfitPaise(product) * 10000) / product.sellingPricePaise,
  ) / 100;
}
