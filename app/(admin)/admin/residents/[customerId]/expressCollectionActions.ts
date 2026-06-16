'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import type {
  ExpressCollectionChargeType,
  ExpressCollectionPaymentMethod,
} from '@/src/lib/billing/expressCollectionConstants';
import { recordExpressCollection } from '@/src/services/expressCollection';

export type ExpressCollectionActionState =
  | { status: 'idle' }
  | {
      status: 'ok';
      message: string;
      invoiceNumber?: string;
      invoiceId?: string;
    }
  | { status: 'error'; message: string };

export async function recordExpressCollectionAction(
  _prev: ExpressCollectionActionState,
  formData: FormData,
): Promise<ExpressCollectionActionState> {
  try {
    const session = await requireAdminPermission('payments:write');
    const customerId = String(formData.get('customerId') ?? '');
    const bookingId = String(formData.get('bookingId') ?? '').trim() || undefined;
    const chargeType = String(formData.get('chargeType') ?? 'rent') as ExpressCollectionChargeType;
    const paymentMethod = String(
      formData.get('paymentMethod') ?? 'cash',
    ) as ExpressCollectionPaymentMethod;
    const amountInr = String(formData.get('amountInr') ?? '').trim();
    const amountPaise = Math.round(Number(amountInr) * 100);
    const billingMonthRaw = String(formData.get('billingMonth') ?? '').trim() || undefined;
    const billingMonth =
      billingMonthRaw && billingMonthRaw.length === 7
        ? `${billingMonthRaw}-01`
        : billingMonthRaw;
    const paymentDate = String(formData.get('paymentDate') ?? '').trim();
    const referenceNumber = String(formData.get('referenceNumber') ?? '').trim() || undefined;
    const notes = String(formData.get('notes') ?? '').trim() || undefined;
    const customTitle = String(formData.get('customTitle') ?? '').trim() || undefined;
    const createAsPaid = formData.get('createAsPaid') !== 'off';

    if (!customerId) return { status: 'error', message: 'Missing resident.' };
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return { status: 'error', message: 'Enter a valid amount.' };
    }
    if (!paymentDate) return { status: 'error', message: 'Payment date is required.' };

    const result = await recordExpressCollection({
      customerId,
      bookingId,
      chargeType,
      amountPaise,
      billingMonth,
      paymentDate,
      paymentMethod,
      referenceNumber,
      notes,
      customTitle,
      createAsPaid,
      actorId: session.adminId,
    });

    if (!result.ok) return { status: 'error', message: result.error };

    revalidatePath(`/admin/residents/${customerId}`);
    revalidatePath('/admin/collections');
    revalidateFinancialViews();

    return {
      status: 'ok',
      message: result.message,
      invoiceNumber: result.invoiceNumber,
      invoiceId: result.invoiceId,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not record payment.',
    };
  }
}
