'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import type { OverpaymentDisposition } from '@/src/lib/operations/paymentReviewTypes';
import { approveExtensionPaymentProof } from '@/src/services/extension';
import { approveElectricityPaymentProof } from '@/src/services/meterElectricity';
import { approveRentPaymentProof } from '@/src/services/rentInvoices';
import { approveDepositLinkPaymentProof } from '@/src/services/residentCharges';
import { reviewPaymentRecord } from '@/src/services/qrPayments';
import { getNextPendingPaymentReviewKey } from '@/src/services/paymentProofQueue';
import { PAYMENT_ALREADY_APPROVED_MESSAGE } from '@/src/lib/operations/paymentReviewMessages';
import {
  rejectPaymentProof,
  reviewKindToEntityType,
} from '@/src/services/paymentProofRejectionService';
import type { PaymentProofRejectionReasonCode } from '@/src/lib/approvals/paymentProofRejectionReasons';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';

const PAYMENT_REVIEW_PATH = '/admin/operations?filter=waiting_for_approval';

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
  try {
    const result = await reviewPaymentRecord(session, recordId, 'approved', {
      reviewMeta: meta,
    });
    revalidatePaymentReviewSurfaces(pgId);
    if (result.outcome === 'already_approved') {
      const nextKey = await getNextPendingPaymentReviewKey(session, currentKey);
      return {
        ok: true as const,
        message: PAYMENT_ALREADY_APPROVED_MESSAGE,
        nextKey,
      };
    }
    return withNextReviewKey(session, currentKey, { ok: true });
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : 'Approval failed.',
    };
  }
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
    const result = await reviewPaymentRecord(session, recordId, 'approved', {
      partialDeposit: { depositDueDate },
      reviewMeta: meta,
    });
    if (result.outcome === 'already_approved') {
      revalidatePath('/admin/collections');
      revalidatePath('/admin/deposits');
      revalidatePaymentReviewSurfaces(pgId);
      return {
        ok: true as const,
        message: PAYMENT_ALREADY_APPROVED_MESSAGE,
      };
    }
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

export type RejectPaymentProofActionInput = {
  reviewKey: string;
  kind: PendingPaymentReviewItem['kind'];
  entityId: string;
  pgId: string;
  reasonCode: PaymentProofRejectionReasonCode;
  reasonDetail?: string;
  adminNote?: string;
  residentMessage: string;
  sendWhatsApp: boolean;
};

export async function rejectPaymentProofAction(
  input: RejectPaymentProofActionInput,
): Promise<
  | { ok: true; nextKey?: string | null; whatsappUrl?: string; message?: string }
  | { ok: false; message: string }
> {
  const session = await requireAdminPermission('payments:write');
  const entityType = reviewKindToEntityType(input.kind);
  const result = await rejectPaymentProof(session, {
    reviewKey: input.reviewKey,
    entityType,
    entityId: input.entityId,
    reasonCode: input.reasonCode,
    reasonDetail: input.reasonDetail,
    adminNote: input.adminNote,
    residentMessage: input.residentMessage,
    sendWhatsApp: input.sendWhatsApp,
  });
  if (!result.ok) return result;
  revalidatePaymentReviewSurfaces(input.pgId);
  if (input.kind === 'rent') revalidatePath('/admin/rent');
  if (input.kind === 'electricity') revalidatePath('/admin/electricity');
  if (input.kind === 'extension') revalidatePath('/admin/bookings');
  if (input.kind === 'deposit_link') {
    revalidatePath('/admin/collections');
    revalidatePath('/admin/residents');
  }
  const nextKey = await getNextPendingPaymentReviewKey(session, input.reviewKey);
  return { ok: true, nextKey, whatsappUrl: result.whatsappUrl, message: result.message };
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
