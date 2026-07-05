'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  approveReferralWithdrawal,
  markReferralWithdrawalPaid,
  rejectReferralWithdrawal,
} from '@/src/services/referralWithdrawals';

export async function approveReferralWithdrawalAction(id: string) {
  const session = await requireAdminSession();
  await approveReferralWithdrawal({ requestId: id, adminId: session.adminId });
  revalidatePath('/admin/revenue/referral-withdrawals');
}

export async function rejectReferralWithdrawalAction(id: string, reason: string) {
  const session = await requireAdminSession();
  await rejectReferralWithdrawal({ requestId: id, adminId: session.adminId, reason });
  revalidatePath('/admin/revenue/referral-withdrawals');
}

export async function markReferralWithdrawalPaidAction(id: string) {
  const session = await requireAdminSession();
  await markReferralWithdrawalPaid({ requestId: id, adminId: session.adminId });
  revalidatePath('/admin/revenue/referral-withdrawals');
}
