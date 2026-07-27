'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  createPromoCoupon,
  deletePromoCoupon,
  setPromoCouponActive,
} from '@/src/services/promoCouponAdmin';

export async function createPromoCouponAction(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdminSession();
  const code = formData.get('code')?.toString() ?? '';
  const type = (formData.get('type')?.toString() ?? 'percentage') as 'percentage' | 'fixed';
  const scope = (formData.get('scope')?.toString() ?? 'booking_rent') as
    | 'booking_rent'
    | 'rent_invoice'
    | 'bed_reserve';
  const percent = Number(formData.get('percent')?.toString() ?? '0');
  const fixedInr = Number(formData.get('fixedInr')?.toString() ?? '0');
  const usageLimitRaw = formData.get('usageLimit')?.toString()?.trim();
  const reason = formData.get('reason')?.toString()?.trim();
  const validFromRaw = formData.get('validFrom')?.toString()?.trim();
  const validTillRaw = formData.get('validTill')?.toString()?.trim();

  const now = new Date();
  const validFrom = validFromRaw ? new Date(`${validFromRaw}T00:00:00.000Z`) : now;
  const validTill = validTillRaw
    ? new Date(`${validTillRaw}T23:59:59.999Z`)
    : (() => {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() + 1);
        return d;
      })();

  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTill.getTime())) {
    return { ok: false, error: 'Valid from / till dates are required.' };
  }
  if (validTill < validFrom) {
    return { ok: false, error: 'Valid till must be on or after valid from.' };
  }

  const result = await createPromoCoupon({
    code,
    type,
    scope,
    percentageBps: type === 'percentage' ? Math.round(percent * 100) : undefined,
    fixedAmountPaise: type === 'fixed' ? Math.round(fixedInr * 100) : undefined,
    validFrom,
    validTill,
    usageLimit: usageLimitRaw ? Number.parseInt(usageLimitRaw, 10) : null,
    reason: reason || undefined,
  });

  if (result.ok) revalidatePath('/admin/revenue');
  return result;
}

export async function togglePromoCouponAction(id: string, active: boolean) {
  await requireAdminSession();
  await setPromoCouponActive(id, active);
  revalidatePath('/admin/revenue');
}

export async function deletePromoCouponAction(id: string) {
  await requireAdminSession();
  await deletePromoCoupon(id);
  revalidatePath('/admin/revenue');
}
