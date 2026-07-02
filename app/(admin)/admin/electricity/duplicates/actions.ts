'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { repairElectricityInvoiceDuplicateGroup, cancelPendingElectricityWhenBookingMonthPaid } from '@/src/services/electricityInvoiceDuplicates';

export async function repairElectricityInvoiceDuplicateAction(input: {
  groupKey: string;
  keepInvoiceId: string;
}): Promise<{ ok: true; cancelledIds: string[] } | { ok: false; error: string }> {
  const admin = await requireAdminPermission('electricity:write');
  const result = await repairElectricityInvoiceDuplicateGroup({
    groupKey: input.groupKey,
    keepInvoiceId: input.keepInvoiceId,
    adminId: admin.adminId,
  });
  if (result.ok) {
    revalidatePath('/admin/electricity/duplicates');
    revalidatePath('/admin/billing');
    revalidatePath('/admin/billing/electricity/generate');
    revalidatePath('/admin/operations');
    revalidatePath('/admin/residents');
  }
  return result;
}

export async function repairPaidMonthElectricityDuplicatesAction(): Promise<
  | { ok: true; cancelled: Array<{ invoiceId: string; invoiceNumber: string }> }
  | { ok: false; error: string }
> {
  const admin = await requireAdminPermission('electricity:write');
  const result = await cancelPendingElectricityWhenBookingMonthPaid({ adminId: admin.adminId });
  if (result.ok) {
    revalidatePath('/admin/electricity/duplicates');
    revalidatePath('/admin/billing');
    revalidatePath('/admin/operations');
    revalidatePath('/admin/residents');
    revalidatePath('/admin/overview');
  }
  return result;
}
