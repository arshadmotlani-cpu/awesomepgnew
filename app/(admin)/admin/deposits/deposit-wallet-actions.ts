'use server';

import { revalidatePath } from 'next/cache';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { db } from '@/src/db/client';
import { auditLog, bookings } from '@/src/db/schema';
import { logger } from '@/src/lib/logger';
import {
  cancelDepositInvoice,
  previewCancelDepositInvoice,
  previewRebuildDepositWallet,
  rebuildDepositWallet,
  updateDepositSummaryAdmin,
  getUnifiedDepositView,
  type DepositWalletPreview,
} from '@/src/services/depositOperations';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { logDepositDebug } from '@/src/lib/depositDebug';
import { logDepositTrace } from '@/src/lib/depositPageDebug';
import {
  logDepositSaveAfterRevalidate,
  logDepositSaveFailed,
  logDepositSaveStart,
  logDepositServerActionCaught,
  type DepositInvestigationContext,
} from '@/src/lib/depositInvestigation';

export type DepositWalletActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

async function resolveBookingContext(bookingId: string): Promise<{
  customerId: string;
  bookingCode: string | null;
} | null> {
  const [row] = await db
    .select({
      customerId: bookings.customerId,
      bookingCode: bookings.bookingCode,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  return { customerId: row.customerId, bookingCode: row.bookingCode };
}

async function logDepositWalletFailure(input: {
  action: string;
  bookingId: string;
  customerId?: string | null;
  bookingCode?: string | null;
  adminId?: string;
  error: unknown;
}): Promise<void> {
  const err = input.error;
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  console.error(`[deposit-wallet] ${input.action} failed`, {
    bookingId: input.bookingId,
    bookingCode: input.bookingCode,
    customerId: input.customerId,
    adminId: input.adminId,
    message,
    stack,
  });

  logger.error(`deposit_wallet_${input.action}_failed`, {
    action: input.action,
    bookingId: input.bookingId,
    bookingCode: input.bookingCode,
    customerId: input.customerId,
    adminId: input.adminId,
    message,
    stack,
    route: '/admin/deposits',
  });

  if (input.adminId) {
    try {
      await db.insert(auditLog).values({
        actorType: 'admin',
        actorId: input.adminId,
        entity: 'booking',
        entityId: input.bookingId,
        action: `deposit_wallet_${input.action}_error`,
        diff: {
          bookingCode: input.bookingCode,
          customerId: input.customerId,
          message,
          stack: stack?.slice(0, 4000),
        },
      });
    } catch (auditErr) {
      console.error('[deposit-wallet] audit log insert failed', auditErr);
    }
  }
}

function parseInrFieldToPaise(raw: string, label: string): number | undefined | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const inr = Number(trimmed);
  if (!Number.isFinite(inr)) {
    return { error: `${label} must be a valid number.` };
  }
  if (inr < 0) {
    return { error: `${label} cannot be negative.` };
  }
  return Math.round(inr * 100);
}

async function verifyDepositReload(bookingId: string, customerId: string) {
  try {
    const [summary, view] = await Promise.all([
      getDepositSummaryForBooking(bookingId),
      getUnifiedDepositView(bookingId),
    ]);
    logDepositTrace('loadDepositDetailData', bookingId, {
      phase: 'post_save_reload_ok',
      customerId,
      collectedPaise: summary?.collectedPaise,
      requiredPaise: view?.requiredPaise,
      refundablePaise: view?.refundablePaise,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logDepositTrace('loadDepositDetailData', bookingId, {
      phase: 'post_save_reload_failed',
      customerId,
      error: message,
      stack,
    });
  }
}

function revalidateDepositViews(bookingId: string, ctx: DepositInvestigationContext) {
  logDepositDebug({
    phase: 'revalidateDepositViews:before',
    actionName: 'revalidateDepositViews',
    bookingId,
  });
  revalidateFinancialViews();
  revalidatePath(`/admin/deposits/${bookingId}`);
  revalidatePath('/admin/deposits');
  logDepositSaveAfterRevalidate(ctx, { paths: [`/admin/deposits/${bookingId}`, '/admin/deposits'] });
  logDepositDebug({
    phase: 'revalidateDepositViews:after',
    actionName: 'revalidateDepositViews',
    bookingId,
  });
}

export async function loadRebuildDepositPreviewAction(
  bookingId: string,
): Promise<DepositWalletPreview | { ok: false; error: string }> {
  try {
    const admin = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(admin, bookingId);
    return await previewRebuildDepositWallet(bookingId);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : 'Preview failed.';
    console.error('[deposit-wallet] rebuild preview failed', { bookingId, message });
    return { ok: false, error: message };
  }
}

export async function loadCancelDepositPreviewAction(
  bookingId: string,
): Promise<DepositWalletPreview | { ok: false; error: string }> {
  try {
    const admin = await requireAdminPermission('deposits:write');
    await assertAdminBookingAccess(admin, bookingId);
    return await previewCancelDepositInvoice(bookingId);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    const message = err instanceof Error ? err.message : 'Preview failed.';
    console.error('[deposit-wallet] cancel preview failed', { bookingId, message });
    return { ok: false, error: message };
  }
}

async function editDepositSummaryCore(
  formData: FormData,
  options: { skipRevalidate?: boolean },
): Promise<DepositWalletActionState> {
  let admin;
  let bookingId = '';
  let bookingCode: string | null = null;
  let customerId: string | null = null;
  const actionName = options.skipRevalidate
    ? 'editDepositSummaryNoRevalidateAction'
    : 'editDepositSummaryAction';
  try {
    admin = await requireAdminPermission('deposits:write');
    bookingId = String(formData.get('bookingId') ?? '');
    await assertAdminBookingAccess(admin, bookingId);
    const ctx = await resolveBookingContext(bookingId);
    if (!ctx) return { status: 'error', message: 'Booking not found.' };
    customerId = ctx.customerId;
    bookingCode = ctx.bookingCode;

    const reason = String(formData.get('reason') ?? '').trim();
    if (!reason) return { status: 'error', message: 'Reason is required.' };

    const requiredRaw = String(formData.get('requiredInr') ?? '');
    const collectedRaw = String(formData.get('collectedInr') ?? '');
    const requiredParsed = parseInrFieldToPaise(requiredRaw, 'Required deposit');
    if (typeof requiredParsed === 'object' && 'error' in requiredParsed) {
      return { status: 'error', message: requiredParsed.error };
    }
    const collectedParsed = parseInrFieldToPaise(collectedRaw, 'Collected deposit');
    if (typeof collectedParsed === 'object' && 'error' in collectedParsed) {
      return { status: 'error', message: collectedParsed.error };
    }
    const requiredPaise = requiredParsed;
    const collectedPaise = collectedParsed;

    if (requiredPaise == null && collectedPaise == null) {
      return { status: 'error', message: 'Enter required and/or collected amount to update.' };
    }

    const invCtx: DepositInvestigationContext = {
      bookingId,
      bookingCode,
      customerId,
      component: actionName,
    };

    logDepositSaveStart(invCtx, {
      requiredPaise: requiredPaise ?? null,
      collectedPaise: collectedPaise ?? null,
      reason,
      skipRevalidate: Boolean(options.skipRevalidate),
    });

    logDepositDebug({
      phase: `${actionName}:before_update`,
      actionName,
      bookingId,
      residentId: customerId,
      requiredDeposit: requiredPaise,
      collectedDeposit: collectedPaise,
    });

    const result = await updateDepositSummaryAdmin({
      bookingId,
      customerId,
      adminId: admin.adminId,
      requiredPaise,
      collectedPaise,
      reason,
    });
    if (!result.ok) return { status: 'error', message: result.error };

    logDepositDebug({
      phase: `${actionName}:after_update`,
      actionName,
      bookingId,
      residentId: customerId,
      requiredDeposit: requiredPaise,
      collectedDeposit: collectedPaise,
    });

    if (!options.skipRevalidate) {
      revalidateDepositViews(bookingId, invCtx);
      await verifyDepositReload(bookingId, customerId);
    }

    logDepositDebug({
      phase: `${actionName}:ok`,
      bookingId,
      residentId: customerId,
      actionName,
      requiredDeposit: requiredPaise,
      collectedDeposit: collectedPaise,
    });

    return {
      status: 'ok',
      message: options.skipRevalidate
        ? 'Deposit saved (no revalidate — page not reloaded).'
        : 'Deposit summary updated everywhere.',
    };
  } catch (err) {
    if (isRedirectError(err)) {
      logDepositServerActionCaught(actionName, bookingId, err, { kind: 'redirect' });
      throw err;
    }
    const invCtx: DepositInvestigationContext = {
      bookingId,
      bookingCode,
      customerId,
      component: actionName,
    };
    logDepositSaveFailed(invCtx, err);
    logDepositDebug({
      phase: `${actionName}:error`,
      actionName,
      bookingId,
      residentId: customerId,
      error: err,
    });
    await logDepositWalletFailure({
      action: options.skipRevalidate ? 'edit_summary_no_revalidate' : 'edit_summary',
      bookingId,
      customerId,
      bookingCode,
      adminId: admin?.adminId,
      error: err,
    });
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Update failed.',
    };
  }
}

export async function editDepositSummaryAction(
  _prev: DepositWalletActionState,
  formData: FormData,
): Promise<DepositWalletActionState> {
  return editDepositSummaryCore(formData, { skipRevalidate: false });
}

/** Diagnostic: same save path but skips revalidatePath to isolate reload crashes. */
export async function editDepositSummaryNoRevalidateAction(
  _prev: DepositWalletActionState,
  formData: FormData,
): Promise<DepositWalletActionState> {
  return editDepositSummaryCore(formData, { skipRevalidate: true });
}

export async function rebuildDepositWalletAction(
  _prev: DepositWalletActionState,
  formData: FormData,
): Promise<DepositWalletActionState> {
  let admin;
  let bookingId = '';
  let bookingCode: string | null = null;
  let customerId: string | null = null;
  try {
    admin = await requireAdminPermission('deposits:write');
    bookingId = String(formData.get('bookingId') ?? '');
    const confirmed = String(formData.get('confirmPreview') ?? '') === 'yes';
    if (!confirmed) {
      return { status: 'error', message: 'Confirm the dry-run preview before rebuilding.' };
    }

    await assertAdminBookingAccess(admin, bookingId);
    const ctx = await resolveBookingContext(bookingId);
    if (!ctx) return { status: 'error', message: 'Booking not found.' };
    customerId = ctx.customerId;
    bookingCode = ctx.bookingCode;

    const result = await rebuildDepositWallet({
      bookingId,
      customerId,
      adminId: admin.adminId,
    });
    if (!result.ok) return { status: 'error', message: result.error };

    revalidateDepositViews(bookingId, {
      bookingId,
      bookingCode,
      customerId,
      component: 'rebuildDepositWalletAction',
    });
    return {
      status: 'ok',
      message: `Wallet rebuilt from ledger — collected ₹${(result.collectedPaise / 100).toLocaleString('en-IN')}, refundable ₹${(result.refundablePaise / 100).toLocaleString('en-IN')}, due ₹${(result.depositDuePaise / 100).toLocaleString('en-IN')}.`,
    };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    await logDepositWalletFailure({
      action: 'rebuild',
      bookingId,
      customerId,
      bookingCode,
      adminId: admin?.adminId,
      error: err,
    });
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Rebuild failed.',
    };
  }
}

export async function cancelDepositInvoiceAction(
  _prev: DepositWalletActionState,
  formData: FormData,
): Promise<DepositWalletActionState> {
  let admin;
  let bookingId = '';
  let bookingCode: string | null = null;
  let customerId: string | null = null;
  try {
    admin = await requireAdminPermission('deposits:write');
    bookingId = String(formData.get('bookingId') ?? '');
    const confirm = String(formData.get('confirmText') ?? '').trim();
    if (confirm !== 'CANCEL') {
      return { status: 'error', message: 'Type CANCEL to confirm.' };
    }
    const confirmed = String(formData.get('confirmPreview') ?? '') === 'yes';
    if (!confirmed) {
      return { status: 'error', message: 'Confirm the dry-run preview before cancelling.' };
    }

    await assertAdminBookingAccess(admin, bookingId);
    const ctx = await resolveBookingContext(bookingId);
    if (!ctx) return { status: 'error', message: 'Booking not found.' };
    customerId = ctx.customerId;
    bookingCode = ctx.bookingCode;

    const result = await cancelDepositInvoice({
      bookingId,
      customerId,
      adminId: admin.adminId,
      reason: 'Admin cancelled deposit invoice',
    });
    if (!result.ok) return { status: 'error', message: result.error };

    revalidateDepositViews(bookingId, {
      bookingId,
      bookingCode,
      customerId,
      component: 'rebuildDepositWalletAction',
    });
    const removed =
      result.removedFromWalletPaise > 0
        ? ` Removed ₹${(result.removedFromWalletPaise / 100).toLocaleString('en-IN')} from wallet.`
        : '';
    return {
      status: 'ok',
      message: `Deposit invoice cancelled — obligation zeroed.${removed}`,
    };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    await logDepositWalletFailure({
      action: 'cancel',
      bookingId,
      customerId,
      bookingCode,
      adminId: admin?.adminId,
      error: err,
    });
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Cancel failed.',
    };
  }
}
