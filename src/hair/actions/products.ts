'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import {
  archiveProduct,
  createProduct,
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

function formChecked(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === 'on' || v === 'true' || v === '1';
}

function parseProductForm(formData: FormData): ProductInput {
  const name = formStr(formData, 'name');
  if (!name) throw new Error('Product name is required');
  return {
    name,
    sku: formStr(formData, 'sku') || null,
    barcode: formStr(formData, 'barcode') || null,
    brand: formStr(formData, 'brand') || null,
    category: formStr(formData, 'category') || null,
    description: formStr(formData, 'description') || null,
    sellingPriceRupees: formNum(formData, 'sellingPriceRupees', 0),
    costPriceRupees: formNum(formData, 'costPriceRupees', 0),
    stockQty: formNum(formData, 'stockQty', 0),
    reorderLevel: formNum(formData, 'reorderLevel', 0),
    unit: formStr(formData, 'unit') || 'unit',
    gstPercent: formNum(formData, 'gstPercent', 0),
    isRetail: formChecked(formData, 'isRetail'),
    isConsumable: formChecked(formData, 'isConsumable'),
    isActive: formData.get('isActive') !== 'false',
  };
}

export async function createProductAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  try {
    await requireHairAuth();
    const product = await createProduct(parseProductForm(formData));
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
    await requireHairAuth();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing product id' };
    await updateProduct(id, parseProductForm(formData));
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
