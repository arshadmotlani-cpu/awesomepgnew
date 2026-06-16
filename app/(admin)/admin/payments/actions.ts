'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { approveExtensionPaymentProof } from '@/src/services/extension';
import { approveElectricityPaymentProof } from '@/src/services/meterElectricity';
import { approveRentPaymentProof } from '@/src/services/rentInvoices';
import { approveDepositLinkPaymentProof } from '@/src/services/residentCharges';
import { reviewPaymentRecord } from '@/src/services/qrPayments';

export async function approveQrPaymentAction(recordId: string, pgId: string) {
  const session = await requireAdminPermission('payments:write');
  await reviewPaymentRecord(session, recordId, 'approved');
  revalidatePath('/admin');
  revalidatePath('/admin/payments');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  revalidatePath('/pgs');
  return { ok: true as const };
}

export async function approvePartialQrPaymentAction(
  recordId: string,
  pgId: string,
  depositDueDate: string,
) {
  const session = await requireAdminPermission('payments:write');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depositDueDate)) {
    return { ok: false as const, message: 'Invalid due date.' };
  }
  try {
    await reviewPaymentRecord(session, recordId, 'approved', {
      partialDeposit: { depositDueDate },
    });
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : 'Partial approval failed.',
    };
  }
  revalidatePath('/admin');
  revalidatePath('/admin/payments');
  revalidatePath('/admin/collections');
  revalidatePath('/admin/deposits');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  revalidatePath('/pgs');
  return { ok: true as const };
}

export async function rejectQrPaymentAction(recordId: string, pgId: string) {
  const session = await requireAdminPermission('payments:write');
  await reviewPaymentRecord(session, recordId, 'rejected');
  revalidatePath('/admin');
  revalidatePath('/admin/payments');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  return { ok: true as const };
}

export async function approveRentProofAction(invoiceId: string, pgId: string) {
  const session = await requireAdminPermission('payments:write');
  const result = await approveRentPaymentProof(session, invoiceId);
  if (!result.ok) return result;
  revalidatePath('/admin');
  revalidatePath('/admin/payments');
  revalidatePath('/admin/rent');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  return { ok: true as const };
}

export async function approveElectricityProofAction(invoiceId: string, pgId: string) {
  const session = await requireAdminPermission('payments:write');
  const result = await approveElectricityPaymentProof(session, invoiceId);
  if (!result.ok) return result;
  revalidatePath('/admin');
  revalidatePath('/admin/payments');
  revalidatePath('/admin/electricity');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  return { ok: true as const };
}

export async function approveExtensionProofAction(extensionId: string, pgId: string) {
  const session = await requireAdminPermission('payments:write');
  const result = await approveExtensionPaymentProof(session, extensionId);
  if (!result.ok) return result;
  revalidatePath('/admin');
  revalidatePath('/admin/payments');
  revalidatePath('/admin/bookings');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  return { ok: true as const };
}

export async function approveDepositLinkProofAction(linkId: string, pgId: string) {
  const session = await requireAdminPermission('payments:write');
  const result = await approveDepositLinkPaymentProof(session, linkId);
  if (!result.ok) return result;
  revalidatePath('/admin');
  revalidatePath('/admin/payments');
  revalidatePath('/admin/collections');
  revalidatePath('/admin/residents');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  return { ok: true as const };
}
