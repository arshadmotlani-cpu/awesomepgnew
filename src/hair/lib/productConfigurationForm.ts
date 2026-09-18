import { parseProductType, type FyhProductType } from '@/src/hair/lib/productTypes';

export type ProductFormFieldKey =
  | 'name'
  | 'brandId'
  | 'newBrandName'
  | 'vendorId'
  | 'category'
  | 'description'
  | 'productType'
  | 'costPriceRupees'
  | 'sellingPriceRupees'
  | 'openingStockQty';

export type ProductFormValues = {
  name: string;
  brandId: string;
  newBrandName: string;
  vendorId: string;
  category: string;
  description: string;
  productType: FyhProductType;
  costPriceRupees: string;
  sellingPriceRupees: string;
  openingStockQty: string;
  isActive: boolean;
};

export type ProductFormParseResult =
  | {
      ok: true;
      values: ProductFormValues;
      productInput: {
        name: string;
        brandId: string;
        category: string | null;
        description: string | null;
        productType: FyhProductType;
        costPriceRupees: number;
        sellingPriceRupees: number;
        stockQty: number;
        isActive: boolean;
      };
      newBrandName: string | null;
      vendorId: string | null;
    }
  | { ok: false; values: ProductFormValues; fieldErrors: Partial<Record<ProductFormFieldKey, string>>; error: string };

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function formNum(formData: FormData, key: string, fallback = 0): number {
  const raw = formStr(formData, key);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function productFormValuesFromFormData(formData: FormData): ProductFormValues {
  const productType = parseProductType(formStr(formData, 'productType'));
  return {
    name: formStr(formData, 'name'),
    brandId: formStr(formData, 'brandId'),
    newBrandName: formStr(formData, 'newBrandName'),
    vendorId: formStr(formData, 'vendorId'),
    category: formStr(formData, 'category'),
    description: formStr(formData, 'description'),
    productType,
    costPriceRupees: formStr(formData, 'costPriceRupees') || '0',
    sellingPriceRupees: formStr(formData, 'sellingPriceRupees') || '0',
    openingStockQty: formStr(formData, 'openingStockQty') || '0',
    isActive: formData.get('isActive') !== 'false',
  };
}

export function parseProductConfigurationForm(
  formData: FormData,
  opts?: { allowCost?: boolean; includeOpeningStock?: boolean },
): ProductFormParseResult {
  const values = productFormValuesFromFormData(formData);
  const fieldErrors: Partial<Record<ProductFormFieldKey, string>> = {};

  if (!values.name) fieldErrors.name = 'Product name is required';

  if (!values.brandId && !values.newBrandName) {
    fieldErrors.brandId = 'Select a brand or enter a new brand name';
    fieldErrors.newBrandName = 'Select a brand or enter a new brand name';
  }

  const costPriceRupees = formNum(formData, 'costPriceRupees', 0);
  const stockQty = opts?.includeOpeningStock ? formNum(formData, 'openingStockQty', 0) : 0;
  if (!opts?.allowCost && costPriceRupees !== 0) {
    fieldErrors.costPriceRupees = 'Cost price requires inventory permission';
  }
  if (!opts?.allowCost && stockQty !== 0) {
    fieldErrors.openingStockQty = 'Opening stock requires inventory permission';
  }

  const sellingPriceRupees =
    values.productType === 'retail' ? formNum(formData, 'sellingPriceRupees', 0) : 0;
  if (values.productType === 'retail' && sellingPriceRupees <= 0) {
    fieldErrors.sellingPriceRupees = 'Retail products require a selling price';
  }

  if (Object.keys(fieldErrors).length > 0) {
    const first = Object.values(fieldErrors)[0] ?? 'Please fix the highlighted fields';
    return { ok: false, values, fieldErrors, error: first };
  }

  return {
    ok: true,
    values,
    newBrandName: values.brandId ? null : values.newBrandName,
    vendorId: values.vendorId || null,
    productInput: {
      name: values.name,
      brandId: values.brandId || '__pending__',
      category: values.category || null,
      description: values.description || null,
      productType: values.productType,
      costPriceRupees: opts?.allowCost ? costPriceRupees : 0,
      sellingPriceRupees,
      stockQty: opts?.allowCost ? stockQty : 0,
      isActive: values.isActive,
    },
  };
}

export function mapProductServiceErrorToFields(
  message: string,
  values: ProductFormValues,
): Partial<Record<ProductFormFieldKey, string>> {
  const m = message.toLowerCase();
  if (m.includes('brand')) {
    return { brandId: message, newBrandName: message };
  }
  if (m.includes('selling price')) return { sellingPriceRupees: message };
  if (m.includes('cost')) return { costPriceRupees: message };
  if (m.includes('name already exists')) return { name: message };
  if (m.includes('product name')) return { name: message };
  if (m.includes('opening stock') || m.includes('inventory permission')) {
    return { openingStockQty: message };
  }
  return {};
}
