'use server';

import { revalidatePath } from 'next/cache';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { createResource, setResourceActive } from '@/src/hair/services/resources';
import type { FyhResourceType } from '@/src/hair/db/schema';

export type ResourceActionState = { error?: string; success?: string };

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export async function createResourceAction(
  _prev: ResourceActionState,
  formData: FormData,
): Promise<ResourceActionState> {
  try {
    await requireHairAuth();
    const name = formStr(formData, 'name');
    if (!name) return { error: 'Name is required.' };
    const type = (formStr(formData, 'type') || 'chair') as FyhResourceType;
    await createResource({ name, type, color: formStr(formData, 'color') || null });
    revalidatePath('/settings');
    revalidatePath('/appointments');
    return { success: 'Chair / resource added.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to add resource' };
  }
}

export async function toggleResourceActiveAction(formData: FormData): Promise<void> {
  await requireHairAuth();
  const id = formStr(formData, 'resourceId');
  const active = formStr(formData, 'isActive') === '1';
  if (!id) return;
  await setResourceActive(id, active);
  revalidatePath('/settings');
  revalidatePath('/appointments');
}
