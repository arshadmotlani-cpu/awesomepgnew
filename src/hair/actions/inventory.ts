'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import {
  createStockAdjustment,
  createPurchaseOrder,
  receiveGoodsReceipt,
  type GrnLineInput,
  type PoLineInput,
} from '@/src/hair/services/purchases';
import { applyMovement } from '@/src/hair/services/stock';
import {
  archiveVendor,
  createVendor,
  updateVendor,
  type VendorInput,
} from '@/src/hair/services/vendors';
import { hairDb } from '@/src/hair/db/client';

export type InventoryActionState = { error?: string; success?: string };

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function formChecked(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === 'on' || v === 'true' || v === '1';
}

function parseVendorForm(formData: FormData): VendorInput {
  const name = formStr(formData, 'name');
  if (!name) throw new Error('Vendor name is required');
  return {
    name,
    contactName: formStr(formData, 'contactName') || null,
    phone: formStr(formData, 'phone') || null,
    email: formStr(formData, 'email') || null,
    gstin: formStr(formData, 'gstin') || null,
    address: formStr(formData, 'address') || null,
    notes: formStr(formData, 'notes') || null,
    isActive: formData.get('isActive') !== 'false',
  };
}

function parseLinesJson<T>(raw: string, label: string): T[] {
  if (!raw) throw new Error(`${label} lines are required`);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(`At least one ${label.toLowerCase()} line is required`);
    }
    return parsed as T[];
  } catch (e) {
    if (e instanceof Error && e.message.includes('line')) throw e;
    throw new Error(`Invalid ${label.toLowerCase()} lines`);
  }
}

export async function adjustStockAction(input: {
  productId: string;
  quantityDelta: number;
  notes?: string | null;
}): Promise<InventoryActionState> {
  try {
    await requirePermission('action:inventory.adjust');
    await applyMovement(hairDb, {
      productId: input.productId,
      quantityDelta: input.quantityDelta,
      movementType: 'adjustment',
      notes: input.notes ?? null,
    });
    revalidatePath('/inventory');
    revalidatePath('/products');
    revalidatePath('/reports');
    return { success: 'Stock adjusted.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Stock adjustment failed' };
  }
}

export async function createVendorAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    await requirePermission('page:inventory');
    const vendor = await createVendor(parseVendorForm(formData));
    revalidatePath('/inventory/vendors');
    redirect(`/inventory/vendors/${vendor.id}`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to create vendor' };
  }
}

export async function updateVendorAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    await requirePermission('page:inventory');
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing vendor id' };
    await updateVendor(id, parseVendorForm(formData));
    revalidatePath('/inventory/vendors');
    revalidatePath(`/inventory/vendors/${id}`);
    return { success: 'Vendor updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update vendor' };
  }
}

export async function archiveVendorAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    await requirePermission('page:inventory');
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing vendor id' };
    await archiveVendor(id);
    revalidatePath('/inventory/vendors');
    redirect('/inventory/vendors?status=inactive');
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to archive vendor' };
  }
}

export async function createPurchaseOrderAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    await requirePermission('page:inventory');
    const vendorId = formStr(formData, 'vendorId');
    if (!vendorId) return { error: 'Select a vendor' };
    const lines = parseLinesJson<PoLineInput>(formStr(formData, 'linesJson'), 'PO');
    const po = await createPurchaseOrder({
      vendorId,
      notes: formStr(formData, 'notes') || null,
      lines,
      markOrdered: formChecked(formData, 'markOrdered'),
    });
    revalidatePath('/inventory/purchases');
    redirect(`/inventory/purchases/${po.id}`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to create purchase order' };
  }
}

export async function receiveGrnAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    await requirePermission('page:inventory');
    const vendorId = formStr(formData, 'vendorId');
    if (!vendorId) return { error: 'Missing vendor' };
    const lines = parseLinesJson<GrnLineInput>(formStr(formData, 'linesJson'), 'GRN');
    const purchaseOrderId = formStr(formData, 'purchaseOrderId') || null;
    await receiveGoodsReceipt({
      vendorId,
      purchaseOrderId,
      notes: formStr(formData, 'notes') || null,
      lines,
    });
    revalidatePath('/inventory/purchases');
    revalidatePath('/inventory');
    revalidatePath('/products');
    if (purchaseOrderId) revalidatePath(`/inventory/purchases/${purchaseOrderId}`);
    return { success: 'Goods received and stock updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to receive goods' };
  }
}

export async function createAdjustmentAction(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  try {
    await requirePermission('action:inventory.adjust');
    const productId = formStr(formData, 'productId');
    if (!productId) return { error: 'Select a product' };
    const quantityDelta = Number(formStr(formData, 'quantityDelta'));
    if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
      return { error: 'Enter a non-zero quantity delta' };
    }
    await createStockAdjustment({
      productId,
      quantityDelta,
      reason: formStr(formData, 'reason'),
      notes: formStr(formData, 'notes') || null,
    });
    revalidatePath('/inventory/adjustments');
    revalidatePath('/inventory');
    revalidatePath('/products');
    redirect('/inventory/adjustments');
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to apply adjustment' };
  }
}
