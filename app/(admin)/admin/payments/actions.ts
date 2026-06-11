'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { approveExtensionPaymentProof } from '@/src/services/extension';
import { approveElectricityPaymentProof } from '@/src/services/meterElectricity';
import { approveRentPaymentProof } from '@/src/services/rentInvoices';
import { reviewPaymentRecord } from '@/src/services/qrPayments';

export async function approveQrPaymentAction(recordId: string, pgId: string) {
  const session = await requireAdminPermission('payments:write');
  await reviewPaymentRecord(session, recordId, 'approved');
  revalidatePath('/admin/payments');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  revalidatePath('/pgs');
  return { ok: true as const };
}

export async function rejectQrPaymentAction(recordId: string, pgId: string) {
  const session = await requireAdminPermission('payments:write');
  await reviewPaymentRecord(session, recordId, 'rejected');
  revalidatePath('/admin/payments');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  return { ok: true as const };
}

export async function approveRentProofAction(invoiceId: string, pgId: string) {
  const session = await requireAdminPermission('payments:write');
  const result = await approveRentPaymentProof(session, invoiceId);
  if (!result.ok) return result;
  revalidatePath('/admin/payments');
  revalidatePath('/admin/rent');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  return { ok: true as const };
}

export async function approveElectricityProofAction(invoiceId: string, pgId: string) {
  const session = await requireAdminPermission('payments:write');
  const result = await approveElectricityPaymentProof(session, invoiceId);
  if (!result.ok) return result;
  revalidatePath('/admin/payments');
  revalidatePath('/admin/electricity');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  return { ok: true as const };
}

export async function approveExtensionProofAction(extensionId: string, pgId: string) {
  const session = await requireAdminPermission('payments:write');
  const result = await approveExtensionPaymentProof(session, extensionId);
  if (!result.ok) return result;
  revalidatePath('/admin/payments');
  revalidatePath('/admin/bookings');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  return { ok: true as const };
}
