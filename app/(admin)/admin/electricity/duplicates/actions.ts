'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { repairElectricityInvoiceDuplicateGroup } from '@/src/services/electricityInvoiceDuplicates';

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
  }
  return result;
}
