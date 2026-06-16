'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import {
  createCustomCharge,
  type CustomChargeKind,
} from '@/src/services/customCharges';

export type CustomChargeActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function createCustomChargeAction(
  _prev: CustomChargeActionState,
  formData: FormData,
): Promise<CustomChargeActionState> {
  try {
    const session = await requireAdminPermission('payments:write');
    const customerId = String(formData.get('customerId') ?? '');
    const bookingId = String(formData.get('bookingId') ?? '').trim() || undefined;
    const kind = String(formData.get('kind') ?? 'custom') as CustomChargeKind;
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim() || undefined;
    const dueDate = String(formData.get('dueDate') ?? '').trim() || undefined;
    const amountInr = String(formData.get('amountInr') ?? '').trim();
    const amountPaise = Math.round(Number(amountInr) * 100);

    if (!customerId) return { status: 'error', message: 'Missing resident.' };
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return { status: 'error', message: 'Enter a valid amount.' };
    }

    const result = await createCustomCharge({
      customerId,
      bookingId,
      kind,
      title,
      description,
      amountPaise,
      dueDate,
      actorId: session.adminId,
    });

    if (!result.ok) return { status: 'error', message: result.error };

    revalidatePath(`/admin/residents/${customerId}`);
    revalidateFinancialViews();

    return {
      status: 'ok',
      message: `Charge ${result.invoiceNumber} created (${amountPaise / 100} INR).`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not create charge.',
    };
  }
}
