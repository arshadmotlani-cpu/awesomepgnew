'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { hasPermission } from '@/src/hair/lib/auth/permissions';
import { canonicalServiceName } from '@/src/hair/lib/serviceName';
import {
  archiveService,
  createService,
  DuplicateServiceError,
  restoreService,
  updateService,
  type ServiceInput,
} from '@/src/hair/services/salonServices';

export type ServiceActionState = {
  error?: string;
  success?: string;
  /** Set when create succeeded (stay on new-service page). */
  created?: boolean;
  /** Existing service id when name is a duplicate. */
  duplicateServiceId?: string;
};

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function formName(formData: FormData): string {
  return canonicalServiceName(String(formData.get('name') ?? ''));
}

function formNum(formData: FormData, key: string): number | null {
  const raw = formStr(formData, key);
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseServiceForm(formData: FormData, opts?: { allowCost?: boolean }): ServiceInput {
  const name = formName(formData);
  if (!name) throw new Error('Service name is required');

  const category = formStr(formData, 'category');
  if (!category) throw new Error('Category is required');

  const costPriceRupees = formNum(formData, 'costPriceRupees');
  if (costPriceRupees === null) throw new Error('Cost price is required');
  if (costPriceRupees < 0) throw new Error('Cost price cannot be negative');
  if (!opts?.allowCost && costPriceRupees > 0) {
    throw new Error('Service cost requires inventory permission');
  }

  const sellingPriceRupees = formNum(formData, 'sellingPriceRupees');
  if (sellingPriceRupees === null || sellingPriceRupees < 0) {
    throw new Error('Selling price is required');
  }

  const durationMinutes = formNum(formData, 'durationMinutes');
  if (durationMinutes === null || durationMinutes <= 0) {
    throw new Error('Duration must be a positive number of minutes');
  }

  const status = formStr(formData, 'status') || 'active';
  const isActive = status !== 'inactive';

  return {
    name,
    category,
    durationMinutes,
    sellingPriceRupees,
    costPriceRupees: opts?.allowCost ? costPriceRupees : 0,
    description: formStr(formData, 'description') || null,
    isActive,
  };
}

export async function createServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  try {
    const admin = await requireHairAuth();
    await createService(parseServiceForm(formData, { allowCost: hasPermission(admin, 'page:inventory') }));
    revalidatePath('/services');
    revalidatePath('/services/new');
    return {
      success: 'Service created successfully.',
      created: true,
    };
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    if (e instanceof DuplicateServiceError) {
      return {
        error: e.message,
        duplicateServiceId: e.existingId,
      };
    }
    return { error: e instanceof Error ? e.message : 'Failed to create service' };
  }
}

export async function updateServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  try {
    const admin = await requireHairAuth();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing service id' };
    const allowCost = hasPermission(admin, 'page:inventory');
    const input = parseServiceForm(formData, { allowCost });
    if (!allowCost) {
      const { getService } = await import('@/src/hair/services/salonServices');
      const existing = await getService(id);
      if (existing) input.costPriceRupees = existing.costPricePaise / 100;
    }
    await updateService(id, input);
    revalidatePath('/services');
    revalidatePath(`/services/${id}`);
    return { success: 'Changes saved successfully.' };
  } catch (e) {
    if (e instanceof DuplicateServiceError) {
      return {
        error: e.message,
        duplicateServiceId: e.existingId,
      };
    }
    return { error: e instanceof Error ? e.message : 'Failed to update service' };
  }
}

export async function archiveServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  try {
    await requireHairAuth();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing service id' };
    await archiveService(id);
    revalidatePath('/services');
    revalidatePath(`/services/${id}`);
    redirect('/services?status=inactive');
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to archive service' };
  }
}

export async function restoreServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  try {
    await requireHairAuth();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing service id' };
    await restoreService(id);
    revalidatePath('/services');
    revalidatePath(`/services/${id}`);
    redirect(`/services/${id}`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to restore service' };
  }
}
