'use server';

import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import type { PgAmenities } from '@/src/db/schema';
import { friendlyDbError } from '@/src/lib/db/friendlyDbError';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { archivePg, createPg, updatePg, type PgFormInput } from '@/src/services/pgAdmin';

export type PgFormState = {
  ok: boolean;
  error?: string;
  pgId?: string;
};

function parseAmenities(formData: FormData): PgAmenities {
  const keys = ['wifi', 'food', 'laundry', 'parking', 'ac', 'housekeeping', 'powerBackup'] as const;
  const amenities: PgAmenities = {};
  for (const key of keys) {
    if (formData.get(`amenity_${key}`) === 'on') amenities[key] = true;
  }
  return amenities;
}

function parseImages(formData: FormData): string[] {
  const raw = formData.get('images')?.toString() ?? '[]';
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
  } catch {
    return [];
  }
}

function parseInput(formData: FormData): PgFormInput {
  const gender = formData.get('genderPolicy')?.toString();
  if (gender !== 'male' && gender !== 'female' && gender !== 'coed') {
    throw new Error('Invalid gender policy.');
  }

  return {
    name: formData.get('name')?.toString() ?? '',
    slug: formData.get('slug')?.toString(),
    addressLine1: formData.get('addressLine1')?.toString() ?? '',
    addressLine2: formData.get('addressLine2')?.toString(),
    city: formData.get('city')?.toString() ?? '',
    state: formData.get('state')?.toString() ?? '',
    pincode: formData.get('pincode')?.toString() ?? '',
    genderPolicy: gender as PgFormInput['genderPolicy'],
    description: formData.get('description')?.toString(),
    contactPhone: formData.get('contactPhone')?.toString(),
    contactEmail: formData.get('contactEmail')?.toString(),
    amenities: parseAmenities(formData),
    images: parseImages(formData),
    isActive: formData.get('isActive') === 'on',
  };
}

export async function createPgAction(_prev: PgFormState, formData: FormData): Promise<PgFormState> {
  try {
    const session = await requireAdminPermission('pgs:write');
    const input = parseInput(formData);
    if (!input.name.trim()) return { ok: false, error: 'Name is required.' };

    const id = await createPg(session, input);
    revalidatePath('/pgs');
    revalidatePath('/admin/pgs');
    revalidatePath('/admin/dashboard');
    redirect(`/admin/pgs/${id}/edit?created=1`);
  } catch (err) {
    unstable_rethrow(err);
    return { ok: false, error: friendlyDbError(err) };
  }
}

export async function updatePgAction(
  pgId: string,
  _prev: PgFormState,
  formData: FormData,
): Promise<PgFormState> {
  try {
    const session = await requireAdminPermission('pgs:write');
    const input = parseInput(formData);
    await updatePg(session, pgId, input);
    revalidatePath('/pgs');
    revalidatePath(`/pgs/${input.slug ?? ''}`);
    revalidatePath('/admin/pgs');
    revalidatePath(`/admin/pgs/${pgId}/edit`);
    return { ok: true, pgId };
  } catch (err) {
    return { ok: false, error: friendlyDbError(err) };
  }
}

export async function uploadPgImageAction(formData: FormData): Promise<string> {
  await requireAdminPermission('pgs:write');
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided.');
  const { uploadToCloudinary } = await import('@/src/lib/images/cloudinary');
  return uploadToCloudinary(file);
}

export async function archivePgFormAction(formData: FormData): Promise<void> {
  try {
    const pgId = formData.get('pgId')?.toString();
    if (!pgId) return;
    await archivePgAction(pgId);
    redirect('/admin/pgs');
  } catch (err) {
    unstable_rethrow(err);
  }
}

export async function archivePgAction(pgId: string): Promise<PgFormState> {
  try {
    const session = await requireAdminPermission('pgs:write');
    await archivePg(session, pgId);
    revalidatePath('/pgs');
    revalidatePath('/admin/pgs');
    revalidatePath('/admin/dashboard');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
