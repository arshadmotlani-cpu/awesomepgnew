'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { getOrCreatePaymentLink } from '@/src/services/paymentLinks';

export async function generatePaymentLinkAction(
  formData: FormData,
): Promise<
  | { ok: true; publicUrl: string; whatsappShareUrl: string | null; linkId: string }
  | { ok: false; message: string }
> {
  await requireAdminPermission('payments:write');

  const residentId = String(formData.get('residentId') ?? '');
  const pgId = String(formData.get('pgId') ?? '');
  const pgName = String(formData.get('pgName') ?? '');
  const residentName = String(formData.get('residentName') ?? '');
  const residentPhone = String(formData.get('residentPhone') ?? '');
  const amountPaise = Number(formData.get('amountPaise') ?? 0);
  const purpose = (formData.get('purpose') as 'rent' | 'electricity' | 'deposit') ?? 'rent';
  const rentComponentPaise = Number(formData.get('rentPaise') ?? 0);
  const depositComponentPaise = Number(formData.get('depositDuePaise') ?? 0);

  if (!residentId || !pgId || amountPaise <= 0) {
    return { ok: false, message: 'Missing resident, PG, or amount.' };
  }

  const result = await getOrCreatePaymentLink({
    residentId,
    pgId,
    pgName,
    residentName,
    residentPhone,
    amountPaise,
    purpose,
    roomNumber: formData.get('roomNumber')?.toString(),
    dueDate: formData.get('dueDate')?.toString(),
    isOverdue: formData.get('isOverdue') === '1',
    rentUpdated: formData.get('rentUpdated') === '1',
    rentComponentPaise: rentComponentPaise > 0 ? rentComponentPaise : undefined,
    depositComponentPaise: depositComponentPaise > 0 ? depositComponentPaise : undefined,
  });

  if (!result.ok) return result;

  revalidatePath('/admin/panel');

  return {
    ok: true,
    publicUrl: result.publicUrl,
    whatsappShareUrl: result.link.whatsappShareUrl,
    linkId: result.link.id,
  };
}
