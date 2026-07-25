'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { isVehicleActivityType } from '@/src/capital/lib/activityTypes';
import { rupeesToPaise } from '@/src/capital/lib/money';
import { formDataToObject, parseZod } from '@/src/capital/lib/validation/parse';
import {
  createVehicleActivitySchema,
  reverseSchema,
  updateVehicleActivitySchema,
} from '@/src/capital/lib/validation/schemas';
import {
  createVehicleActivity,
  reverseVehicleActivity,
  updateVehicleActivity,
} from '@/src/capital/services/vehicleActivities';
import { capitalDb } from '@/src/capital/db/client';
import { acAssets } from '@/src/capital/db/schema';
import { eq } from 'drizzle-orm';
import {
  lifecycleLabel,
  suggestTransitionOnActivity,
} from '@/src/capital/lib/vehicleLifecycle';

export type ActionState = {
  error?: string;
  success?: string;
  suggestedStatus?: string;
  suggestedStatusLabel?: string;
};

export async function createVehicleActivityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(createVehicleActivitySchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    const input = parsed.data;
    if (!isVehicleActivityType(input.activityType)) {
      return { error: 'Invalid activity type' };
    }

    await createVehicleActivity({
      assetId: input.assetId,
      activityType: input.activityType,
      activityAt: input.activityAt,
      amountPaise:
        input.amount != null && Number.isFinite(input.amount)
          ? rupeesToPaise(input.amount)
          : null,
      title: input.title,
      notes: input.notes,
      actualCostPaise:
        input.actualCost != null ? Math.round(input.actualCost * 100) : undefined,
      returnedPaise:
        input.returnedAmount != null ? Math.round(input.returnedAmount * 100) : undefined,
      repairAdvanceId: input.repairAdvanceId,
    });

    const [asset] = await capitalDb
      .select({ status: acAssets.status })
      .from(acAssets)
      .where(eq(acAssets.id, input.assetId))
      .limit(1);
    const suggested = asset
      ? suggestTransitionOnActivity(asset.status, input.activityType)
      : null;
    // Don't suggest if already auto-applied (e.g. repair_advance → repairing)
    const showSuggest =
      suggested &&
      asset &&
      suggested !== asset.status &&
      input.activityType === 'repair_settlement'
        ? suggested
        : null;

    revalidatePath(`/assets/${input.assetId}`);
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidatePath('/ledger');
    revalidateTag('capital-dashboard', 'default');
    return {
      success: 'Activity recorded.',
      ...(showSuggest
        ? {
            suggestedStatus: showSuggest,
            suggestedStatusLabel: lifecycleLabel(showSuggest),
          }
        : {}),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create activity' };
  }
}

export async function updateVehicleActivityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(updateVehicleActivitySchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };
    const input = parsed.data;

    await updateVehicleActivity({
      activityId: input.activityId,
      activityAt: input.activityAt,
      amountPaise:
        input.amount != null && Number.isFinite(input.amount)
          ? rupeesToPaise(input.amount)
          : undefined,
      title: input.title,
      notes: input.notes,
      actualCostPaise:
        input.actualCost != null ? Math.round(input.actualCost * 100) : undefined,
      returnedPaise:
        input.returnedAmount != null ? Math.round(input.returnedAmount * 100) : undefined,
    });

    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidatePath('/ledger');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Activity updated.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to update activity' };
  }
}

export async function reverseVehicleActivityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(reverseSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    await reverseVehicleActivity(parsed.data.id, parsed.data.reason);
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidatePath('/ledger');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Activity reversed.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to reverse activity' };
  }
}
