'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { rupeesToPaise } from '@/src/capital/lib/money';
import { formDataToObject, parseZod } from '@/src/capital/lib/validation/parse';
import { createCapitalSchema, reverseSchema } from '@/src/capital/lib/validation/schemas';
import { createCapitalInvestment, reverseCapitalInvestment } from '@/src/capital/services/capital';

export type ActionState = { error?: string; success?: string };

export async function createCapitalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(createCapitalSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    const input = parsed.data;
    await createCapitalInvestment({
      investedAt: input.investedAt,
      amountPaise: rupeesToPaise(input.amount),
      paymentMode: input.paymentMode,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
    });

    revalidatePath('/capital');
    revalidatePath('/ledger');
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Capital investment recorded.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to record capital' };
  }
}

export async function reverseCapitalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(reverseSchema, {
      id: formData.get('investmentId') ?? formData.get('id'),
      reason: formData.get('reason'),
    });
    if (!parsed.ok) return { error: parsed.error };

    await reverseCapitalInvestment(parsed.data.id, parsed.data.reason);
    revalidatePath('/capital');
    revalidatePath('/ledger');
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Capital investment reversed.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to reverse capital' };
  }
}
