'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  type SharingPresetMatrix,
  type SharingPresetPaise,
} from '@/src/lib/pgSharingPresets';
import { parseSharingCount, sharingTypeName, type RoomSharingCount } from '@/src/lib/roomSharing';
import { quickAddRoomBeds } from '@/src/services/pgInventory';
import { savePgSharingPresets } from '@/src/services/pgAdmin';

function parseRupeesPaise(raw: string | null | undefined): number | undefined {
  if (!raw || raw.trim() === '') return undefined;
  const rupees = Number.parseFloat(raw);
  if (!Number.isFinite(rupees) || rupees < 0) return undefined;
  return Math.round(rupees * 100);
}

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

    const dailyDepositPaise = parseRupeesPaise(formData.get('dailyDeposit')?.toString()) ?? 0;
    const weeklyDepositPaise = parseRupeesPaise(formData.get('weeklyDeposit')?.toString()) ?? 0;
    const monthlyDepositPaise = parseRupeesPaise(formData.get('monthlyDeposit')?.toString()) ?? 0;

    const presetRow: SharingPresetPaise = {
      dailyRatePaise: Math.round(daily * 100),
      weeklyRatePaise: Math.round(weekly * 100),
      monthlyRatePaise: Math.round(monthly * 100),
      dailyDepositPaise,
      weeklyDepositPaise,
      monthlyDepositPaise,
    };
    await savePgSharingPresets(session, pgId, { [sharing]: presetRow });

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
      dailyDepositPaise,
      weeklyDepositPaise,
      monthlyDepositPaise,
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

export async function saveSharingPresetsAction(
  pgId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    const presets: SharingPresetMatrix = {};

    for (const count of [1, 2, 3, 4, 5] as RoomSharingCount[]) {
      const row: SharingPresetPaise = {};
      const dailyRate = parseRupeesPaise(formData.get(`${count}_dailyRate`)?.toString());
      const weeklyRate = parseRupeesPaise(formData.get(`${count}_weeklyRate`)?.toString());
      const monthlyRate = parseRupeesPaise(formData.get(`${count}_monthlyRate`)?.toString());
      const dailyDeposit = parseRupeesPaise(formData.get(`${count}_dailyDeposit`)?.toString());
      const weeklyDeposit = parseRupeesPaise(formData.get(`${count}_weeklyDeposit`)?.toString());
      const monthlyDeposit = parseRupeesPaise(
        formData.get(`${count}_monthlyDeposit`)?.toString(),
      );
      if (dailyRate != null) row.dailyRatePaise = dailyRate;
      if (weeklyRate != null) row.weeklyRatePaise = weeklyRate;
      if (monthlyRate != null) row.monthlyRatePaise = monthlyRate;
      if (dailyDeposit != null) row.dailyDepositPaise = dailyDeposit;
      if (weeklyDeposit != null) row.weeklyDepositPaise = weeklyDeposit;
      if (monthlyDeposit != null) row.monthlyDepositPaise = monthlyDeposit;
      if (Object.keys(row).length > 0) presets[count] = row;
    }

    await savePgSharingPresets(session, pgId, presets);
    revalidatePath(`/admin/pgs/${pgId}/edit`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
