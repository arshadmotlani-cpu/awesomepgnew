'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { hasPermission, requirePermission } from '@/src/hair/lib/auth/permissions';
import { parseProductType } from '@/src/hair/lib/productTypes';
import { getProduct } from '@/src/hair/services/products';
import {
  archiveProduct,
  createProduct,
  deleteProduct,
  updateProduct,
  type ProductInput,
} from '@/src/hair/services/products';

export type ProductActionState = {
  error?: string;
  success?: string;
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

function parseProductForm(formData: FormData, opts?: { allowCost?: boolean }): ProductInput {
  const name = formStr(formData, 'name');
  if (!name) throw new Error('Product name is required');
  const productType = parseProductType(formStr(formData, 'productType'));
  const costPriceRupees = formNum(formData, 'costPriceRupees', 0);
  if (!opts?.allowCost && costPriceRupees !== 0) {
    throw new Error('Product cost requires inventory permission');
  }
  const stockQty = formNum(formData, 'stockQty', 0);
  if (!opts?.allowCost && stockQty !== 0) {
    throw new Error('Stock quantity changes require inventory permission');
  }
  const sellingPriceRupees =
    productType === 'retail' ? formNum(formData, 'sellingPriceRupees', 0) : 0;

  return {
    name,
    brand: formStr(formData, 'brand') || null,
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
    const product = await createProduct(
      parseProductForm(formData, { allowCost: hasPermission(admin, 'page:inventory') }),
    );
    revalidatePath('/products');
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
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing product id' };
    const allowCost = hasPermission(admin, 'page:inventory');
    const input = parseProductForm(formData, { allowCost });
    if (!allowCost) {
      const existing = await getProduct(id);
      if (existing) {
        input.costPriceRupees = existing.costPricePaise / 100;
        input.stockQty = Number(existing.stockQty);
      }
    }
    await updateProduct(id, input);
    revalidatePath('/products');
    revalidatePath(`/products/${id}`);
    return { success: 'Product updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update product' };
  }
}

export async function archiveProductAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    await requireHairAuth();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing product id' };
    await archiveProduct(id);
    revalidatePath('/products');
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
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing product id' };
    await deleteProduct(id);
    revalidatePath('/products');
    redirect('/products');
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to delete product' };
  }
}
