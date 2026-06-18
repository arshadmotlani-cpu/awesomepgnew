'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  approveCheckoutSettlement,
  archiveCheckoutSettlement,
  deleteCheckoutSettlement,
  markCheckoutRefundPaid,
  rebuildCheckoutSettlement,
  updateCheckoutSettlementAdminFields,
} from '@/src/services/checkoutSettlement';

export type CheckoutSettlementActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

function revalidateCheckoutPaths(settlementId?: string) {
  revalidatePath('/admin/checkout-settlements');
  revalidatePath('/admin/vacating');
  revalidatePath('/admin/deposits');
  revalidatePath('/admin/residents');
  if (settlementId) {
    revalidatePath(`/admin/checkout-settlements/${settlementId}`);
  }
}

export async function approveCheckoutSettlementAction(
  _prev: CheckoutSettlementActionState,
  formData: FormData,
): Promise<CheckoutSettlementActionState> {
  const admin = await requireAdminPermission('deposits:write');
  const settlementId = String(formData.get('settlementId') ?? '');
  const noticeDeductionInr = Number(formData.get('noticeDeductionInr'));
  const damageInr = Number(formData.get('damageChargeInr') ?? 0);
  const cleaningInr = Number(formData.get('cleaningChargeInr') ?? 0);
  const customInr = Number(formData.get('customChargeInr') ?? 0);
  const customLabel = String(formData.get('customChargeLabel') ?? '').trim();
  const electricityInr = Number(formData.get('electricityShareInr') ?? 0);

  if (Number.isFinite(noticeDeductionInr) && noticeDeductionInr >= 0) {
    await updateCheckoutSettlementAdminFields({
      settlementId,
      noticeDeductionPaise: Math.round(noticeDeductionInr * 100),
      damageChargePaise: Math.round(damageInr * 100),
      cleaningChargePaise: Math.round(cleaningInr * 100),
      customChargePaise: Math.round(customInr * 100),
      customChargeLabel: customLabel || null,
      electricitySharePaise: Math.round(electricityInr * 100),
    });
  }

  const result = await approveCheckoutSettlement({
    settlementId,
    adminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: result.error };
  }
  revalidateCheckoutPaths(settlementId);
  return {
    status: 'ok',
    message: `Settlement approved. Final refund: ₹${(result.finalRefundPaise / 100).toFixed(2)}`,
  };
}

export async function markCheckoutRefundPaidAction(
  _prev: CheckoutSettlementActionState,
  formData: FormData,
): Promise<CheckoutSettlementActionState> {
  const admin = await requireAdminPermission('deposits:write');
  const settlementId = String(formData.get('settlementId') ?? '');
  const refundReference = String(formData.get('refundReference') ?? '').trim();
  const refundMethod = String(formData.get('refundMethod') ?? '').trim();
  const refundNotes = String(formData.get('refundNotes') ?? '').trim();

  if (!refundReference) {
    return { status: 'error', message: 'Enter UPI reference or transaction number.' };
  }

  const result = await markCheckoutRefundPaid({
    settlementId,
    adminId: admin.adminId,
    refundReference,
    refundMethod: refundMethod || undefined,
    refundNotes: refundNotes || undefined,
  });
  if (!result.ok) {
    return { status: 'error', message: result.error };
  }
  revalidateCheckoutPaths(settlementId);
  return { status: 'ok', message: 'Refund marked as paid. Settlement completed.' };
}

export async function updateCheckoutSettlementFieldsAction(
  _prev: CheckoutSettlementActionState,
  formData: FormData,
): Promise<CheckoutSettlementActionState> {
  await requireAdminPermission('deposits:write');
  const settlementId = String(formData.get('settlementId') ?? '');
  const noticeDeductionInr = Number(formData.get('noticeDeductionInr'));
  const damageInr = Number(formData.get('damageChargeInr') ?? 0);
  const cleaningInr = Number(formData.get('cleaningChargeInr') ?? 0);
  const customInr = Number(formData.get('customChargeInr') ?? 0);
  const customLabel = String(formData.get('customChargeLabel') ?? '').trim();
  const electricityInr = Number(formData.get('electricityShareInr') ?? 0);

  const result = await updateCheckoutSettlementAdminFields({
    settlementId,
    noticeDeductionPaise: Math.round(noticeDeductionInr * 100),
    damageChargePaise: Math.round(damageInr * 100),
    cleaningChargePaise: Math.round(cleaningInr * 100),
    customChargePaise: Math.round(customInr * 100),
    customChargeLabel: customLabel || null,
    electricitySharePaise: Math.round(electricityInr * 100),
  });
  if (!result.ok) {
    return { status: 'error', message: result.error };
  }
  revalidateCheckoutPaths(settlementId);
  return { status: 'ok', message: 'Settlement amounts updated.' };
}

export async function deleteCheckoutSettlementAction(
  _prev: CheckoutSettlementActionState,
  formData: FormData,
): Promise<CheckoutSettlementActionState> {
  const admin = await requireAdminPermission('deposits:write');
  const settlementId = String(formData.get('settlementId') ?? '');
  const confirm = String(formData.get('confirmText') ?? '').trim();
  if (confirm !== 'DELETE') {
    return { status: 'error', message: 'Type DELETE to confirm removal.' };
  }

  const result = await deleteCheckoutSettlement({
    settlementId,
    adminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: result.error };
  }
  revalidateCheckoutPaths(settlementId);
  redirect('/admin/checkout-settlements');
}

export async function rebuildCheckoutSettlementAction(
  _prev: CheckoutSettlementActionState,
  formData: FormData,
): Promise<CheckoutSettlementActionState> {
  const admin = await requireAdminPermission('deposits:write');
  const settlementId = String(formData.get('settlementId') ?? '');

  const result = await rebuildCheckoutSettlement({
    settlementId,
    adminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: result.error };
  }
  revalidateCheckoutPaths(result.settlementId);
  redirect(`/admin/checkout-settlements/${result.settlementId}`);
}

export async function archiveCheckoutSettlementAction(
  _prev: CheckoutSettlementActionState,
  formData: FormData,
): Promise<CheckoutSettlementActionState> {
  const admin = await requireAdminPermission('deposits:write');
  const settlementId = String(formData.get('settlementId') ?? '');

  const result = await archiveCheckoutSettlement({
    settlementId,
    adminId: admin.adminId,
  });
  if (!result.ok) {
    return { status: 'error', message: result.error };
  }
  revalidateCheckoutPaths(settlementId);
  redirect('/admin/checkout-settlements?tab=archived');
}
