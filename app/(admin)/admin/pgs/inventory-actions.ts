'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { quickAddBed } from '@/src/services/pgInventory';

export async function quickAddBedAction(
  pgId: string,
  _prev: { ok: boolean; error?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    const floorNumber = Number.parseInt(formData.get('floorNumber')?.toString() ?? '', 10);
    const daily = Number.parseFloat(formData.get('dailyRate')?.toString() ?? '0');
    const weekly = Number.parseFloat(formData.get('weeklyRate')?.toString() ?? '0');
    const monthly = Number.parseFloat(formData.get('monthlyRate')?.toString() ?? '0');
    const deposit = Number.parseFloat(formData.get('securityDeposit')?.toString() ?? '0');

    await quickAddBed(session, pgId, {
      floorNumber,
      floorLabel: formData.get('floorLabel')?.toString(),
      roomNumber: formData.get('roomNumber')?.toString() ?? '',
      bedCode: formData.get('bedCode')?.toString() ?? '',
      roomTypeName: formData.get('roomTypeName')?.toString() ?? 'Standard',
      hasAc: formData.get('hasAc') === 'on',
      capacity: Number.parseInt(formData.get('capacity')?.toString() ?? '1', 10) || 1,
      dailyRatePaise: Math.round(daily * 100),
      weeklyRatePaise: Math.round(weekly * 100),
      monthlyRatePaise: Math.round(monthly * 100),
      securityDepositPaise: Math.round(deposit * 100),
    });

    revalidatePath(`/admin/pgs/${pgId}/edit`);
    revalidatePath('/pgs');
    revalidatePath('/admin/beds');
    revalidatePath('/admin/pricing');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
