'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireCapitalAuth } from '@/src/capital/lib/auth/guards';
import { rupeesToPaise } from '@/src/capital/lib/money';
import { formDataToObject, parseZod } from '@/src/capital/lib/validation/parse';
import { createPaymentSchema, reverseSchema } from '@/src/capital/lib/validation/schemas';
import { createPayment, reversePayment } from '@/src/capital/services/payments';

export type ActionState = { error?: string; success?: string };

export async function createPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(createPaymentSchema, formDataToObject(formData));
    if (!parsed.ok) return { error: parsed.error };

    const input = parsed.data;
    const assetId = input.assetId && input.assetId !== '' ? input.assetId : undefined;

    await createPayment({
      assetId,
      receivedAt: input.receivedAt,
      amountPaise: rupeesToPaise(input.amount),
      paymentType: input.paymentType,
      capitalReturnedPaise: rupeesToPaise(input.capitalReturned),
      profitPaise: rupeesToPaise(input.profit),
      adjustmentPaise: rupeesToPaise(input.adjustment),
      paymentMode: input.paymentMode,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
    });

    revalidatePath('/payments');
    if (assetId) revalidatePath(`/assets/${assetId}`);
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Payment recorded.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to record payment' };
  }
}

export async function reversePaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await requireCapitalAuth();
    const parsed = parseZod(reverseSchema, {
      id: formData.get('paymentId') ?? formData.get('id'),
      reason: formData.get('reason'),
    });
    if (!parsed.ok) return { error: parsed.error };

    await reversePayment(parsed.data.id, parsed.data.reason);
    revalidatePath('/payments');
    revalidatePath('/ledger');
    revalidatePath('/dashboard');
    revalidateTag('capital-dashboard', 'default');
    return { success: 'Payment reversed.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to reverse payment' };
  }
}
