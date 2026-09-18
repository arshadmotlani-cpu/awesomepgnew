'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { hasPermission, requirePermission } from '@/src/hair/lib/auth/permissions';
import {
  mapProductServiceErrorToFields,
  parseProductConfigurationForm,
  productFormValuesFromFormData,
  type ProductFormFieldKey,
  type ProductFormValues,
} from '@/src/hair/lib/productConfigurationForm';
import { getTenantContextForAction } from '@/src/hair/lib/tenant/getTenantContext';
import { findOrCreateBrand } from '@/src/hair/services/brands';
import { createVendor } from '@/src/hair/services/vendors';
import {
  adjustProductStock,
  archiveProduct,
  createProductFromConfiguration,
  deleteProduct,
  getProduct,
  restoreProduct,
  updateProduct,
  type ProductInput,
} from '@/src/hair/services/products';

export type ProductActionState = {
  error?: string;
  success?: string;
  productId?: string;
  fieldErrors?: Partial<Record<ProductFormFieldKey, string>>;
  values?: ProductFormValues;
  stockValues?: StockAdjustFormValues;
};

export type StockAdjustFormValues = {
  quantityDelta: string;
  reason: string;
};

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

async function resolveBrandIdFromForm(
  formData: FormData,
  ctx: Awaited<ReturnType<typeof getTenantContextForAction>>,
): Promise<string> {
  const brandId = formStr(formData, 'brandId');
  if (brandId) return brandId;
  const newBrandName = formStr(formData, 'newBrandName');
  if (!newBrandName) throw new Error('Select a brand or enter a new brand name');
  const vendorId = formStr(formData, 'vendorId') || null;
  const brand = await findOrCreateBrand(newBrandName, vendorId, ctx);
  return brand.id;
}

function failureState(
  error: string,
  values: ProductFormValues,
  fieldErrors?: Partial<Record<ProductFormFieldKey, string>>,
): ProductActionState {
  return {
    error,
    values,
    fieldErrors: fieldErrors ?? mapProductServiceErrorToFields(error, values),
  };
}

export async function getProductCostAction(
  productId: string,
): Promise<{ error?: string; costPricePaise?: number }> {
  try {
    await requirePermission('page:inventory');
    const product = await getProduct(productId);
    if (!product) return { error: 'Product not found' };
    return { costPricePaise: product.costPricePaise };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Cannot view product cost' };
  }
}

export async function createProductAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const values = productFormValuesFromFormData(formData);
  try {
    const admin = await requireHairAuth();
    const ctx = await getTenantContextForAction();
    const allowCost = hasPermission(admin, 'page:inventory');
    const parsed = parseProductConfigurationForm(formData, {
      allowCost,
      includeOpeningStock: true,
    });
    if (!parsed.ok) {
      return failureState(parsed.error, parsed.values, parsed.fieldErrors);
    }

    const product = await createProductFromConfiguration(
      parsed.productInput as ProductInput,
      {
        brandId: parsed.values.brandId || undefined,
        newBrandName: parsed.newBrandName,
        vendorId: parsed.vendorId,
      },
      ctx,
    );

    revalidatePath('/products');
    revalidatePath('/inventory/stock');
    revalidatePath('/quick-sale');
    if (formStr(formData, 'returnToList') === '1') {
      return { success: 'Product created.', productId: product.id };
    }
    redirect(`/products/${product.id}`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    const message = e instanceof Error ? e.message : 'Failed to create product';
    return failureState(message, values);
  }
}

export async function updateProductAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const values = productFormValuesFromFormData(formData);
  try {
    const admin = await requireHairAuth();
    const ctx = await getTenantContextForAction();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing product id', values };
    const allowCost = hasPermission(admin, 'page:inventory');
    const parsed = parseProductConfigurationForm(formData, { allowCost });
    if (!parsed.ok) {
      return failureState(parsed.error, parsed.values, parsed.fieldErrors);
    }
    const input = parsed.productInput as ProductInput;
    input.brandId = await resolveBrandIdFromForm(formData, ctx);
    if (!allowCost) {
      const existing = await getProduct(id, ctx);
      if (existing) {
        input.costPriceRupees = existing.costPricePaise / 100;
      }
    }
    await updateProduct(id, input, ctx);
    revalidatePath('/products');
    revalidatePath(`/products/${id}`);
    revalidatePath('/inventory/stock');
    revalidatePath('/quick-sale');
    if (formStr(formData, 'returnToList') === '1') {
      return { success: 'Product updated.', productId: id };
    }
    return { success: 'Product updated.' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update product';
    return failureState(message, values);
  }
}

export async function adjustProductStockAction(
  _prev: ProductActionState & { stockValues?: StockAdjustFormValues },
  formData: FormData,
): Promise<ProductActionState & { stockValues?: StockAdjustFormValues }> {
  const stockValues: StockAdjustFormValues = {
    quantityDelta: formStr(formData, 'quantityDelta'),
    reason: formStr(formData, 'reason'),
  };
  try {
    await requireHairAuth();
    await requirePermission('page:inventory');
    const ctx = await getTenantContextForAction();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing product id', stockValues };
    const delta = Number(stockValues.quantityDelta);
    const reason = stockValues.reason;
    if (!reason) {
      return { error: 'Adjustment reason is required', stockValues };
    }
    if (!Number.isFinite(delta) || delta === 0) {
      return { error: 'Enter a non-zero quantity change (+ or −)', stockValues };
    }
    await adjustProductStock(id, delta, reason, ctx);
    revalidatePath('/products');
    revalidatePath('/inventory/stock');
    revalidatePath('/quick-sale');
    return { success: 'Stock adjusted.' };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Stock adjustment failed',
      stockValues,
    };
  }
}

export async function restoreProductAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    await requireHairAuth();
    const ctx = await getTenantContextForAction();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing product id' };
    await restoreProduct(id, ctx);
    revalidatePath('/products');
    revalidatePath('/quick-sale');
    return { success: 'Product activated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to activate product' };
  }
}

export async function quickCreateVendorForProductAction(
  name: string,
): Promise<{ error?: string; vendor?: { id: string; name: string } }> {
  try {
    await requireHairAuth();
    const ctx = await getTenantContextForAction();
    const trimmed = name.trim();
    if (!trimmed) return { error: 'Vendor name is required' };
    const vendor = await createVendor({ name: trimmed, isActive: true }, ctx);
    revalidatePath('/products');
    revalidatePath('/vendors');
    return { vendor: { id: vendor.id, name: vendor.name } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create vendor' };
  }
}

export async function archiveProductAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    await requireHairAuth();
    const ctx = await getTenantContextForAction();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing product id' };
    await archiveProduct(id, ctx);
    revalidatePath('/products');
    revalidatePath('/inventory/stock');
    revalidatePath('/quick-sale');
    redirect('/products?status=inactive');
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to archive product' };
  }
}

export async function deleteProductAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    await requireHairAuth();
    const ctx = await getTenantContextForAction();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing product id' };
    await deleteProduct(id, ctx);
    revalidatePath('/products');
    revalidatePath('/inventory/stock');
    revalidatePath('/quick-sale');
    redirect('/products');
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to delete product' };
  }
}
