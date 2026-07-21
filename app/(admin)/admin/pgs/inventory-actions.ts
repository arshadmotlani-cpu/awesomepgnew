'use server';

import { revalidatePath } from 'next/cache';
import { revalidatePublicPgBrowseCache } from '@/src/lib/cache/revalidatePublicPg';
import { revalidatePgAdminPages } from '@/src/lib/revalidatePgAdmin';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { parseSharingCount, sharingTypeName } from '@/src/lib/roomSharing';
import {
  archiveBed,
  archiveRoom,
  quickAddRoomBeds,
  updateRoomBedPricing,
  updateRoomDetails,
} from '@/src/services/pgInventory';
import { markPgFullyOccupied, clearPgOccupancyPlaceholders } from '@/src/services/occupancyAdmin';

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
      roomTypeName:
        formData.get('roomTypeName')?.toString()?.trim() || sharingTypeName(sharing),
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

    revalidatePgAdminPages(pgId);
    revalidatePublicPgBrowseCache({ pgId });
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
    const roomTypeNameRaw = formData.get('roomTypeName')?.toString()?.trim();

    await updateRoomDetails(session, pgId, roomId, {
      floorNumber,
      floorLabel: formData.get('floorLabel')?.toString(),
      roomNumber,
      roomTypeName: roomTypeNameRaw || undefined,
      hasAc: formData.get('hasAc') === 'on',
      notes: formData.get('notes')?.toString(),
    });

    revalidatePgAdminPages(pgId);
    revalidatePublicPgBrowseCache({ pgId });
    return { ok: true };
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
    revalidatePgAdminPages(pgId);
    revalidatePath('/admin');
    revalidatePublicPgBrowseCache({ pgId });
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

export async function clearPgOccupancyPlaceholdersAction(
  pgId: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    const result = await clearPgOccupancyPlaceholders(session, pgId);
    revalidatePgAdminPages(pgId);
    revalidatePath('/admin');
    revalidatePath('/admin/bookings');
    revalidatePath('/admin/residents');
    revalidatePublicPgBrowseCache({ pgId });
    if (result.bedsReleased === 0) {
      return { ok: true, message: 'No placeholder occupancy to clear — beds should already be available.' };
    }
    return {
      ok: true,
      message: `Released ${result.bedsReleased} bed(s) from ${result.bookingsCancelled} placeholder booking(s).`,
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
    revalidatePgAdminPages(pgId);
    revalidatePublicPgBrowseCache({ pgId });
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
    revalidatePgAdminPages(pgId);
    revalidatePublicPgBrowseCache({ pgId });
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

    revalidatePgAdminPages(pgId);
    revalidatePublicPgBrowseCache({ pgId });
    revalidatePath('/admin/pricing');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
