'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { createManualProfit } from '@/src/capital/services/manualProfits';
import { createManualProfitSchema } from '@/src/capital/lib/validation/schemas';
import { rupeesToPaise } from '@/src/capital/lib/money';
import { formDataToObject, parseZod } from '@/src/capital/lib/validation/parse';

export type ManualProfitActionState = { error?: string; ok?: boolean };

export async function createManualProfitAction(
  _prev: ManualProfitActionState,
  formData: FormData,
): Promise<ManualProfitActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(createManualProfitSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    await createManualProfit({
      profitDate: parsed.data.profitDate,
      amountPaise: rupeesToPaise(parsed.data.amount),
      source: parsed.data.source,
      description: parsed.data.description,
      category: parsed.data.category,
    });
    revalidateTag('capital-dashboard', 'default');
    revalidatePath('/dashboard');
    revalidatePath('/ledger');
    revalidatePath('/analytics');
    revalidatePath('/activity');
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to add manual profit' };
  }
}
