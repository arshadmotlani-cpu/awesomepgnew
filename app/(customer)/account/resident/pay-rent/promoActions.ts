'use server';

import { revalidatePath } from 'next/cache';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  applyPromoToRentInvoice,
  removePromoFromRentInvoice,
} from '@/src/services/rentPromo';

export type RentPromoActionState =
  | { ok: true; discountPaise: number; promoCode: string; label: string | null; finalRentPaise: number }
  | { ok: false; error: string };

export async function applyRentPromoAction(
  invoiceId: string,
  promoCode: string,
): Promise<RentPromoActionState> {
  const session = await requireCustomerSession();
  const result = await applyPromoToRentInvoice({
    invoiceId,
    customerId: session.customerId,
    promoCode,
  });
  if (!result.ok) return result;
  revalidatePath(`/account/resident/pay-rent/${invoiceId}`);
  return result;
}

export async function removeRentPromoAction(invoiceId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCustomerSession();
  const result = await removePromoFromRentInvoice({
    invoiceId,
    customerId: session.customerId,
  });
  if (result.ok) {
    revalidatePath(`/account/resident/pay-rent/${invoiceId}`);
  }
  return result;
}
