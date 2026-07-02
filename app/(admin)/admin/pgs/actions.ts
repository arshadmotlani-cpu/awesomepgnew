'use server';

import { revalidatePath } from 'next/cache';
import { revalidatePgAdminPages } from '@/src/lib/revalidatePgAdmin';
import { redirect, unstable_rethrow } from 'next/navigation';
import type { PgAmenities } from '@/src/db/schema';
import { friendlyDbError } from '@/src/lib/db/friendlyDbError';
import { PG_AMENITY_KEYS } from '@/src/lib/pgAmenities';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { archivePg, createPg, updatePg, type PgFormInput } from '@/src/services/pgAdmin';

export type PgFormState = {
  ok: boolean;
  error?: string;
  pgId?: string;
};

function parseAmenities(formData: FormData): PgAmenities {
  const amenities: PgAmenities = {};
  for (const key of PG_AMENITY_KEYS) {
    if (formData.get(`amenity_${key}`) === 'on') amenities[key] = true;
  }
  return amenities;
}

function parseJsonUrlList(field: string, formData: FormData): string[] {
  const raw = formData.get(field)?.toString() ?? '[]';
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
  } catch {
    return [];
  }
}

function parseAmenitiesExtended(formData: FormData): PgAmenities {
  const amenities = parseAmenities(formData);
  const custom = formData.get('customAmenities')?.toString()?.trim();
  if (custom) {
    amenities.custom = custom
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return amenities;
}

function parseInput(formData: FormData): PgFormInput {
  const gender = formData.get('genderPolicy')?.toString();
  if (gender !== 'male' && gender !== 'female' && gender !== 'coed') {
    throw new Error('Invalid gender policy.');
  }

  const depositPolicy = formData.get('monthlyDepositPolicy')?.toString();
  const monthlyDepositPolicy =
    depositPolicy === 'two_month' ? 'two_month' : 'one_month';

  return {
    name: formData.get('name')?.toString() ?? '',
    slug: formData.get('slug')?.toString(),
    addressLine1: formData.get('addressLine1')?.toString() ?? '',
    addressLine2: formData.get('addressLine2')?.toString() || undefined,
    city: formData.get('city')?.toString() ?? '',
    state: formData.get('state')?.toString() ?? '',
    pincode: formData.get('pincode')?.toString() ?? '',
    genderPolicy: gender as PgFormInput['genderPolicy'],
    monthlyDepositPolicy,
    description: formData.get('description')?.toString(),
    contactPhone: formData.get('contactPhone')?.toString(),
    contactEmail: formData.get('contactEmail')?.toString(),
    amenities: parseAmenitiesExtended(formData),
    images: parseJsonUrlList('images', formData),
    videos: parseJsonUrlList('videos', formData),
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
    revalidatePath('/admin/overview');
    revalidatePath('/admin/actions');
    redirect(`/admin/pgs/${id}/listing?created=1`);
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
    revalidatePgAdminPages(pgId);
    return { ok: true, pgId };
  } catch (err) {
    return { ok: false, error: friendlyDbError(err) };
  }
}

export async function uploadPgImageAction(formData: FormData): Promise<string> {
  await requireAdminPermission('pgs:write');
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided.');
  const { uploadPublicFile } = await import('@/src/lib/storage/blob');
  return uploadPublicFile(file, 'pg/images');
}

export async function uploadPgVideoAction(formData: FormData): Promise<string> {
  await requireAdminPermission('pgs:write');
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('No file provided.');
  const { uploadPublicFile } = await import('@/src/lib/storage/blob');
  return uploadPublicFile(file, 'pg/videos');
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
    revalidatePath('/admin/overview');
    revalidatePath('/admin/actions');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
