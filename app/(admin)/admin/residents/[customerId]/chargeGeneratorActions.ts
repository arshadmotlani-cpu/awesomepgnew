'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import {
  createResidentCharge,
} from '@/src/services/residentCharges';
import type { ResidentChargeType } from '@/src/lib/billing/chargeGeneratorConstants';
import type { CustomChargeKind } from '@/src/services/customCharges';

export type ChargeGeneratorActionState =
  | { status: 'idle' }
  | {
      status: 'ok';
      message: string;
      paymentLinkUrl: string;
      whatsappShareUrl: string | null;
      qrUrl: string;
      title: string;
      amountPaise: number;
    }
  | { status: 'error'; message: string };

export async function createResidentChargeAction(
  _prev: ChargeGeneratorActionState,
  formData: FormData,
): Promise<ChargeGeneratorActionState> {
  try {
    const session = await requireAdminPermission('payments:write');
    const customerId = String(formData.get('customerId') ?? '');
    const bookingId = String(formData.get('bookingId') ?? '').trim() || undefined;
    const chargeType = String(formData.get('chargeType') ?? 'custom_charge') as ResidentChargeType;
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim() || undefined;
    const dueDate = String(formData.get('dueDate') ?? '').trim() || undefined;
    const amountInr = String(formData.get('amountInr') ?? '').trim();
    const amountPaise = Math.round(Number(amountInr) * 100);
    const customKind = String(formData.get('customKind') ?? 'custom') as CustomChargeKind;

    if (!customerId) return { status: 'error', message: 'Missing resident.' };
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return { status: 'error', message: 'Enter a valid amount.' };
    }

    const result = await createResidentCharge({
      customerId,
      bookingId,
      chargeType,
      title,
      description,
      amountPaise,
      dueDate,
      customKind: chargeType === 'custom_charge' ? customKind : undefined,
      actorId: session.adminId,
    });

    if (!result.ok) return { status: 'error', message: result.error };

    revalidatePath(`/admin/residents/${customerId}`);
    revalidateFinancialViews();

    const ref = result.invoiceNumber ?? result.rentInvoiceId?.slice(0, 8);
    return {
      status: 'ok',
      message: ref
        ? `Charge created (${ref}) — payment link ready.`
        : 'Charge created — payment link ready.',
      paymentLinkUrl: result.paymentLinkUrl,
      whatsappShareUrl: result.whatsappShareUrl,
      qrUrl: result.qrUrl,
      title: result.title,
      amountPaise: result.amountPaise,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not create charge.',
    };
  }
}
