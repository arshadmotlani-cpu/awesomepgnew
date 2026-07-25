'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  approveCheckoutSettlement,
  archiveCheckoutSettlement,
  deleteCheckoutSettlement,
  isCheckoutSettlementAdminComplete,
  markCheckoutRefundPaid,
  rebuildCheckoutSettlement,
  rejectResidentCheckoutSubmission,
  updateCheckoutElectricitySettlement,
  updateCheckoutSettlementAdminFields,
} from '@/src/services/checkoutSettlement';
import { agentSessionLog } from '@/src/lib/debug/agentSessionLog';
import type { CheckoutSettlementActionState } from '@/src/lib/checkout/checkoutSettlementActionTypes';
import {
  CHECKOUT_COMPLETE_SUCCESS_MESSAGE,
  CHECKOUT_DEFER_SUCCESS_MESSAGE,
} from '@/src/lib/checkout/checkoutSettlementActionTypes';

function revalidateCheckoutPaths(
  settlementId?: string,
  opts?: { skipSettlementDetail?: boolean },
) {
  revalidatePath('/admin/checkout-settlements', 'layout');
  revalidatePath('/admin/vacating', 'layout');
  revalidatePath('/admin/deposits', 'layout');
  revalidatePath('/admin/residents', 'layout');
  revalidatePath('/admin/overview', 'layout');
  revalidatePath('/admin/operations', 'layout');
  if (settlementId && !opts?.skipSettlementDetail) {
    revalidatePath(`/admin/checkout-settlements/${settlementId}`);
  }
}

function applyCheckoutApproveFieldsFromForm(formData: FormData, settlementId: string) {
  const noticeDeductionInr = Number(formData.get('noticeDeductionInr'));
  const damageInr = Number(formData.get('damageChargeInr') ?? 0);
  const cleaningInr = Number(formData.get('cleaningChargeInr') ?? 0);
  const customInr = Number(formData.get('customChargeInr') ?? 0);
  const customLabel = String(formData.get('customChargeLabel') ?? '').trim();

  if (Number.isFinite(noticeDeductionInr) && noticeDeductionInr >= 0) {
    return updateCheckoutSettlementAdminFields({
      settlementId,
      noticeDeductionPaise: Math.round(noticeDeductionInr * 100),
      damageChargePaise: Math.round(damageInr * 100),
      cleaningChargePaise: Math.round(cleaningInr * 100),
      customChargePaise: Math.round(customInr * 100),
      customChargeLabel: customLabel || null,
    });
  }
  return Promise.resolve({ ok: true as const });
}

async function checkoutCompleteSuccessIfCommitted(
  settlementId: string,
): Promise<CheckoutSettlementActionState | null> {
  if (!(await isCheckoutSettlementAdminComplete(settlementId))) {
    return null;
  }
  revalidateCheckoutPaths(settlementId);
  return { status: 'ok', message: CHECKOUT_COMPLETE_SUCCESS_MESSAGE };
}

/** Client recovery: DB is source of truth after network/action errors. */
export async function probeCheckoutSettlementCompleteAction(
  settlementId: string,
): Promise<{ complete: boolean }> {
  await requireAdminPermission('deposits:write');
  const complete = await isCheckoutSettlementAdminComplete(settlementId);
  return { complete };
}

export async function approveCheckoutSettlementAction(
  _prev: CheckoutSettlementActionState,
  formData: FormData,
): Promise<CheckoutSettlementActionState> {
  try {
    const admin = await requireAdminPermission('deposits:write');
    const settlementId = String(formData.get('settlementId') ?? '');
    await applyCheckoutApproveFieldsFromForm(formData, settlementId);

    const result = await approveCheckoutSettlement({
      settlementId,
      adminId: admin.adminId,
    });
    if (!result.ok) {
      return { status: 'error', message: result.error };
    }
    revalidateCheckoutPaths(settlementId);
    const msg =
      result.finalRefundPaise <= 0
        ? 'Checkout completed. Deposit fully applied to deductions — no refund due.'
        : `Settlement approved. Final refund: ₹${(result.finalRefundPaise / 100).toFixed(2)}`;
    return { status: 'ok', message: msg };
  } catch (err) {
    console.error('[checkout] approveCheckoutSettlementAction failed', err);
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not approve checkout.',
    };
  }
}

export async function rejectCheckoutSettlementSubmissionAction(
  _prev: CheckoutSettlementActionState,
  formData: FormData,
): Promise<CheckoutSettlementActionState> {
  const admin = await requireAdminPermission('deposits:write');
  const settlementId = String(formData.get('settlementId') ?? '');
  const reason = String(formData.get('rejectionReason') ?? '').trim();

  const result = await rejectResidentCheckoutSubmission({
    settlementId,
    adminId: admin.adminId,
    reason,
  });
  if (!result.ok) {
    return { status: 'error', message: result.error };
  }
  revalidateCheckoutPaths(settlementId);
  return {
    status: 'ok',
    message: 'Refund request returned to resident. They can fix details and resubmit.',
  };
}

export async function markCheckoutRefundPaidAction(
  _prev: CheckoutSettlementActionState,
  formData: FormData,
): Promise<CheckoutSettlementActionState> {
  const settlementId = String(formData.get('settlementId') ?? '');
  try {
    const admin = await requireAdminPermission('deposits:write');
    const refundReference = String(formData.get('refundReference') ?? '').trim();
    const refundMethod = String(formData.get('refundMethod') ?? '').trim();
    const refundNotes = String(formData.get('refundNotes') ?? '').trim();

    if (!refundReference) {
      return { status: 'error', message: 'Enter UPI reference or transaction number.' };
    }

    const markInput = {
      settlementId,
      adminId: admin.adminId,
      refundReference,
      refundMethod: refundMethod || undefined,
      refundNotes: refundNotes || undefined,
    };
    let result = await markCheckoutRefundPaid(markInput);
    if (!result.ok) {
      result = await markCheckoutRefundPaid(markInput);
    }
    if (!result.ok) {
      const recovered = await checkoutCompleteSuccessIfCommitted(settlementId);
      if (recovered) {
        return recovered;
      }
      return { status: 'error', message: result.error };
    }
    revalidateCheckoutPaths(settlementId);
    return { status: 'ok', message: CHECKOUT_COMPLETE_SUCCESS_MESSAGE };
  } catch (err) {
    console.error('[checkout] markCheckoutRefundPaidAction failed', err);
    const recovered = await checkoutCompleteSuccessIfCommitted(settlementId);
    if (recovered) {
      return recovered;
    }
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not record refund payout.',
    };
  }
}

/** Approve settlement and record refund payout in one server round-trip (Pay & complete step). */
export async function completeCheckoutSettlementAction(
  _prev: CheckoutSettlementActionState,
  formData: FormData,
): Promise<CheckoutSettlementActionState> {
  const settlementId = String(formData.get('settlementId') ?? '');
  try {
    // #region agent log
    agentSessionLog({
      hypothesisId: 'H-complete',
      location: 'completeCheckoutSettlementAction:entry',
      message: 'complete checkout start',
      data: { settlementId },
    });
    // #endregion
    const admin = await requireAdminPermission('deposits:write');
    await applyCheckoutApproveFieldsFromForm(formData, settlementId);

    const approveResult = await approveCheckoutSettlement({
      settlementId,
      adminId: admin.adminId,
    });
    if (!approveResult.ok) {
      return { status: 'error', message: approveResult.error };
    }

    if (approveResult.finalRefundPaise <= 0) {
      revalidateCheckoutPaths(settlementId);
      return {
        status: 'ok',
        message: CHECKOUT_COMPLETE_SUCCESS_MESSAGE,
      };
    }

    const refundReference =
      String(formData.get('refundReference') ?? '').trim() || 'confirmed-without-reference';
    const refundMethod = String(formData.get('refundMethod') ?? '').trim() || undefined;
    const refundNotes = String(formData.get('refundNotes') ?? '').trim() || undefined;
    const markInput = {
      settlementId,
      adminId: admin.adminId,
      refundReference,
      refundMethod,
      refundNotes,
    };
    let markResult = await markCheckoutRefundPaid(markInput);
    if (!markResult.ok) {
      markResult = await markCheckoutRefundPaid(markInput);
    }
    if (!markResult.ok) {
      const recovered = await checkoutCompleteSuccessIfCommitted(settlementId);
      if (recovered) {
        return recovered;
      }
      return { status: 'error', message: markResult.error };
    }

    revalidateCheckoutPaths(settlementId);
    // #region agent log
    agentSessionLog({
      hypothesisId: 'H-complete',
      location: 'completeCheckoutSettlementAction:ok',
      message: 'complete checkout success',
      data: { settlementId, finalRefundPaise: approveResult.finalRefundPaise },
    });
    // #endregion
    return { status: 'ok', message: CHECKOUT_COMPLETE_SUCCESS_MESSAGE };
  } catch (err) {
    console.error('[checkout] completeCheckoutSettlementAction failed', err);
    // #region agent log
    agentSessionLog({
      hypothesisId: 'H-complete',
      location: 'completeCheckoutSettlementAction:throw',
      message: 'complete checkout threw',
      data: {
        settlementId,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    // #endregion
    const recovered = await checkoutCompleteSuccessIfCommitted(settlementId);
    if (recovered) {
      return recovered;
    }
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not complete checkout.',
    };
  }
}

/** Finalize checkout and queue refund payout (single settlement decision — no mark-paid). */
export async function deferCheckoutRefundPayoutAction(
  _prev: CheckoutSettlementActionState,
  formData: FormData,
): Promise<CheckoutSettlementActionState> {
  const settlementId = String(formData.get('settlementId') ?? '');
  try {
    const admin = await requireAdminPermission('deposits:write');
    await applyCheckoutApproveFieldsFromForm(formData, settlementId);

    const result = await approveCheckoutSettlement({
      settlementId,
      adminId: admin.adminId,
    });
    if (!result.ok) {
      return { status: 'error', message: result.error };
    }

    if (result.finalRefundPaise <= 0) {
      revalidateCheckoutPaths(settlementId);
      return {
        status: 'ok',
        message: CHECKOUT_COMPLETE_SUCCESS_MESSAGE,
      };
    }

    const { syncActionItemsForCron } = await import('@/src/services/actionItems');
    await syncActionItemsForCron().catch(() => undefined);

    revalidateCheckoutPaths(settlementId);
    return { status: 'ok', message: CHECKOUT_DEFER_SUCCESS_MESSAGE };
  } catch (err) {
    console.error('[checkout] deferCheckoutRefundPayoutAction failed', err);
    return {
      status: 'error',
      message:
        err instanceof Error ? err.message : 'Could not finalize checkout.',
    };
  }
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

  const result = await updateCheckoutSettlementAdminFields({
    settlementId,
    noticeDeductionPaise: Math.round(noticeDeductionInr * 100),
    damageChargePaise: Math.round(damageInr * 100),
    cleaningChargePaise: Math.round(cleaningInr * 100),
    customChargePaise: Math.round(customInr * 100),
    customChargeLabel: customLabel || null,
  });
  if (!result.ok) {
    return { status: 'error', message: result.error };
  }
  revalidateCheckoutPaths(settlementId);
  return { status: 'ok', message: 'Settlement amounts updated.' };
}

export async function updateCheckoutElectricityAction(
  _prev: CheckoutSettlementActionState,
  formData: FormData,
): Promise<CheckoutSettlementActionState> {
  const autosave = formData.get('autosave') === '1';
  let settlementId = '';
  try {
    const admin = await requireAdminPermission('deposits:write');
    settlementId = String(formData.get('settlementId') ?? '');
    const calculationMethod = String(
      formData.get('calculationMethod') ?? 'meter_reading',
    ) as 'meter_reading' | 'average_billing' | 'manual_amount';
    const meterPhotoMissing = formData.get('meterPhotoMissing') === 'on';
    const deductFromDeposit = formData.get('deductFromDeposit') === 'on';
    const sharingOverride = formData.get('sharingOverride') === 'on';
    const sharingCountRaw = formData.get('sharingCountOverride');
    const sharingCountOverride =
      sharingCountRaw != null && String(sharingCountRaw).trim() !== ''
        ? Number(sharingCountRaw)
        : null;

    const previousReading =
      formData.get('previousReading') != null &&
      String(formData.get('previousReading')).trim() !== ''
        ? Number(formData.get('previousReading'))
        : undefined;
    const currentReading =
      formData.get('currentReading') != null &&
      String(formData.get('currentReading')).trim() !== ''
        ? Number(formData.get('currentReading'))
        : undefined;
    const ratePerUnitInr =
      formData.get('ratePerUnitInr') != null &&
      String(formData.get('ratePerUnitInr')).trim() !== ''
        ? Number(formData.get('ratePerUnitInr'))
        : undefined;
    const averageBillInr =
      formData.get('averageBillInr') != null &&
      String(formData.get('averageBillInr')).trim() !== ''
        ? Number(formData.get('averageBillInr'))
        : undefined;
    const manualChargeInr =
      formData.get('manualChargeInr') != null &&
      String(formData.get('manualChargeInr')).trim() !== ''
        ? Number(formData.get('manualChargeInr'))
        : undefined;

    const result = await updateCheckoutElectricitySettlement({
      settlementId,
      adminId: admin.adminId,
      calculationMethod,
      previousReading,
      currentReading,
      ratePerUnitInr,
      averageBillInr,
      manualChargeInr,
      deductFromDeposit,
      meterPhotoMissing,
      sharingOverride,
      sharingCountOverride,
    });
    if (!result.ok) {
      return { status: 'error', message: result.error };
    }

    // #region agent log
    agentSessionLog({
      hypothesisId: 'H1',
      location: 'updateCheckoutElectricityAction:beforeRevalidate',
      message: 'electricity save ok, revalidating',
      data: { settlementId, autosave },
    });
    // #endregion
    revalidateCheckoutPaths(settlementId, { skipSettlementDetail: autosave });
    const unitsLabel =
      result.calc.unitsConsumed != null ? `${result.calc.unitsConsumed} units, ` : '';
    return {
      status: 'ok',
      message: autosave
        ? 'Electricity saved.'
        : `Electricity saved — ${unitsLabel}resident share ₹${(result.calc.sharePaise / 100).toFixed(2)} (${result.calc.roomOccupants} sharing).`,
    };
  } catch (err) {
    console.error('[checkout] updateCheckoutElectricityAction failed', {
      settlementId,
      autosave,
      error: err instanceof Error ? err.stack : err,
    });
    return {
      status: 'error',
      message:
        err instanceof Error && err.message
          ? err.message
          : 'Could not save electricity. Try again or contact support.',
    };
  }
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
