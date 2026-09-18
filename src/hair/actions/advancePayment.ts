'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import {
  recordAdvancePayment,
  type AdvancePaymentMethod,
} from '@/src/hair/services/loyaltyOps';
import { searchCustomersForPos } from '@/src/hair/services/quickSale';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export type AdvancePaymentActionState = { error?: string; success?: string };

export async function searchCustomersForAdvanceAction(query: string) {
  await requirePermission('page:billing');
  return searchCustomersForPos(query);
}

export async function submitAdvancePaymentAction(input: {
  customerId: string;
  amountPaise: number;
  method: AdvancePaymentMethod;
  reference?: string | null;
  notes?: string | null;
  paidOn?: string | null;
  idempotencyKey?: string | null;
}): Promise<
  AdvancePaymentActionState & {
    walletBalancePaise?: number;
    invoiceId?: string;
    invoiceNumber?: string;
  }
> {
  try {
    await requirePermission('action:billing.checkout');
    const result = await recordAdvancePayment(input);
    revalidatePath('/dashboard/revenue');
    revalidatePath('/billing/invoices');
    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath('/advance-payment');
    return {
      success: `Customer credit updated · balance ${formatInrFromPaise(result.walletBalancePaise)}`,
      walletBalancePaise: result.walletBalancePaise,
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not record advance payment' };
  }
}
