'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { FYH_COMMISSION_TYPES, type FyhCommissionType } from '@/src/hair/db/schema';
import {
  archiveService,
  createService,
  restoreService,
  updateService,
  type ServiceInput,
} from '@/src/hair/services/salonServices';

export type ServiceActionState = {
  error?: string;
  success?: string;
};

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function formNum(formData: FormData, key: string, fallback = 0): number {
  const raw = formStr(formData, key);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function formBool(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === 'on' || v === 'true' || v === '1';
}

function parseServiceForm(formData: FormData): ServiceInput {
  const name = formStr(formData, 'name');
  if (!name) throw new Error('Service name is required');

  const commissionRaw = formStr(formData, 'commissionType') || 'none';
  if (!(FYH_COMMISSION_TYPES as readonly string[]).includes(commissionRaw)) {
    throw new Error('Invalid commission type');
  }

  const staffIds = formData
    .getAll('staffIds')
    .map((v) => String(v).trim())
    .filter(Boolean);

  const productIds = formData.getAll('consumableProductId').map((v) => String(v).trim());
  const qtys = formData.getAll('consumableQty').map((v) => Number(v));
  const deductFlags = formData.getAll('consumableDeductInventory').map((v) => String(v));
  const consumables = productIds
    .map((productId, i) => ({
      productId,
      quantity: Number.isFinite(qtys[i]) ? qtys[i] : 0,
      deductInventory: deductFlags[i] === '1' || deductFlags[i] === 'true' || deductFlags[i] === 'on',
    }))
    .filter((c) => c.productId && c.quantity > 0);

  const category = formStr(formData, 'category');
  const customCategory = formStr(formData, 'customCategory');

  return {
    name,
    category: category === '__custom__' ? null : category || null,
    customCategory: category === '__custom__' ? customCategory : null,
    durationMinutes: formNum(formData, 'durationMinutes', 30),
    sellingPriceRupees: formNum(formData, 'sellingPriceRupees', 0),
    costPriceRupees: formNum(formData, 'costPriceRupees', 0),
    gstPercent: formNum(formData, 'gstPercent', 0),
    description: formStr(formData, 'description') || null,
    displayOrder: formNum(formData, 'displayOrder', 100),
    commissionType: commissionRaw as FyhCommissionType,
    commissionFixedRupees: formNum(formData, 'commissionFixedRupees', 0),
    commissionPercent: formNum(formData, 'commissionPercent', 0),
    overrideStaffCommission: formBool(formData, 'overrideStaffCommission'),
    availableOnline: formBool(formData, 'availableOnline'),
    featured: formBool(formData, 'featured'),
    showOnWebsite: formBool(formData, 'showOnWebsite'),
    isActive: formData.get('isActive') !== 'false',
    staffIds,
    consumables,
  };
}

export async function createServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  try {
    await requireHairAuth();
    const service = await createService(parseServiceForm(formData));
    revalidatePath('/services');
    redirect(`/services/${service.id}`);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error: e instanceof Error ? e.message : 'Failed to create service' };
  }
}

export async function updateServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  try {
    await requireHairAuth();
    const id = formStr(formData, 'id');
    if (!id) return { error: 'Missing service id' };
    await updateService(id, parseServiceForm(formData));
    revalidatePath('/services');
    revalidatePath(`/services/${id}`);
    return { success: 'Service updated.' };
  } catch (e) {
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
