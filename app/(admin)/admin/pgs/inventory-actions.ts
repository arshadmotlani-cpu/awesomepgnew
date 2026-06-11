'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { parseSharingCount, sharingTypeName, type RoomSharingCount } from '@/src/lib/roomSharing';
import { quickAddRoomBeds } from '@/src/services/pgInventory';
import { savePgDepositPresets } from '@/src/services/pgAdmin';

export async function quickAddBedAction(
  pgId: string,
  _prev: { ok: boolean; error?: string; message?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    const floorNumber = Number.parseInt(formData.get('floorNumber')?.toString() ?? '', 10);
    const daily = Number.parseFloat(formData.get('dailyRate')?.toString() ?? '0');
    const weekly = Number.parseFloat(formData.get('weeklyRate')?.toString() ?? '0');
    const monthly = Number.parseFloat(formData.get('monthlyRate')?.toString() ?? '0');
    const deposit = Number.parseFloat(formData.get('securityDeposit')?.toString() ?? '0');

    const sharing = parseSharingCount(formData.get('sharingCount')?.toString());
    if (!sharing) {
      return { ok: false, error: 'Select a sharing type (1–5 sharing).' };
    }

    const bedsToAdd = Number.parseInt(formData.get('bedsToAdd')?.toString() ?? '', 10);
    if (!Number.isInteger(bedsToAdd) || bedsToAdd < 1 || bedsToAdd > sharing) {
      return {
        ok: false,
        error: `Select how many beds to add (1–${sharing} for this sharing type).`,
      };
    }

    const depositPaise = Math.round(deposit * 100);
    if (depositPaise > 0) {
      await savePgDepositPresets(session, pgId, { [sharing]: depositPaise });
    }

    const result = await quickAddRoomBeds(session, pgId, {
      floorNumber,
      floorLabel: formData.get('floorLabel')?.toString(),
      roomNumber: formData.get('roomNumber')?.toString() ?? '',
      roomTypeName: sharingTypeName(sharing),
      sharingCount: sharing,
      bedsToAdd,
      hasAc: formData.get('hasAc') === 'on',
      dailyRatePaise: Math.round(daily * 100),
      weeklyRatePaise: Math.round(weekly * 100),
      monthlyRatePaise: Math.round(monthly * 100),
      securityDepositPaise: depositPaise,
    });

    revalidatePath(`/admin/pgs/${pgId}/edit`);
    revalidatePath('/pgs');
    revalidatePath('/admin/beds');
    revalidatePath('/admin/pricing');

    const codes = result.bedCodes.join(', ');
    return {
      ok: true,
      message:
        result.bedCodes.length === 1
          ? `Added bed ${codes} in room ${result.roomNumber}.`
          : `Added ${result.bedCodes.length} beds (${codes}) in room ${result.roomNumber}.`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function saveDepositPresetsAction(
  pgId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    const presets: Partial<Record<RoomSharingCount, number>> = {};
    for (const count of [1, 2, 3, 4, 5] as RoomSharingCount[]) {
      const raw = formData.get(`deposit_${count}`)?.toString() ?? '';
      if (raw.trim() === '') continue;
      const rupees = Number.parseFloat(raw);
      if (!Number.isFinite(rupees) || rupees < 0) {
        return { ok: false, error: `Invalid deposit for ${count} sharing.` };
      }
      presets[count] = Math.round(rupees * 100);
    }
    await savePgDepositPresets(session, pgId, presets);
    revalidatePath(`/admin/pgs/${pgId}/edit`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
