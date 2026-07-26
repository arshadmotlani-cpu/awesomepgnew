'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { isVehicleActivityType } from '@/src/capital/lib/activityTypes';
import { rupeesToPaise } from '@/src/capital/lib/money';
import { formDataToObject, parseZod } from '@/src/capital/lib/validation/parse';
import {
  createVehicleActivitySchema,
  recordPurchasePaymentSchema,
  reverseSchema,
  updateVehicleActivitySchema,
} from '@/src/capital/lib/validation/schemas';
import {
  createVehicleActivity,
  recordPurchasePayment,
  reverseVehicleActivity,
  updateVehicleActivity,
} from '@/src/capital/services/vehicleActivities';
import { capitalDb } from '@/src/capital/db/client';
import { acAssets, acVehicleActivities } from '@/src/capital/db/schema';
import { eq } from 'drizzle-orm';
import { capitalTrail } from '@/src/capital/lib/capitalTrail';
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
    capitalTrail('activity_saved', {
      assetId: input.assetId,
      activityType: input.activityType,
    });
    capitalTrail('recalculated', { assetId: input.assetId });

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
    revalidatePath('/reports');
    revalidatePath('/ledger');
    revalidateTag('capital-dashboard', 'default');
    capitalTrail('revalidated', { assetId: input.assetId, paths: ['asset', 'dashboard', 'reports'] });
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

export async function recordPurchasePaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(recordPurchasePaymentSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    await recordPurchasePayment({
      assetId: parsed.data.assetId,
      amountPaise: rupeesToPaise(parsed.data.amount),
      paidAt: parsed.data.paidAt,
      instrument: parsed.data.instrument,
      referenceNumber: parsed.data.referenceNumber,
      notes: parsed.data.notes,
    });
    capitalTrail('purchase_payment_saved', { assetId: parsed.data.assetId });
    capitalTrail('recalculated', { assetId: parsed.data.assetId });

    revalidatePath(`/assets/${parsed.data.assetId}`);
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidatePath('/capital');
    revalidatePath('/reports');
    revalidatePath('/ledger');
    revalidateTag('capital-dashboard', 'default');
    capitalTrail('revalidated', { assetId: parsed.data.assetId });
    return { success: 'Purchase payment recorded.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to record purchase payment' };
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

    const [row] = await capitalDb
      .select({ assetId: acVehicleActivities.assetId })
      .from(acVehicleActivities)
      .where(eq(acVehicleActivities.id, input.activityId))
      .limit(1);
    if (row) {
      revalidatePath(`/assets/${row.assetId}`);
    }
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidatePath('/reports');
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

    const [before] = await capitalDb
      .select({ assetId: acVehicleActivities.assetId })
      .from(acVehicleActivities)
      .where(eq(acVehicleActivities.id, parsed.data.id))
      .limit(1);

    await reverseVehicleActivity(parsed.data.id, parsed.data.reason);
    if (before) {
      revalidatePath(`/assets/${before.assetId}`);
    }
    revalidatePath('/assets');
    revalidatePath('/dashboard');
    revalidatePath('/reports');
    revalidatePath('/ledger');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Activity reversed.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to reverse activity' };
  }
}
