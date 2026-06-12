'use server';

import { revalidatePath } from 'next/cache';
import { revalidatePgAdminPages } from '@/src/lib/revalidatePgAdmin';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { uploadPublicFile } from '@/src/lib/storage/blob';
import {
  approveElectricityPaymentProof,
  createEstimatedMonthlyBill,
  recordMeterLog,
} from '@/src/services/meterElectricity';
import { addRoomElectricityPrepaidCredit } from '@/src/services/roomElectricityPrepaid';
import { firstOfMonth } from '@/src/services/billing';

export async function uploadMeterPhotoAction(formData: FormData): Promise<string> {
  await requireAdminPermission('electricity:write');
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided.');
  if (!file.type.startsWith('image/')) throw new Error('Only image files are allowed.');
  return uploadPublicFile(file, 'pg/meters');
}

export async function recordMonthlyMeterAction(
  pgId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; billId?: string }> {
  try {
    const session = await requireAdminPermission('electricity:write');
    const roomId = formData.get('roomId')?.toString() ?? '';
    const units = Number(formData.get('units'));
    const rateInr = Number(formData.get('ratePerUnitInr'));
    const meterImageUrl = formData.get('meterImageUrl')?.toString() ?? '';
    const billingMonth = formData.get('billingMonth')?.toString() ?? '';
    const useEstimate = formData.get('useEstimate') === 'on';

    if (!roomId) return { ok: false, error: 'Pick a room.' };
    if (!Number.isFinite(rateInr) || rateInr < 0) {
      return { ok: false, error: 'Rate must be ≥ 0.' };
    }
    const ratePerUnitPaise = Math.round(rateInr * 100);
    const month = billingMonth ? firstOfMonth(billingMonth) : firstOfMonth(new Date());

    if (useEstimate) {
      const result = await createEstimatedMonthlyBill(session, {
        roomId,
        billingMonth: month,
        ratePerUnitPaise,
      });
      if (!result.ok) return { ok: false, error: result.message };
      revalidatePgAdminPages(pgId);
      revalidatePath('/admin/electricity');
      return { ok: true, billId: result.billId };
    }

    if (!Number.isFinite(units) || units < 0) {
      return { ok: false, error: 'Meter units must be ≥ 0.' };
    }
    if (!meterImageUrl) {
      return { ok: false, error: 'Meter photo is required for verified readings.' };
    }

    const { billId } = await recordMeterLog(session, {
      pgId,
      roomId,
      readingType: 'monthly',
      units,
      meterImageUrl,
      recordedBy: 'admin',
      ratePerUnitPaise,
      autoCreateBill: true,
    });

    revalidatePgAdminPages(pgId);
    revalidatePath('/admin/electricity');
    return { ok: true, billId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function approveElectricityProofAction(
  invoiceId: string,
  pgId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('electricity:write');
    const result = await approveElectricityPaymentProof(session, invoiceId);
    if (!result.ok) return { ok: false, error: result.message };
    revalidatePgAdminPages(pgId);
    revalidatePath('/admin/electricity');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function addRoomElectricityPrepaidAction(
  pgId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('electricity:write');
    const roomId = formData.get('roomId')?.toString() ?? '';
    const amountInr = Number(formData.get('amountInr'));
    const paidByNote = formData.get('paidByNote')?.toString() ?? '';

    if (!roomId) return { ok: false, error: 'Pick a room.' };
    if (!Number.isFinite(amountInr) || amountInr <= 0) {
      return { ok: false, error: 'Amount must be greater than zero.' };
    }

    const result = await addRoomElectricityPrepaidCredit(session, {
      roomId,
      amountPaise: Math.round(amountInr * 100),
      paidByNote,
    });
    if (!result.ok) return { ok: false, error: result.message };

    revalidatePgAdminPages(pgId);
    revalidatePath('/admin/electricity');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
