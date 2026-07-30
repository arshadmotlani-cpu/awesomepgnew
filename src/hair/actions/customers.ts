'use server';

import { put } from '@vercel/blob';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import {
  FYH_CUSTOMER_GENDERS,
  FYH_CUSTOMER_SOURCES,
  FYH_HAIR_TYPES,
  FYH_SKIN_TYPES,
  type FyhCustomerGender,
  type FyhCustomerSource,
  type FyhHairType,
  type FyhSkinType,
} from '@/src/hair/db/schema';
import {
  addCustomerNote,
  archiveCustomer,
  createCustomer,
  findSimilarCustomers,
  listCustomers,
  type SimilarCustomer,
  updateCustomer,
  updateCustomerPhoto,
} from '@/src/hair/services/customers';
import type { FyhCustomer } from '@/src/hair/db/schema';

export type CustomerActionState = {
  error?: string;
  success?: string;
  similar?: SimilarCustomer[];
};

export async function listCustomersAction(q?: string): Promise<FyhCustomer[]> {
  await requirePermission('page:customers');
  return listCustomers({ q: q?.trim() || undefined });
}

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function optionalEnum<T extends string>(value: string, allowed: readonly T[]): T | null {
  if (!value) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function parseCustomerForm(formData: FormData) {
  const fullName = formStr(formData, 'fullName');
  const phone = formStr(formData, 'phone');
  if (!fullName) throw new Error('Name is required');
  if (!phone) throw new Error('Phone is required');

  const gender = optionalEnum(formStr(formData, 'gender'), FYH_CUSTOMER_GENDERS);
  const source = optionalEnum(formStr(formData, 'source'), FYH_CUSTOMER_SOURCES);
  const hairType = optionalEnum(formStr(formData, 'hairType'), FYH_HAIR_TYPES);
  const skinType = optionalEnum(formStr(formData, 'skinType'), FYH_SKIN_TYPES);
  if (formStr(formData, 'gender') && !gender) throw new Error('Invalid gender');
  if (formStr(formData, 'source') && !source) throw new Error('Invalid source');
  if (formStr(formData, 'hairType') && !hairType) throw new Error('Invalid hair type');
  if (formStr(formData, 'skinType') && !skinType) throw new Error('Invalid skin type');

  return {
    fullName,
    phone,
    whatsapp: formStr(formData, 'whatsapp') || null,
    email: formStr(formData, 'email') || null,
    gender: gender as FyhCustomerGender | null,
    dateOfBirth: formStr(formData, 'dateOfBirth') || null,
    anniversary: formStr(formData, 'anniversary') || null,
    address: formStr(formData, 'address') || null,
    city: formStr(formData, 'city') || null,
    state: formStr(formData, 'state') || null,
    pincode: formStr(formData, 'pincode') || null,
    occupation: formStr(formData, 'occupation') || null,
    hairType: hairType as FyhHairType | null,
    skinType: skinType as FyhSkinType | null,
    allergies: formStr(formData, 'allergies') || null,
    preferredStylist: formStr(formData, 'preferredStylist') || null,
    referredBy: formStr(formData, 'referredBy') || null,
    tags: formStr(formData, 'tags') || null,
    notes: formStr(formData, 'notes') || null,
    importantAlerts: formStr(formData, 'importantAlerts') || null,
    source: source as FyhCustomerSource | null,
    membership: formStr(formData, 'membership') || null,
    favouriteService: formStr(formData, 'favouriteService') || null,
    favouriteStylist: formStr(formData, 'favouriteStylist') || null,
    forceCreate: formStr(formData, 'forceCreate') === '1',
  };
}

export async function checkSimilarCustomersAction(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  try {
    await requirePermission('page:customers');
    const similar = await findSimilarCustomers({
      phone: formStr(formData, 'phone'),
      email: formStr(formData, 'email') || null,
      whatsapp: formStr(formData, 'whatsapp') || null,
      excludeId: formStr(formData, 'excludeId') || undefined,
    });
    return similar.length ? { similar, error: 'Possible duplicate found' } : { success: 'No matches' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Lookup failed' };
  }
}

export async function createCustomerAction(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  try {
    await requirePermission('page:customers');
    const customer = await createCustomer(parseCustomerForm(formData));
    revalidatePath('/customers');
    revalidatePath('/dashboard');
    redirect(`/customers/${customer.id}`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    if (e instanceof Error && e.message === 'SIMILAR_CUSTOMER' && 'similar' in e) {
      return {
        error: 'A similar customer already exists. Review matches or force create.',
        similar: (e as Error & { similar: SimilarCustomer[] }).similar,
      };
    }
    return { error: e instanceof Error ? e.message : 'Failed to create customer' };
  }
}

export async function updateCustomerAction(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  try {
    await requirePermission('page:customers');
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing customer id' };
    await updateCustomer(id, parseCustomerForm(formData));
    revalidatePath('/customers');
    revalidatePath(`/customers/${id}`);
    revalidatePath('/dashboard');
    return { success: 'Customer updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update customer' };
  }
}

export async function archiveCustomerAction(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  try {
    await requirePermission('page:customers');
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing customer id' };
    await archiveCustomer(id);
    revalidatePath('/customers');
    revalidatePath('/dashboard');
    redirect('/customers');
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to archive customer' };
  }
}

export async function addCustomerNoteAction(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  try {
    const admin = await requirePermission('page:customers');
    const id = formStr(formData, 'customerId');
    if (!id) return { error: 'Missing customer' };
    await addCustomerNote({
      customerId: id,
      body: formStr(formData, 'body'),
      isAlert: formStr(formData, 'isAlert') === 'on' || formStr(formData, 'isAlert') === '1',
      adminId: admin.id,
    });
    revalidatePath(`/customers/${id}`);
    return { success: 'Note added.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to add note' };
  }
}

export async function uploadCustomerPhotoAction(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  try {
    await requirePermission('page:customers');
    const id = formStr(formData, 'customerId');
    if (!id) return { error: 'Missing customer' };
    const file = formData.get('photo');
    if (!(file instanceof File) || file.size === 0) return { error: 'Choose a photo' };
    if (file.size > 4 * 1024 * 1024) return { error: 'Photo must be under 4MB' };
    if (!file.type.startsWith('image/')) return { error: 'File must be an image' };

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return { error: 'Photo storage is not configured (BLOB_READ_WRITE_TOKEN)' };
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const blob = await put(`fyh/customers/${id}/photo-${Date.now()}.${ext}`, file, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    await updateCustomerPhoto(id, blob.url);
    revalidatePath(`/customers/${id}`);
    return { success: 'Photo updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to upload photo' };
  }
}
