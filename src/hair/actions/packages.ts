'use server';

import { revalidatePath } from 'next/cache';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { hairDb } from '@/src/hair/db/client';
import { listActivePackageCreditsForCustomer } from '@/src/hair/domain/packages/credits';
import {
  createPackagePlan,
  listPackagePlansDetailed,
  type PackagePlanItemInput,
} from '@/src/hair/services/packagePlans';
import { listBookableServices } from '@/src/hair/services/salonServices';

export type PackageActionState = { error?: string; success?: string };

export async function listPackagePlansAction() {
  await requireHairAuth();
  return listPackagePlansDetailed({ includeInactive: false });
}

export async function listServicesForPackageAction() {
  await requireHairAuth();
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
    await requireHairAuth();
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return { error: 'Package name is required' };

    const forever = formData.get('forever') === 'on' || formData.get('forever') === 'true';
    const validityRaw = String(formData.get('validityDays') ?? '').trim();
    const validityDays = forever
      ? null
      : validityRaw
        ? Math.max(1, Math.floor(Number(validityRaw)))
        : null;
    if (!forever && (validityDays == null || !Number.isFinite(validityDays))) {
      return { error: 'Enter validity days or choose Forever' };
    }

    const offerRupees = Number(String(formData.get('offerPriceRupees') ?? '').trim());
    if (!Number.isFinite(offerRupees) || offerRupees < 0) {
      return { error: 'Offer price is required' };
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
    if (items.length === 0) return { error: 'Add at least one service with quantity' };

    await createPackagePlan({
      name,
      offerPricePaise,
      validityDays,
      items,
    });
    revalidatePath('/packages');
    return { success: 'Package created' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create package' };
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
