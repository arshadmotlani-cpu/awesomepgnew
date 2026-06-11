'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { parseSharingCount, sharingTypeName } from '@/src/lib/roomSharing';
import {
  archiveBed,
  archiveRoom,
  quickAddRoomBeds,
  updateRoomBedPricing,
  updateRoomDetails,
} from '@/src/services/pgInventory';
import {
  FULLY_OCCUPIED_PG_NAME_PATTERNS,
  markPgFullyOccupied,
  markPgsFullyOccupiedByPatterns,
} from '@/src/services/occupancyAdmin';

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

export async function updateRoomDetailsAction(
  pgId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    const roomId = formData.get('roomId')?.toString()?.trim();
    if (!roomId) {
      return { ok: false, error: 'Room not found.' };
    }

    const floorNumber = Number.parseInt(formData.get('floorNumber')?.toString() ?? '', 10);
    const roomNumber = formData.get('roomNumber')?.toString() ?? '';

    await updateRoomDetails(session, pgId, roomId, {
      floorNumber,
      floorLabel: formData.get('floorLabel')?.toString(),
      roomNumber,
    });

    revalidatePath(`/admin/pgs/${pgId}/edit`);
    revalidatePath('/pgs');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function markCentralPgsFullyOccupiedAction(): Promise<{
  ok: boolean;
  error?: string;
  results?: Array<{ pgName: string; bedsMarked: number }>;
}> {
  try {
    const session = await requireAdminPermission('pgs:write');
    const results = await markPgsFullyOccupiedByPatterns(session, [
      ...FULLY_OCCUPIED_PG_NAME_PATTERNS,
    ]);
    revalidatePath('/admin');
    revalidatePath('/admin/pgs');
    revalidatePath('/pgs');
    return {
      ok: true,
      results: results.map((r) => ({ pgName: r.pgName, bedsMarked: r.bedsMarked })),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function markPgFullyOccupiedAction(
  pgId: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    const result = await markPgFullyOccupied(session, pgId);
    revalidatePath(`/admin/pgs/${pgId}/edit`);
    revalidatePath('/admin');
    revalidatePath('/pgs');
    if (result.bedsMarked === 0) {
      return { ok: true, message: 'All beds are already marked occupied.' };
    }
    return {
      ok: true,
      message: `Marked ${result.bedsMarked} bed(s) as occupied (booking ${result.bookingCode}).`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function archiveBedAction(
  pgId: string,
  bedId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    await archiveBed(session, pgId, bedId);
    revalidatePath(`/admin/pgs/${pgId}/edit`);
    revalidatePath('/pgs');
    revalidatePath('/admin/beds');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function archiveRoomAction(
  pgId: string,
  roomId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    await archiveRoom(session, pgId, roomId);
    revalidatePath(`/admin/pgs/${pgId}/edit`);
    revalidatePath('/pgs');
    revalidatePath('/admin/beds');
    revalidatePath('/admin/rooms');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateRoomPricingAction(
  pgId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    const roomId = formData.get('roomId')?.toString()?.trim();
    if (!roomId) {
      return { ok: false, error: 'Room not found.' };
    }

    const daily = Number.parseFloat(formData.get('dailyRate')?.toString() ?? '0');
    const weekly = Number.parseFloat(formData.get('weeklyRate')?.toString() ?? '0');
    const monthly = Number.parseFloat(formData.get('monthlyRate')?.toString() ?? '0');
    const dailyDepositPaise = parseRupeesPaise(formData.get('dailyDeposit')?.toString()) ?? 0;
    const weeklyDepositPaise = parseRupeesPaise(formData.get('weeklyDeposit')?.toString()) ?? 0;
    const monthlyDepositPaise = parseRupeesPaise(formData.get('monthlyDeposit')?.toString()) ?? 0;

    await updateRoomBedPricing(session, pgId, roomId, {
      dailyRatePaise: Math.round(daily * 100),
      weeklyRatePaise: Math.round(weekly * 100),
      monthlyRatePaise: Math.round(monthly * 100),
      dailyDepositPaise,
      weeklyDepositPaise,
      monthlyDepositPaise,
    });

    revalidatePath(`/admin/pgs/${pgId}/edit`);
    revalidatePath('/pgs');
    revalidatePath('/admin/pricing');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
