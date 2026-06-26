'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import type { OverpaymentDisposition } from '@/src/lib/operations/paymentReviewTypes';
import { approveExtensionPaymentProof, rejectExtensionPaymentProof } from '@/src/services/extension';
import {
  approveElectricityPaymentProof,
  rejectElectricityPaymentProof,
} from '@/src/services/meterElectricity';
import { approveRentPaymentProof, rejectRentPaymentProof } from '@/src/services/rentInvoices';
import {
  approveDepositLinkPaymentProof,
  rejectDepositLinkPaymentProof,
} from '@/src/services/residentCharges';
import { reviewPaymentRecord } from '@/src/services/qrPayments';
import { getNextPendingPaymentReviewKey } from '@/src/services/paymentProofQueue';

const PAYMENT_REVIEW_PATH = '/admin/operations/payment-reviews';

function revalidatePaymentReviewSurfaces(pgId: string) {
  revalidatePath('/admin');
  revalidatePath('/admin/billing');
  revalidatePath('/admin/payments');
  revalidatePath(PAYMENT_REVIEW_PATH);
  revalidatePath('/admin/operations');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/revenue/billing');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
  revalidatePath('/pgs');
}

async function withNextReviewKey(
  session: Awaited<ReturnType<typeof requireAdminPermission>>,
  currentKey: string | undefined,
  result: { ok: true } | { ok: false; message: string },
) {
  if (!result.ok) return result;
  const nextKey = await getNextPendingPaymentReviewKey(session, currentKey);
  return { ok: true as const, nextKey };
}

type ReviewMeta = {
  overpaymentDisposition?: OverpaymentDisposition;
  reviewNotes?: string;
  approvalNotes?: string;
};

export async function approveQrPaymentAction(
  recordId: string,
  pgId: string,
  meta?: ReviewMeta,
  currentKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  await reviewPaymentRecord(session, recordId, 'approved', {
    reviewMeta: meta,
  });
  revalidatePaymentReviewSurfaces(pgId);
  return withNextReviewKey(session, currentKey, { ok: true });
}

export async function approvePartialQrPaymentAction(
  recordId: string,
  pgId: string,
  depositDueDate: string,
  meta?: Pick<ReviewMeta, 'reviewNotes' | 'approvalNotes'>,
) {
  const session = await requireAdminPermission('payments:write');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depositDueDate)) {
    return { ok: false as const, message: 'Invalid due date.' };
  }
  try {
    await reviewPaymentRecord(session, recordId, 'approved', {
      partialDeposit: { depositDueDate },
      reviewMeta: meta,
    });
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : 'Partial approval failed.',
    };
  }
  revalidatePath('/admin/collections');
  revalidatePath('/admin/deposits');
  revalidatePaymentReviewSurfaces(pgId);
  return { ok: true as const };
}

export async function rejectQrPaymentAction(
  recordId: string,
  pgId: string,
  currentKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  await reviewPaymentRecord(session, recordId, 'rejected');
  revalidatePaymentReviewSurfaces(pgId);
  return withNextReviewKey(session, currentKey, { ok: true });
}

export async function approveRentProofAction(
  invoiceId: string,
  pgId: string,
  currentKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  const result = await approveRentPaymentProof(session, invoiceId);
  if (!result.ok) return result;
  revalidatePath('/admin/rent');
  revalidatePaymentReviewSurfaces(pgId);
  return withNextReviewKey(session, currentKey, { ok: true });
}

export async function rejectRentProofAction(
  invoiceId: string,
  pgId: string,
  reason?: string,
  currentKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  const result = await rejectRentPaymentProof(session, invoiceId, reason);
  if (!result.ok) return result;
  revalidatePath('/admin/rent');
  revalidatePaymentReviewSurfaces(pgId);
  return withNextReviewKey(session, currentKey, { ok: true });
}

export async function approveElectricityProofAction(
  invoiceId: string,
  pgId: string,
  currentKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  const result = await approveElectricityPaymentProof(session, invoiceId);
  if (!result.ok) return result;
  revalidatePath('/admin/electricity');
  revalidatePaymentReviewSurfaces(pgId);
  return withNextReviewKey(session, currentKey, { ok: true });
}

export async function rejectElectricityProofAction(
  invoiceId: string,
  pgId: string,
  reason?: string,
  currentKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  const result = await rejectElectricityPaymentProof(session, invoiceId, reason);
  if (!result.ok) return result;
  revalidatePath('/admin/electricity');
  revalidatePaymentReviewSurfaces(pgId);
  return withNextReviewKey(session, currentKey, { ok: true });
}

export async function approveExtensionProofAction(
  extensionId: string,
  pgId: string,
  currentKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  const result = await approveExtensionPaymentProof(session, extensionId);
  if (!result.ok) return result;
  revalidatePath('/admin/bookings');
  revalidatePaymentReviewSurfaces(pgId);
  return withNextReviewKey(session, currentKey, { ok: true });
}

export async function rejectExtensionProofAction(
  extensionId: string,
  pgId: string,
  currentKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  const result = await rejectExtensionPaymentProof(session, extensionId);
  if (!result.ok) return result;
  revalidatePath('/admin/bookings');
  revalidatePaymentReviewSurfaces(pgId);
  return withNextReviewKey(session, currentKey, { ok: true });
}

export async function approveDepositLinkProofAction(
  linkId: string,
  pgId: string,
  currentKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  const result = await approveDepositLinkPaymentProof(session, linkId);
  if (!result.ok) return result;
  revalidatePath('/admin/collections');
  revalidatePath('/admin/residents');
  revalidatePaymentReviewSurfaces(pgId);
  return withNextReviewKey(session, currentKey, { ok: true });
}

export async function rejectDepositLinkProofAction(
  linkId: string,
  pgId: string,
  currentKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  const result = await rejectDepositLinkPaymentProof(session, linkId);
  if (!result.ok) return result;
  revalidatePath('/admin/collections');
  revalidatePath('/admin/residents');
  revalidatePaymentReviewSurfaces(pgId);
  return withNextReviewKey(session, currentKey, { ok: true });
}
