'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import type { OverpaymentDisposition } from '@/src/lib/operations/paymentReviewTypes';
import { approveExtensionPaymentProof } from '@/src/services/extension';
import { approveElectricityPaymentProof } from '@/src/services/meterElectricity';
import { approveRentPaymentProof } from '@/src/services/rentInvoices';
import { approveDepositLinkPaymentProof } from '@/src/services/residentCharges';
import { reviewPaymentRecord, type AdminPaymentAllocationInput } from '@/src/services/qrPayments';
import { getBookingMoneyBalances } from '@/src/services/bookingMoneyBalances';
import { getNextPendingPaymentReviewKey } from '@/src/services/paymentProofQueue';
import { persistApprovalAllocationAfterSuccess } from '@/src/services/persistPaymentApprovalAllocation';
import { PAYMENT_ALREADY_APPROVED_MESSAGE } from '@/src/lib/operations/paymentReviewMessages';
import {
  rejectPaymentProof,
  reviewKindToEntityType,
} from '@/src/services/paymentProofRejectionService';
import type { PaymentProofRejectionReasonCode } from '@/src/lib/approvals/paymentProofRejectionReasons';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { formatPostgresError } from '@/src/lib/db/postgresError';
import { startPaymentApprovalTimer } from '@/src/lib/payments/paymentApprovalTiming';
import { scheduleAfterPaymentApproval } from '@/src/lib/payments/scheduleAfterPaymentApproval';

const PAYMENT_REVIEW_PATH = '/admin/operations';

/** Fast path — only surfaces the admin is about to navigate to. */
function revalidatePaymentReviewSurfacesFast(pgId: string) {
  revalidatePath(PAYMENT_REVIEW_PATH, 'page');
  revalidatePath('/admin/payment-review', 'layout');
  revalidatePath(`/admin/pgs/${pgId}/collections`);
}

/** Expensive fan-out — must not block the approve response. */
function revalidatePaymentReviewSurfacesDeferred(pgId: string, extraPaths: string[] = []) {
  scheduleAfterPaymentApproval(async () => {
    revalidatePath('/admin', 'layout');
    revalidatePath('/admin/billing');
    revalidatePath(PAYMENT_REVIEW_PATH, 'layout');
    revalidatePath('/admin/revenue');
    revalidatePath('/admin/revenue/billing');
    for (const path of extraPaths) {
      revalidatePath(path);
    }
  });
}

/** @deprecated Prefer fast + deferred split on hot approve paths. */
function revalidatePaymentReviewSurfaces(pgId: string) {
  revalidatePaymentReviewSurfacesFast(pgId);
  revalidatePaymentReviewSurfacesDeferred(pgId);
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

export async function approvePaymentReviewVerificationAction(
  kind: PendingPaymentReviewItem['kind'],
  entityId: string,
  pgId: string,
  meta?: ReviewMeta,
  currentKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  try {
    if (kind === 'qr') {
      const result = await reviewPaymentRecord(session, entityId, 'approved', {
        reviewMeta: meta,
        verificationOnly: true,
      });
      revalidatePaymentReviewSurfaces(pgId);
      revalidatePath('/admin/collections');
      revalidatePath('/admin/deposits');
      if (result.outcome === 'already_approved') {
        const nextKey = await getNextPendingPaymentReviewKey(session, currentKey);
        return {
          ok: true as const,
          message: PAYMENT_ALREADY_APPROVED_MESSAGE,
          nextKey,
        };
      }
      return withNextReviewKey(session, currentKey, { ok: true });
    }
    if (kind === 'rent') {
      return approveRentProofAction(entityId, pgId, currentKey);
    }
    if (kind === 'electricity') {
      return approveElectricityProofAction(entityId, pgId, currentKey);
    }
    if (kind === 'extension') {
      return approveExtensionProofAction(entityId, pgId, currentKey);
    }
    if (kind === 'deposit_link') {
      return approveDepositLinkProofAction(entityId, pgId, currentKey);
    }
    return { ok: false as const, message: 'Unsupported payment review kind.' };
  } catch (err) {
    return {
      ok: false as const,
      message: formatPostgresError(err),
    };
  }
}

export async function approveQrPaymentAction(
  recordId: string,
  pgId: string,
  meta?: ReviewMeta,
  currentKey?: string,
) {
  const timer = startPaymentApprovalTimer('approveQrPaymentAction');
  const session = await requireAdminPermission('payments:write');
  timer.mark('auth');

  try {
    const result = await reviewPaymentRecord(session, recordId, 'approved', {
      reviewMeta: meta,
    });
    timer.mark('settle_critical');

    scheduleAfterPaymentApproval(async () => {
      await persistApprovalAllocationAfterSuccess({
        kind: 'qr',
        entityId: recordId,
        pgId,
        approvedByAdminId: session.adminId,
      });
    });
    timer.mark('schedule_deferred');

    revalidatePaymentReviewSurfacesFast(pgId);
    revalidatePaymentReviewSurfacesDeferred(pgId, ['/admin/collections', '/admin/deposits']);
    timer.mark('revalidate_fast');

    const steps = timer.finish({
      ok: true,
      recordId,
      skippedNextKeyLookup: true,
      currentKey: currentKey ?? null,
      alreadyApproved: result.outcome === 'already_approved',
    });

    if (result.outcome === 'already_approved') {
      return {
        ok: true as const,
        message: PAYMENT_ALREADY_APPROVED_MESSAGE,
        nextKey: null as string | null,
        timing: steps,
      };
    }
    return {
      ok: true as const,
      nextKey: null as string | null,
      timing: steps,
    };
  } catch (err) {
    timer.finish({ ok: false, recordId });
    return {
      ok: false as const,
      message: formatPostgresError(err),
    };
  }
}

export async function getBookingMoneyBalancesForReviewAction(bookingId: string) {
  await requireAdminPermission('payments:write');
  const balances = await getBookingMoneyBalances(bookingId);
  if (!balances) {
    return { ok: false as const, message: 'Booking not found.' };
  }
  return { ok: true as const, balances };
}

export async function savePendingPaymentProofCorrectionAction(
  recordId: string,
  pgId: string,
  allocation: AdminPaymentAllocationInput,
  reviewKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  try {
    const { savePendingPaymentProofCorrection } = await import(
      '@/src/services/paymentProofCorrection'
    );
    const result = await savePendingPaymentProofCorrection(session, {
      recordId,
      pgId,
      allocation,
    });
    if (!result.ok) return result;

    revalidatePaymentReviewSurfaces(pgId);
    revalidatePath('/admin/collections');
    revalidatePath('/admin/deposits');
    revalidatePath('/admin/payment-review', 'layout');
    const key = reviewKey ?? `qr-${recordId}`;
    revalidatePath(`/admin/payment-review/${encodeURIComponent(key)}`);
    return result;
  } catch (err) {
    console.error('[save-proof-correction]', err);
    return {
      ok: false as const,
      message: formatPostgresError(err),
    };
  }
}

export async function approvePaymentProofWithAllocationAction(
  kind: PendingPaymentReviewItem['kind'],
  entityId: string,
  pgId: string,
  allocation: AdminPaymentAllocationInput,
  meta?: ReviewMeta,
  currentKey?: string,
) {
  const session = await requireAdminPermission('payments:write');
  try {
    const { approvePaymentProofWithAllocation } = await import(
      '@/src/services/paymentProofAllocationApproval'
    );
    const result = await approvePaymentProofWithAllocation(session, {
      kind,
      entityId,
      pgId,
      allocation,
      reviewMeta: meta,
    });
    if (!result.ok) return result;

    await persistApprovalAllocationAfterSuccess({
      kind,
      entityId,
      pgId,
      approvedByAdminId: session.adminId,
      adminAllocation: {
        confirmedReceivedPaise: allocation.confirmedReceivedPaise,
        rentAllocatedPaise: allocation.rentAllocatedPaise,
        depositAllocatedPaise: allocation.depositAllocatedPaise,
        electricityAllocatedPaise: allocation.electricityAllocatedPaise ?? 0,
        otherAllocatedPaise: allocation.otherAllocatedPaise ?? 0,
        allocationNotes: allocation.allocationNotes,
      },
    });

    revalidatePaymentReviewSurfaces(pgId);
    if (kind === 'rent') revalidatePath('/admin/rent');
    if (kind === 'electricity') revalidatePath('/admin/electricity');
    if (kind === 'extension') revalidatePath('/admin/bookings');
    if (kind === 'deposit_link') {
      revalidatePath('/admin/collections');
      revalidatePath('/admin/residents');
    }
    if (kind === 'qr') {
      revalidatePath('/admin/collections');
      revalidatePath('/admin/deposits');
    }

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
      message: formatPostgresError(err),
    };
  }
}

export async function approveQrPaymentWithAllocationAction(
  recordId: string,
  pgId: string,
  allocation: AdminPaymentAllocationInput,
  meta?: ReviewMeta & { overpaymentDisposition?: OverpaymentDisposition },
  currentKey?: string,
) {
  return approvePaymentProofWithAllocationAction('qr', recordId, pgId, allocation, meta, currentKey);
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
    await persistApprovalAllocationAfterSuccess({
      kind: 'qr',
      entityId: recordId,
      pgId,
      approvedByAdminId: session.adminId,
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
  try {
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
    try {
      revalidatePaymentReviewSurfaces(input.pgId);
      if (input.kind === 'rent') revalidatePath('/admin/rent');
      if (input.kind === 'electricity') revalidatePath('/admin/electricity');
      if (input.kind === 'extension') revalidatePath('/admin/bookings');
      if (input.kind === 'deposit_link') {
        revalidatePath('/admin/collections');
        revalidatePath('/admin/residents');
      }
    } catch (revalidateErr) {
      console.warn('[payments] revalidate after reject failed', revalidateErr);
    }
    const nextKey = await getNextPendingPaymentReviewKey(session, input.reviewKey);
    return { ok: true, nextKey, whatsappUrl: result.whatsappUrl, message: result.message };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Rejection failed.',
    };
  }
}

export async function approveRentProofAction(
  invoiceId: string,
  pgId: string,
  currentKey?: string,
) {
  const timer = startPaymentApprovalTimer('approveRentProofAction');
  const session = await requireAdminPermission('payments:write');
  timer.mark('auth');

  const result = await approveRentPaymentProof(session, invoiceId);
  timer.mark('settle_critical');

  if (!result.ok) {
    timer.finish({ ok: false, invoiceId });
    return result;
  }

  // Allocation audit + heavy cache fan-out must not block the admin response.
  // PaymentReviewWorkspace always redirects to the ops queue and ignores nextKey,
  // so skip the expensive listPendingPaymentReviews rebuild here.
  scheduleAfterPaymentApproval(async () => {
    await persistApprovalAllocationAfterSuccess({
      kind: 'rent',
      entityId: invoiceId,
      pgId,
      approvedByAdminId: session.adminId,
    });
  });
  timer.mark('schedule_deferred');

  revalidatePaymentReviewSurfacesFast(pgId);
  revalidatePaymentReviewSurfacesDeferred(pgId, ['/admin/rent']);
  timer.mark('revalidate_fast');

  const steps = timer.finish({
    ok: true,
    invoiceId,
    skippedNextKeyLookup: true,
    currentKey: currentKey ?? null,
  });

  return {
    ok: true as const,
    nextKey: null as string | null,
    timing: steps,
  };
}

export async function approveElectricityProofAction(
  invoiceId: string,
  pgId: string,
  currentKey?: string,
) {
  const timer = startPaymentApprovalTimer('approveElectricityProofAction');
  const session = await requireAdminPermission('payments:write');
  timer.mark('auth');

  const result = await approveElectricityPaymentProof(session, invoiceId);
  timer.mark('settle_critical');

  if (!result.ok) {
    timer.finish({ ok: false, invoiceId });
    return result;
  }

  scheduleAfterPaymentApproval(async () => {
    await persistApprovalAllocationAfterSuccess({
      kind: 'electricity',
      entityId: invoiceId,
      pgId,
      approvedByAdminId: session.adminId,
    });
  });
  timer.mark('schedule_deferred');

  revalidatePaymentReviewSurfacesFast(pgId);
  revalidatePaymentReviewSurfacesDeferred(pgId, ['/admin/electricity']);
  timer.mark('revalidate_fast');

  const steps = timer.finish({
    ok: true,
    invoiceId,
    skippedNextKeyLookup: true,
    currentKey: currentKey ?? null,
  });

  return {
    ok: true as const,
    nextKey: null as string | null,
    timing: steps,
  };
}

export async function approveExtensionProofAction(
  extensionId: string,
  pgId: string,
  currentKey?: string,
) {
  const timer = startPaymentApprovalTimer('approveExtensionProofAction');
  const session = await requireAdminPermission('payments:write');
  timer.mark('auth');

  const result = await approveExtensionPaymentProof(session, extensionId);
  timer.mark('settle_critical');

  if (!result.ok) {
    timer.finish({ ok: false, extensionId });
    return result;
  }

  scheduleAfterPaymentApproval(async () => {
    await persistApprovalAllocationAfterSuccess({
      kind: 'extension',
      entityId: extensionId,
      pgId,
      approvedByAdminId: session.adminId,
    });
  });
  timer.mark('schedule_deferred');

  revalidatePaymentReviewSurfacesFast(pgId);
  revalidatePaymentReviewSurfacesDeferred(pgId, ['/admin/bookings']);
  timer.mark('revalidate_fast');

  const steps = timer.finish({
    ok: true,
    extensionId,
    skippedNextKeyLookup: true,
    currentKey: currentKey ?? null,
  });

  return {
    ok: true as const,
    nextKey: null as string | null,
    timing: steps,
  };
}

export async function approveDepositLinkProofAction(
  linkId: string,
  pgId: string,
  currentKey?: string,
) {
  const timer = startPaymentApprovalTimer('approveDepositLinkProofAction');
  const session = await requireAdminPermission('payments:write');
  timer.mark('auth');

  const result = await approveDepositLinkPaymentProof(session, linkId);
  timer.mark('settle_critical');

  if (!result.ok) {
    timer.finish({ ok: false, linkId });
    return result;
  }

  scheduleAfterPaymentApproval(async () => {
    await persistApprovalAllocationAfterSuccess({
      kind: 'deposit_link',
      entityId: linkId,
      pgId,
      approvedByAdminId: session.adminId,
    });
  });
  timer.mark('schedule_deferred');

  revalidatePaymentReviewSurfacesFast(pgId);
  revalidatePaymentReviewSurfacesDeferred(pgId, ['/admin/collections', '/admin/residents']);
  timer.mark('revalidate_fast');

  const steps = timer.finish({
    ok: true,
    linkId,
    skippedNextKeyLookup: true,
    currentKey: currentKey ?? null,
  });

  return {
    ok: true as const,
    nextKey: null as string | null,
    timing: steps,
  };
}
