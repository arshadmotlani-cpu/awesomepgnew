'use server';

import { revalidatePath } from 'next/cache';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import { hairDb } from '@/src/hair/db/client';
import { listActivePackageCreditsForCustomer } from '@/src/hair/domain/packages/credits';
import {
  createPackagePlan,
  deactivatePackagePlan,
  listPackagePlansDetailed,
  reactivatePackagePlan,
  updatePackagePlan,
  type PackagePlanItemInput,
} from '@/src/hair/services/packagePlans';
import { listBookableServices } from '@/src/hair/services/salonServices';

export type PackageActionState = { error?: string; success?: string };

function parsePlanForm(formData: FormData): {
  name: string;
  offerPricePaise: number;
  validityDays: number | null;
  items: PackagePlanItemInput[];
} {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) throw new Error('Package name is required');

  const forever = formData.get('forever') === 'on' || formData.get('forever') === 'true';
  const validityRaw = String(formData.get('validityDays') ?? '').trim();
  const validityDays = forever
    ? null
    : validityRaw
      ? Math.max(1, Math.floor(Number(validityRaw)))
      : null;
  if (!forever && (validityDays == null || !Number.isFinite(validityDays))) {
    throw new Error('Enter validity days or choose Forever');
  }

  const offerRupees = Number(String(formData.get('offerPriceRupees') ?? '').trim());
  if (!Number.isFinite(offerRupees) || offerRupees < 0) {
    throw new Error('Offer price is required');
  }
  const offerPricePaise = Math.round(offerRupees * 100);

  const serviceIds = formData.getAll('serviceId').map((v) => String(v));
  const quantities = formData.getAll('quantity').map((v) => Number(String(v)));
  const items: PackagePlanItemInput[] = [];
  for (let i = 0; i < serviceIds.length; i++) {
    const serviceId = serviceIds[i]?.trim();
    const quantity = Math.floor(quantities[i] || 0);
    if (!serviceId || quantity <= 0) continue;
    items.push({ serviceId, quantity });
  }
  if (items.length === 0) throw new Error('Add at least one service with quantity');

  return { name, offerPricePaise, validityDays, items };
}

export async function listPackagePlansAction(opts?: { includeInactive?: boolean }) {
  await requirePermission('page:packages');
  return listPackagePlansDetailed({ includeInactive: opts?.includeInactive ?? true });
}

export async function listServicesForPackageAction() {
  await requirePermission('page:packages');
  const services = await listBookableServices();
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    pricePaise: s.pricePaise,
  }));
}

export async function createPackagePlanAction(
  _prev: PackageActionState,
  formData: FormData,
): Promise<PackageActionState> {
  try {
    await requirePermission('action:packages.edit');
    const parsed = parsePlanForm(formData);
    await createPackagePlan(parsed);
    revalidatePath('/packages');
    revalidatePath('/quick-sale');
    return { success: 'Package created' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create package' };
  }
}

export async function updatePackagePlanAction(
  _prev: PackageActionState,
  formData: FormData,
): Promise<PackageActionState> {
  try {
    await requirePermission('action:packages.edit');
    const planId = String(formData.get('planId') ?? '').trim();
    if (!planId) return { error: 'Package id is required' };
    const parsed = parsePlanForm(formData);
    await updatePackagePlan(planId, parsed);
    revalidatePath('/packages');
    revalidatePath('/quick-sale');
    return { success: 'Package updated' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update package' };
  }
}

export async function deactivatePackagePlanAction(planId: string): Promise<PackageActionState> {
  try {
    await requirePermission('action:packages.edit');
    const id = String(planId ?? '').trim();
    if (!id) return { error: 'Package id is required' };
    await deactivatePackagePlan(id);
    revalidatePath('/packages');
    revalidatePath('/quick-sale');
    return { success: 'Package deactivated' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to deactivate package' };
  }
}

export async function reactivatePackagePlanAction(planId: string): Promise<PackageActionState> {
  try {
    await requirePermission('action:packages.edit');
    const id = String(planId ?? '').trim();
    if (!id) return { error: 'Package id is required' };
    await reactivatePackagePlan(id);
    revalidatePath('/packages');
    revalidatePath('/quick-sale');
    return { success: 'Package activated' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to activate package' };
  }
}

export async function listAvailablePackageServicesAction(customerId: string): Promise<{
  credits: Array<{
    creditId: string;
    customerPackageId: string;
    packageName: string;
    serviceId: string;
    serviceName: string;
    remaining: number;
    effectiveUnitValuePaise: number;
  }>;
  error?: string;
}> {
  try {
    await requireHairAuth();
    if (!customerId) return { credits: [], error: 'Customer required' };
    const rows = await listActivePackageCreditsForCustomer(hairDb, customerId);
    return {
      credits: rows.map((r) => ({
        creditId: r.creditId,
        customerPackageId: r.customerPackageId,
        packageName: r.nameSnapshot ?? 'Package',
        serviceId: r.serviceId,
        serviceName: r.serviceNameSnapshot,
        remaining: r.remainingCredits,
        effectiveUnitValuePaise: r.effectiveUnitValuePaise,
      })),
    };
  } catch (e) {
    return {
      credits: [],
      error: e instanceof Error ? e.message : 'Failed to load available services',
    };
  }
}
