'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { rupeesToPaise } from '@/src/capital/lib/money';
import { formDataToObject, parseZod } from '@/src/capital/lib/validation/parse';
import {
  createAssetSchema,
  recordSaleSchema,
  updateStatusSchema,
} from '@/src/capital/lib/validation/schemas';
import {
  createAsset,
  recordSale,
  updateAssetStatus,
} from '@/src/capital/services/assets';

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
    const asset = await createAsset({
      manufacturer: input.manufacturer,
      model: input.model,
      variant: input.variant,
      year: input.year,
      registrationNumber: input.registrationNumber,
      vin: input.vin,
      engineNumber: input.engineNumber,
      chassisNumber: input.chassisNumber,
      color: input.color,
      purchaseDate: input.purchaseDate,
      purchasePricePaise: rupeesToPaise(input.purchasePrice),
      expectedSalePricePaise: input.expectedSalePrice
        ? rupeesToPaise(Number(input.expectedSalePrice))
        : undefined,
      notes: input.notes,
      purchaseNotes: input.purchaseNotes,
    });
    assetId = asset.id;
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create asset' };
  }
  redirect(`/assets/${assetId}`);
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
