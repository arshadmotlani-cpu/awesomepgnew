'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  generateInvoiceFromSsot,
  type GenerateInvoiceKind,
} from '@/src/services/invoiceGeneration';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';

export type ResidentInvoiceActionState =
  | { status: 'idle' }
  | {
      status: 'ok';
      message: string;
      invoiceId?: string;
      invoiceNumber?: string;
      paymentUrl?: string;
      whatsappUrl?: string | null;
    }
  | { status: 'error'; message: string };

function revalidateResident(customerId: string) {
  revalidatePath(`/admin/residents/${customerId}`);
  revalidateFinancialViews();
}

export async function generateResidentInvoiceAction(
  _prev: ResidentInvoiceActionState,
  formData: FormData,
): Promise<ResidentInvoiceActionState> {
  try {
    const session = await requireAdminPermission('payments:write');
    const customerId = String(formData.get('customerId') ?? '');
    const kind = String(formData.get('kind') ?? 'combined') as GenerateInvoiceKind;
    const lineItemIds = formData
      .getAll('lineItemIds')
      .map((v) => String(v))
      .filter(Boolean);
    const customLabel = String(formData.get('customLabel') ?? '').trim() || undefined;
    const customAmountInr = String(formData.get('customAmountInr') ?? '').trim();
    const customAmountPaise =
      customAmountInr && !Number.isNaN(Number(customAmountInr))
        ? Math.round(Number(customAmountInr) * 100)
        : undefined;

    if (!customerId) return { status: 'error', message: 'Missing resident.' };

    const result = await generateInvoiceFromSsot({
      customerId,
      kind,
      lineItemIds: lineItemIds.length > 0 ? lineItemIds : undefined,
      customLabel,
      customAmountPaise,
      actorId: session.adminId,
    });

    if (!result.ok) return { status: 'error', message: result.error };

    revalidateResident(customerId);
    return {
      status: 'ok',
      message: `Invoice ${result.invoiceNumber} created (${result.amountPaise / 100} INR).`,
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
      paymentUrl: result.paymentUrl,
      whatsappUrl: result.whatsappUrl,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not generate invoice.',
    };
  }
}
