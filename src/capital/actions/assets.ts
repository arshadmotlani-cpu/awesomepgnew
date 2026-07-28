'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { rupeesToPaise } from '@/src/capital/lib/money';
import { formDataToObject, parseZod } from '@/src/capital/lib/validation/parse';
import {
  createAssetSchema,
  recordAdditionalIncomeSchema,
  recordFreeTextCostSchema,
  recordSaleSchema,
  updateAdditionalIncomeSchema,
  updateAssetDetailsSchema,
  updateAssetFundingSchema,
  updateExpectedInvestmentSchema,
  updateProfitDistributionModeSchema,
  updateSellerPriceSchema,
  updateStatusSchema,
} from '@/src/capital/lib/validation/schemas';
import {
  cancelAsset,
  createAsset,
  recordSale,
  updateAssetDetails,
  updateAssetFunding,
  updateAssetStatus,
  updateExpectedTotalInvestment,
  updateProfitDistributionMode,
  updateSellerPrice,
} from '@/src/capital/services/assets';
import { recordFreeTextCost, reverseVehicleCost } from '@/src/capital/services/vehicleCosts';
import {
  createAdditionalIncome,
  reverseAdditionalIncome,
  updateAdditionalIncome,
} from '@/src/capital/services/vehicleAdditionalIncome';
import { recalculateAsset } from '@/src/capital/services/assets';
import { uploadDocument } from '@/src/capital/services/documents';
import { deleteDraft } from '@/src/capital/services/drafts';

export type ActionState = {
  error?: string;
  success?: string;
  suggestedStatus?: string;
  suggestedStatusLabel?: string;
};

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
      year: input.year,
      fuelType: input.fuelType,
      ownership: input.ownership,
      purchaseDate: input.purchaseDate,
      expectedTotalInvestmentPaise: rupeesToPaise(input.expectedTotalInvestment),
      registrationNumber: input.registrationNumber,
      notes: input.notes,
    });
    assetId = asset.id;

    const photos = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
    for (let i = 0; i < photos.length; i += 1) {
      const file = photos[i]!;
      const bytes = Buffer.from(await file.arrayBuffer());
      await uploadDocument({
        assetId,
        documentType: 'photo',
        fileName: file.name || `photo-${i + 1}.jpg`,
        mimeType: file.type || 'image/jpeg',
        fileBytes: bytes,
        isCover: i === 0,
      });
    }

    await deleteDraft('vehicle-new-v4');
    await deleteDraft('vehicle-new-v3');
    await deleteDraft('vehicle-new-v2');
    await deleteDraft('asset-new');
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create vehicle' };
  }
  redirect(`/assets/${assetId}?tab=overview`);
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
      parsed.data.profitDistributionMode,
      parsed.data.buyerName,
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

export async function updateExpectedInvestmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(updateExpectedInvestmentSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };
    await updateExpectedTotalInvestment(
      parsed.data.assetId,
      rupeesToPaise(parsed.data.expectedTotalInvestment),
    );
    revalidatePath(`/assets/${parsed.data.assetId}`);
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Expected investment updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update expected investment' };
  }
}

export async function updateSellerPriceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(updateSellerPriceSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };
    await updateSellerPrice(parsed.data.assetId, rupeesToPaise(parsed.data.sellerPrice));
    revalidatePath(`/assets/${parsed.data.assetId}`);
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Seller price updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update seller price' };
  }
}

export async function recordFreeTextCostAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(recordFreeTextCostSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };
    await recordFreeTextCost({
      assetId: parsed.data.assetId,
      title: parsed.data.title,
      amountPaise: rupeesToPaise(parsed.data.amount),
      occurredAt: parsed.data.occurredAt,
      entryKind: parsed.data.entryKind,
      notes: parsed.data.notes,
    });
    await recalculateAsset(parsed.data.assetId);
    revalidatePath(`/assets/${parsed.data.assetId}`);
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Cost recorded.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to record cost' };
  }
}

export async function reverseVehicleCostAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const costId = String(formData.get('costId') ?? '');
    const assetId = String(formData.get('assetId') ?? '');
    if (!costId || !assetId) return { error: 'Missing cost' };
    await reverseVehicleCost(costId);
    await recalculateAsset(assetId);
    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Cost reversed.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to reverse cost' };
  }
}

export async function recordAdditionalIncomeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(recordAdditionalIncomeSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };
    await createAdditionalIncome({
      assetId: parsed.data.assetId,
      incomeType: parsed.data.incomeType,
      amountPaise: rupeesToPaise(parsed.data.amount),
      occurredAt: parsed.data.occurredAt,
      notes: parsed.data.notes,
    });
    await recalculateAsset(parsed.data.assetId);
    revalidatePath(`/assets/${parsed.data.assetId}`);
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Additional income recorded.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to record income' };
  }
}

export async function updateAdditionalIncomeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(updateAdditionalIncomeSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };
    await updateAdditionalIncome({
      id: parsed.data.id,
      incomeType: parsed.data.incomeType,
      amountPaise: rupeesToPaise(parsed.data.amount),
      occurredAt: parsed.data.occurredAt,
      notes: parsed.data.notes,
    });
    await recalculateAsset(parsed.data.assetId);
    revalidatePath(`/assets/${parsed.data.assetId}`);
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Additional income updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update income' };
  }
}

export async function reverseAdditionalIncomeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const incomeId = String(formData.get('incomeId') ?? '');
    const assetId = String(formData.get('assetId') ?? '');
    if (!incomeId || !assetId) return { error: 'Missing income entry' };
    await reverseAdditionalIncome(incomeId);
    await recalculateAsset(assetId);
    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Additional income removed.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to remove income' };
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
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Lifecycle updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update status' };
  }
}

export async function cancelAssetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const assetId = String(formData.get('assetId') ?? '');
    const reason = String(formData.get('reason') ?? 'Archived');
    if (!assetId) return { error: 'Missing vehicle' };
    await cancelAsset(assetId, reason);
    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Vehicle archived.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to archive vehicle' };
  }
}

export async function updateProfitDistributionModeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(updateProfitDistributionModeSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    await updateProfitDistributionMode(
      parsed.data.assetId,
      parsed.data.profitDistributionMode,
    );
    revalidatePath(`/assets/${parsed.data.assetId}`);
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidatePath('/reports');
    revalidatePath('/analytics'); // legacy redirect → dashboard
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Profit distribution updated. Figures recalculated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update profit distribution' };
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
      sellerPricePaise: rupeesToPaise(input.purchasePrice),
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
