'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { rupeesToPaise } from '@/src/capital/lib/money';
import { formDataToObject, parseZod } from '@/src/capital/lib/validation/parse';
import {
  createAssetSchema,
  recordSaleSchema,
  updateAssetDetailsSchema,
  updateAssetFundingSchema,
  updateStatusSchema,
} from '@/src/capital/lib/validation/schemas';
import {
  createAsset,
  recordSale,
  updateAssetDetails,
  updateAssetFunding,
  updateAssetStatus,
} from '@/src/capital/services/assets';
import { deleteDraft } from '@/src/capital/services/drafts';

export type ActionState = { error?: string; success?: string };

export async function createAssetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let assetId: string;
  try {
    await requireCapitalAuth();
    const parsed = parseZod(createAssetSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    const input = parsed.data;
    const purchasePaise = rupeesToPaise(input.purchasePrice);
    const mePaise = rupeesToPaise(input.meInvested ?? input.purchasePrice);
    const i2Paise = rupeesToPaise(input.investor2Invested ?? 0);
    const investors = [
      { slot: 'me' as const, investedPaise: mePaise, label: 'My Investment' },
      ...(i2Paise > 0
        ? [
            {
              slot: 'investor_2' as const,
              investedPaise: i2Paise,
              label: input.investor2Label?.trim() || 'Partner Investment',
            },
          ]
        : []),
    ];

    const purchaseDate = new Date().toISOString().slice(0, 10);
    const asset = await createAsset({
      manufacturer: input.manufacturer,
      model: input.model,
      year: input.year,
      fuelType: input.fuelType,
      ownership: input.ownership,
      purchaseDate,
      purchasePricePaise: purchasePaise,
      registrationNumber: input.registrationNumber,
      notes: input.notes,
      investors,
    });
    assetId = asset.id;
    await deleteDraft('vehicle-new-v2');
    await deleteDraft('asset-new');
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create vehicle' };
  }
  redirect(`/assets/${assetId}?tab=activities&focus=purchase`);
}

export async function recordSaleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(recordSaleSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    await recordSale(
      parsed.data.assetId,
      rupeesToPaise(parsed.data.salePrice),
      parsed.data.saleDate,
    );
    revalidatePath(`/assets/${parsed.data.assetId}`);
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Sale recorded.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to record sale' };
  }
}

export async function updateAssetFundingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(updateAssetFundingSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    const input = parsed.data;
    const mePaise = rupeesToPaise(input.meInvested);
    const i2Paise = rupeesToPaise(input.investor2Invested ?? 0);
    const investors = [
      { slot: 'me' as const, investedPaise: mePaise, label: 'My Investment' },
      ...(i2Paise > 0
        ? [
            {
              slot: 'investor_2' as const,
              investedPaise: i2Paise,
              label: input.investor2Label?.trim() || 'Partner Investment',
            },
          ]
        : []),
    ];

    await updateAssetFunding(input.assetId, investors);
    revalidatePath(`/assets/${input.assetId}`);
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Investments updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update investments' };
  }
}

export async function updateStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(updateStatusSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    await updateAssetStatus(parsed.data.assetId, parsed.data.status);
    revalidatePath(`/assets/${parsed.data.assetId}`);
    revalidatePath('/assets');
    return { success: 'Status updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update status' };
  }
}

export async function updateAssetDetailsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(updateAssetDetailsSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    const input = parsed.data;
    await updateAssetDetails({
      assetId: input.assetId,
      manufacturer: input.manufacturer,
      model: input.model,
      year: input.year,
      fuelType: input.fuelType,
      ownership: input.ownership,
      registrationNumber: input.registrationNumber,
      purchasePricePaise: rupeesToPaise(input.purchasePrice),
      purchaseDate: input.purchaseDate,
      notes: input.notes,
    });
    revalidatePath(`/assets/${input.assetId}`);
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Vehicle updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update vehicle' };
  }
}
