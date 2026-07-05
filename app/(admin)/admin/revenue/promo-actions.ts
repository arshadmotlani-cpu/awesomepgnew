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
  const scope = (formData.get('scope')?.toString() ?? 'rent_invoice') as
    | 'booking_rent'
    | 'rent_invoice'
    | 'bed_reserve';
  const percent = Number(formData.get('percent')?.toString() ?? '0');
  const fixedInr = Number(formData.get('fixedInr')?.toString() ?? '0');
  const usageLimitRaw = formData.get('usageLimit')?.toString()?.trim();
  const reason = formData.get('reason')?.toString()?.trim();

  const now = new Date();
  const validTill = new Date(now);
  validTill.setFullYear(validTill.getFullYear() + 1);

  const result = await createPromoCoupon({
    code,
    type,
    scope,
    percentageBps: type === 'percentage' ? Math.round(percent * 100) : undefined,
    fixedAmountPaise: type === 'fixed' ? Math.round(fixedInr * 100) : undefined,
    validFrom: now,
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
