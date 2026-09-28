'use server';

import { revalidatePath } from 'next/cache';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { getTenantContextForAction } from '@/src/hair/lib/tenant/getTenantContext';
import { cancelInvoice } from '@/src/hair/services/invoiceCancellation';
import { requireFyhPermission } from '@/src/workforce/permissions/guards';

export async function cancelInvoiceAction(input: {
  invoiceId: string;
  reason: string;
}): Promise<{ ok: true; invoiceNumber: string } | { ok: false; error: string }> {
  try {
    await requireFyhPermission({ permission: 'billing.bill.edit', scope: 'org' });
    const session = await getHairSession();
    const actor = session?.admin.displayName?.trim() || session?.admin.email || 'operator';
    const ctx = await getTenantContextForAction();
    const result = await cancelInvoice(
      input.invoiceId,
      { reason: input.reason, actor },
      ctx,
    );
    revalidatePath('/billing');
    revalidatePath('/billing/invoices');
    revalidatePath(`/billing/${result.invoiceId}`);
    return { ok: true, invoiceNumber: result.invoiceNumber };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not cancel invoice' };
  }
}
