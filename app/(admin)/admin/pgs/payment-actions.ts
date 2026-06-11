'use server';

import { revalidatePath } from 'next/cache';
import { revalidatePgAdminPages } from '@/src/lib/revalidatePgAdmin';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { uploadToCloudinary } from '@/src/lib/images/cloudinary';
import {
  createPaymentCategory,
  setPgPaymentEnabled,
  updatePaymentCategory,
} from '@/src/services/qrPayments';

export async function togglePgPaymentsAction(pgId: string, enabled: boolean) {
  const session = await requireAdminPermission('pgs:write');
  await setPgPaymentEnabled(session, pgId, enabled);
  revalidatePgAdminPages(pgId);
  revalidatePath('/pgs');
  return { ok: true };
}

export async function createPaymentCategoryAction(
  pgId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    await createPaymentCategory(session, pgId, {
      name: formData.get('name')?.toString() ?? '',
      qrCodeImageUrl: formData.get('qrCodeImageUrl')?.toString() ?? '',
      upiId: formData.get('upiId')?.toString(),
      isActive: formData.get('isActive') === 'on',
    });
    revalidatePgAdminPages(pgId);
    revalidatePath('/pgs');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updatePaymentCategoryAction(
  pgId: string,
  categoryId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    await updatePaymentCategory(session, categoryId, {
      name: formData.get('name')?.toString(),
      qrCodeImageUrl: formData.get('qrCodeImageUrl')?.toString(),
      upiId: formData.get('upiId')?.toString(),
      isActive: formData.get('isActive') === 'on',
    });
    revalidatePgAdminPages(pgId);
    revalidatePath('/pgs');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function uploadQrImageAction(formData: FormData): Promise<string> {
  await requireAdminPermission('pgs:write');
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided.');
  if (!file.type.startsWith('image/')) throw new Error('Only image files are allowed.');
  return uploadToCloudinary(file);
}

export async function uploadPaymentScreenshotAction(formData: FormData): Promise<string> {
  const { getCustomerSession } = await import('@/src/lib/auth/session');
  const session = await getCustomerSession();
  if (!session) throw new Error('Sign in required.');
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided.');
  if (!file.type.startsWith('image/')) throw new Error('Only screenshot images are allowed.');
  return uploadToCloudinary(file);
}
