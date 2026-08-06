'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import { parseExpensePaymentMethod } from '@/src/hair/lib/expenseCategories';
import {
  attachPurchaseInvoice,
  createPurchase,
  updatePurchase,
  type PurchaseLineInput,
} from '@/src/hair/services/purchaseEngine';
import { uploadVendorAttachment } from '@/src/hair/lib/vendorAttachmentUpload';

export type PurchaseActionState = { error?: string; success?: string };

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function parseLinesJson(raw: string): PurchaseLineInput[] {
  if (!raw) throw new Error('Add at least one product line');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Add at least one product line');
  }
  return parsed.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      productId: String(r.productId ?? ''),
      quantity: Number(r.quantity),
      unitCostRupees: Number(r.unitCostRupees),
    };
  });
}

export async function createPurchaseAction(
  _prev: PurchaseActionState,
  formData: FormData,
): Promise<PurchaseActionState> {
  try {
    await requirePermission('page:purchases');
    const session = await getHairSession();
    const staffName = session?.admin.displayName?.trim();
    if (!staffName) return { error: 'Could not determine logged-in staff' };

    const vendorId = formStr(formData, 'vendorId');
    if (!vendorId) return { error: 'Select a vendor' };

    const purchaseDate = formStr(formData, 'purchaseDate');
    if (!purchaseDate) return { error: 'Purchase date is required' };

    const lines = parseLinesJson(formStr(formData, 'linesJson'));

    const purchase = await createPurchase({
      vendorId,
      purchaseDate,
      vendorInvoiceRef: formStr(formData, 'vendorInvoiceRef') || null,
      notes: formStr(formData, 'notes') || null,
      lines,
      staffName,
      staffEmployeeId: session?.workforceEmployeeId ?? null,
      paymentMethod: parseExpensePaymentMethod(formStr(formData, 'paymentMethod') || 'online'),
    });

    revalidatePath('/purchases');
    revalidatePath('/inventory/stock');
    revalidatePath('/inventory/movements');
    revalidatePath('/expenses');
    revalidatePath('/products');
    redirect(`/purchases/${purchase.id}`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to record purchase' };
  }
}

export async function updatePurchaseAction(
  _prev: PurchaseActionState,
  formData: FormData,
): Promise<PurchaseActionState> {
  try {
    await requirePermission('page:purchases');
    const session = await getHairSession();
    const staffName = session?.admin.displayName?.trim();
    if (!staffName) return { error: 'Could not determine logged-in staff' };

    const purchaseId = formStr(formData, 'purchaseId');
    if (!purchaseId) return { error: 'Missing purchase' };

    const purchaseDate = formStr(formData, 'purchaseDate');
    if (!purchaseDate) return { error: 'Purchase date is required' };

    const lines = parseLinesJson(formStr(formData, 'linesJson'));

    await updatePurchase(purchaseId, {
      purchaseDate,
      vendorInvoiceRef: formStr(formData, 'vendorInvoiceRef') || null,
      notes: formStr(formData, 'notes') || null,
      lines,
      staffName,
      staffEmployeeId: session?.workforceEmployeeId ?? null,
    });

    revalidatePath(`/purchases/${purchaseId}`);
    revalidatePath('/purchases');
    revalidatePath('/inventory/stock');
    revalidatePath('/inventory/movements');
    revalidatePath('/expenses');
    redirect(`/purchases/${purchaseId}`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to update purchase' };
  }
}

export async function attachPurchaseInvoiceAction(
  _prev: PurchaseActionState,
  formData: FormData,
): Promise<PurchaseActionState> {
  try {
    await requirePermission('page:purchases');
    const session = await getHairSession();
    const staffName = session?.admin.displayName?.trim();
    if (!staffName) return { error: 'Could not determine logged-in staff' };

    const purchaseId = formStr(formData, 'purchaseId');
    if (!purchaseId) return { error: 'Missing purchase' };

    const attachment = formData.get('attachment');
    if (!(attachment instanceof File) || attachment.size === 0) {
      return { error: 'Select a PDF or image file' };
    }

    const uploaded = await uploadVendorAttachment(attachment, 'purchase-invoices', purchaseId);
    await attachPurchaseInvoice(purchaseId, {
      attachmentUrl: uploaded.url,
      attachmentContentType: uploaded.contentType,
      staffName,
    });

    revalidatePath(`/purchases/${purchaseId}`);
    return { success: 'Invoice attachment saved.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to upload attachment' };
  }
}
