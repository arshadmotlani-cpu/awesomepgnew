'use server';

import { revalidatePath } from 'next/cache';
import { requireHairAuth } from '@/src/hair/lib/auth/guards';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import {
  createBridalProfile,
  sellMembership,
  sellPackage,
  topUpWallet,
} from '@/src/hair/services/loyaltyOps';

export type LoyaltyActionState = { error?: string; success?: string };

function formStr(fd: FormData, key: string) {
  return String(fd.get(key) ?? '').trim();
}

export async function sellMembershipAction(
  _prev: LoyaltyActionState,
  formData: FormData,
): Promise<LoyaltyActionState> {
  try {
    await requireHairAuth();
    await sellMembership(formStr(formData, 'customerId'), formStr(formData, 'planId'));
    revalidatePath('/loyalty');
    revalidatePath(`/customers/${formStr(formData, 'customerId')}`);
    return { success: 'Membership activated' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function sellPackageAction(
  _prev: LoyaltyActionState,
  formData: FormData,
): Promise<LoyaltyActionState> {
  try {
    await requireHairAuth();
    await sellPackage(formStr(formData, 'customerId'), formStr(formData, 'planId'));
    revalidatePath('/loyalty');
    revalidatePath(`/customers/${formStr(formData, 'customerId')}`);
    return { success: 'Package sold' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function createBridalAction(
  _prev: LoyaltyActionState,
  formData: FormData,
): Promise<LoyaltyActionState> {
  try {
    await requireHairAuth();
    await createBridalProfile({
      customerId: formStr(formData, 'customerId'),
      brideName: formStr(formData, 'brideName'),
      weddingDate: formStr(formData, 'weddingDate') || null,
      notes: formStr(formData, 'notes') || null,
    });
    revalidatePath('/loyalty');
    return { success: 'Bridal profile created' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function topUpWalletAction(
  customerId: string,
  amountRupees: number,
): Promise<LoyaltyActionState> {
  try {
    await requireHairAuth();
    const paise = Math.round(Number(amountRupees || 0) * 100);
    await topUpWallet(customerId, paise);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/loyalty');
    return { success: 'Wallet topped up' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' };
  }
}

export async function markCommissionsPaidAction(staffId: string): Promise<LoyaltyActionState> {
  try {
    await requirePermission('action:staff.commission_pay');
    const { markCommissionsPaid } = await import('@/src/hair/services/loyaltyOps');
    await markCommissionsPaid(staffId);
    revalidatePath('/loyalty');
    revalidatePath('/staff');
    return { success: 'Commissions marked paid' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' };
  }
}
