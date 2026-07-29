'use server';

import { revalidatePath } from 'next/cache';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import {
  recordAdvancePayment,
  type AdvancePaymentMethod,
} from '@/src/hair/services/loyaltyOps';
import { searchCustomersForPos } from '@/src/hair/services/quickSale';

export type AdvancePaymentActionState = { error?: string; success?: string };

export async function searchCustomersForAdvanceAction(query: string) {
  await requireHairAuth();
  return searchCustomersForPos(query);
}

export async function submitAdvancePaymentAction(input: {
  customerId: string;
  amountPaise: number;
  method: AdvancePaymentMethod;
  reference?: string | null;
  notes?: string | null;
}): Promise<AdvancePaymentActionState & { walletBalancePaise?: number }> {
  try {
    await requireHairAuth();
    const result = await recordAdvancePayment(input);
    revalidatePath('/dashboard');
    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath('/advance-payment');
    return {
      success: `Wallet credited · balance ${(result.walletBalancePaise / 100).toFixed(2)}`,
      walletBalancePaise: result.walletBalancePaise,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not record advance payment' };
  }
}
