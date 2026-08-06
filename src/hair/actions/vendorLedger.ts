'use server';

import { revalidatePath } from 'next/cache';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import { parseVendorPaymentMethod } from '@/src/hair/lib/vendorPaymentMethods';
import { uploadVendorAttachment } from '@/src/hair/lib/vendorAttachmentUpload';
import { addVendorNote } from '@/src/hair/services/vendorBrain';
import {
  allocateVendorPayment,
  recordVendorPayment,
  reverseVendorPayment,
  type VendorPaymentAllocationInput,
} from '@/src/hair/services/vendorPaymentEngine';
import {
  recordPurchaseReturn,
  type PurchaseReturnLineInput,
} from '@/src/hair/services/purchaseReturnEngine';
import { getPurchaseEngineDetail } from '@/src/hair/services/purchaseEngine';

export type VendorLedgerActionState = { error?: string; success?: string };

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

function parseAllocationsJson(raw: string): VendorPaymentAllocationInput[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        payableId: String(r.payableId ?? ''),
        amountPaise: Number(r.amountPaise ?? 0),
      };
    })
    .filter((r) => r.payableId && r.amountPaise > 0);
}

function parseReturnLinesJson(raw: string): PurchaseReturnLineInput[] {
  if (!raw) throw new Error('Add at least one return line');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Add at least one return line');
  }
  return parsed.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      productId: String(r.productId ?? ''),
      quantity: Number(r.quantity),
    };
  });
}

function revalidateVendorLedger(vendorId: string) {
  revalidatePath(`/vendors/${vendorId}`);
  revalidatePath('/vendors');
  revalidatePath('/purchases');
}

export async function getPurchaseReturnContextAction(purchaseId: string) {
  await requirePermission('page:inventory');
  return getPurchaseEngineDetail(purchaseId);
}

export async function recordVendorPaymentAction(
  _prev: VendorLedgerActionState,
  formData: FormData,
): Promise<VendorLedgerActionState> {
  try {
    await requirePermission('page:inventory');
    const session = await getHairSession();
    const staffName = session?.admin.displayName?.trim();
    if (!staffName) return { error: 'Could not determine logged-in staff' };

    const vendorId = formStr(formData, 'vendorId');
    if (!vendorId) return { error: 'Missing vendor' };

    const paymentDate = formStr(formData, 'paymentDate');
    if (!paymentDate) return { error: 'Payment date is required' };

    const amountRupees = Number(formStr(formData, 'amountRupees'));
    if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
      return { error: 'Enter a valid payment amount' };
    }

    const allocations = parseAllocationsJson(formStr(formData, 'allocationsJson'));

    let attachmentUrl: string | null = null;
    let attachmentContentType: string | null = null;
    const attachment = formData.get('attachment');
    if (attachment instanceof File && attachment.size > 0) {
      const uploaded = await uploadVendorAttachment(attachment, 'vendor-payments', vendorId);
      attachmentUrl = uploaded.url;
      attachmentContentType = uploaded.contentType;
    }

    await recordVendorPayment({
      vendorId,
      amountPaise: rupeesToPaise(amountRupees),
      paymentMethod: parseVendorPaymentMethod(formStr(formData, 'paymentMethod')),
      paymentDate,
      reference: formStr(formData, 'reference') || null,
      notes: formStr(formData, 'notes') || null,
      attachmentUrl,
      attachmentContentType,
      staffName,
      staffEmployeeId: session?.workforceEmployeeId ?? null,
      allocations,
    });

    revalidateVendorLedger(vendorId);
    return { success: 'Payment recorded.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to record payment' };
  }
}

export async function allocateVendorPaymentAction(
  _prev: VendorLedgerActionState,
  formData: FormData,
): Promise<VendorLedgerActionState> {
  try {
    await requirePermission('page:inventory');
    const vendorId = formStr(formData, 'vendorId');
    const paymentId = formStr(formData, 'paymentId');
    if (!vendorId || !paymentId) return { error: 'Missing payment' };

    const allocations = parseAllocationsJson(formStr(formData, 'allocationsJson'));
    if (!allocations.length) return { error: 'Select invoices to allocate' };

    await allocateVendorPayment({ paymentId, allocations });
    revalidateVendorLedger(vendorId);
    return { success: 'Advance allocated to invoices.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to allocate payment' };
  }
}

export async function recordPurchaseReturnAction(
  _prev: VendorLedgerActionState,
  formData: FormData,
): Promise<VendorLedgerActionState> {
  try {
    await requirePermission('page:inventory');
    const session = await getHairSession();
    const staffName = session?.admin.displayName?.trim();
    if (!staffName) return { error: 'Could not determine logged-in staff' };

    const vendorId = formStr(formData, 'vendorId');
    const purchaseId = formStr(formData, 'purchaseId');
    if (!vendorId || !purchaseId) return { error: 'Missing purchase' };

    const returnDate = formStr(formData, 'returnDate');
    if (!returnDate) return { error: 'Return date is required' };

    const lines = parseReturnLinesJson(formStr(formData, 'returnLinesJson'));

    await recordPurchaseReturn({
      purchaseId,
      returnDate,
      lines,
      notes: formStr(formData, 'notes') || null,
      staffName,
      staffEmployeeId: session?.workforceEmployeeId ?? null,
    });

    revalidateVendorLedger(vendorId);
    revalidatePath('/inventory/stock');
    revalidatePath('/inventory/movements');
    return { success: 'Return recorded.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to record return' };
  }
}

export async function reverseVendorPaymentAction(
  _prev: VendorLedgerActionState,
  formData: FormData,
): Promise<VendorLedgerActionState> {
  try {
    await requirePermission('page:inventory');
    const session = await getHairSession();
    const staffName = session?.admin.displayName?.trim();
    if (!staffName) return { error: 'Could not determine logged-in staff' };

    const vendorId = formStr(formData, 'vendorId');
    const paymentId = formStr(formData, 'paymentId');
    const reason = formStr(formData, 'reason');
    if (!vendorId || !paymentId) return { error: 'Missing payment' };
    if (!reason) return { error: 'Reversal reason is required' };

    await reverseVendorPayment({
      paymentId,
      reason,
      staffName,
      staffEmployeeId: session?.workforceEmployeeId ?? null,
    });

    revalidateVendorLedger(vendorId);
    return { success: 'Payment reversed.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to reverse payment' };
  }
}

export async function addVendorNoteAction(
  _prev: VendorLedgerActionState,
  formData: FormData,
): Promise<VendorLedgerActionState> {
  try {
    await requirePermission('page:inventory');
    const session = await getHairSession();
    const staffName = session?.admin.displayName?.trim();
    if (!staffName) return { error: 'Could not determine logged-in staff' };

    const vendorId = formStr(formData, 'vendorId');
    const note = formStr(formData, 'note');
    if (!vendorId) return { error: 'Missing vendor' };

    await addVendorNote({
      vendorId,
      note,
      staffName,
      staffEmployeeId: session?.workforceEmployeeId ?? null,
    });

    revalidateVendorLedger(vendorId);
    return { success: 'Note added.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to add note' };
  }
}
