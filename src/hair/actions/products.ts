'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { hasPermission, requirePermission } from '@/src/hair/lib/auth/permissions';
import { getTenantContextForAction } from '@/src/hair/lib/tenant/getTenantContext';
import { parseProductType } from '@/src/hair/lib/productTypes';
import { findOrCreateBrand } from '@/src/hair/services/brands';
import { createVendor } from '@/src/hair/services/vendors';
import {
  adjustProductStock,
  archiveProduct,
  createProduct,
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
};

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function formNum(formData: FormData, key: string, fallback = 0): number {
  const raw = formStr(formData, key);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
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

function parseProductForm(
  formData: FormData,
  opts?: { allowCost?: boolean; includeOpeningStock?: boolean },
): ProductInput {
  const name = formStr(formData, 'name');
  if (!name) throw new Error('Product name is required');
  const brandId = formStr(formData, 'brandId');
  if (!brandId && !formStr(formData, 'newBrandName')) {
    throw new Error('Brand is required');
  }
  const productType = parseProductType(formStr(formData, 'productType'));
  const costPriceRupees = formNum(formData, 'costPriceRupees', 0);
  if (!opts?.allowCost && costPriceRupees !== 0) {
    throw new Error('Product cost requires inventory permission');
  }
  const stockQty = opts?.includeOpeningStock ? formNum(formData, 'openingStockQty', 0) : 0;
  if (!opts?.allowCost && stockQty !== 0) {
    throw new Error('Opening stock requires inventory permission');
  }
  const sellingPriceRupees =
    productType === 'retail' ? formNum(formData, 'sellingPriceRupees', 0) : 0;

  return {
    name,
    brandId: brandId || '__pending__',
    category: formStr(formData, 'category') || null,
    description: formStr(formData, 'description') || null,
    productType,
    costPriceRupees: opts?.allowCost ? costPriceRupees : 0,
    sellingPriceRupees,
    stockQty: opts?.allowCost ? stockQty : 0,
    isActive: formData.get('isActive') !== 'false',
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
  try {
    const admin = await requireHairAuth();
    const ctx = await getTenantContextForAction();
    const allowCost = hasPermission(admin, 'page:inventory');
    const input = parseProductForm(formData, { allowCost, includeOpeningStock: true });
    input.brandId = await resolveBrandIdFromForm(formData, ctx);
    const product = await createProduct(input, ctx);
    revalidatePath('/products');
    revalidatePath('/inventory/stock');
    revalidatePath('/quick-sale');
    if (formStr(formData, 'returnToList') === '1') {
      return { success: 'Product created.', productId: product.id };
    }
    redirect(`/products/${product.id}`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to create product' };
  }
}

export async function updateProductAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    const admin = await requireHairAuth();
    const ctx = await getTenantContextForAction();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing product id' };
    const allowCost = hasPermission(admin, 'page:inventory');
    const input = parseProductForm(formData, { allowCost });
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
    return { error: e instanceof Error ? e.message : 'Failed to update product' };
  }
}

export async function adjustProductStockAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    await requireHairAuth();
    await requirePermission('page:inventory');
    const ctx = await getTenantContextForAction();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing product id' };
    const delta = Number(formStr(formData, 'quantityDelta'));
    const reason = formStr(formData, 'reason');
    await adjustProductStock(id, delta, reason, ctx);
    revalidatePath('/products');
    revalidatePath('/inventory/stock');
    revalidatePath('/quick-sale');
    return { success: 'Stock adjusted.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Stock adjustment failed' };
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
