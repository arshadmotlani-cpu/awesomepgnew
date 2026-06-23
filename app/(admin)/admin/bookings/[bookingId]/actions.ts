'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, stayExtensions } from '@/src/db/schema';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess, assertAdminBookingCodeAccess } from '@/src/lib/auth/pgAccess';
import { adminHasPermission } from '@/src/lib/auth/roles';
import {
  cancelBooking,
  recordExtensionPaymentSuccess,
  recordPaymentSuccess,
} from '@/src/services/bookingLifecycle';
import {
  cancelPendingExtension,
  requestExtension,
  type ExtensionConflict,
} from '@/src/services/extension';

export type AdminCancelState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'cancelled';
      tier: 'full' | 'partial' | 'none';
      refundPaise: number;
    };

export type AdminRecordPaymentState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; paymentId: string; amountPaise: number };

const BOOKING_CODE_RE = /^APG-\d{4}-\d+$/;

/**
 * Admin-initiated cancellation. Same lifecycle path as the customer flow
 * but actor=admin in the audit log and the policy can be overridden via
 * the `policyOverride` query param (not exposed in the form yet — admins
 * just get the same tier the customer would have seen).
 */
export async function adminCancelBookingAction(
  _prev: AdminCancelState,
  formData: FormData,
): Promise<AdminCancelState> {
  const bookingCode = String(formData.get('bookingCode') ?? '');
  if (!BOOKING_CODE_RE.test(bookingCode)) {
    return { status: 'error', message: 'Invalid booking code.' };
  }
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 3) {
    return { status: 'error', message: 'Reason must be at least 3 characters.' };
  }
  const admin = await requireAdminPermission('bookings:write');
  try {
    await assertAdminBookingCodeAccess(admin, bookingCode);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }
  const result = await cancelBooking({
    bookingCode,
    reason: `[admin] ${reason}`,
    actor: { kind: 'admin', adminId: admin.adminId },
  });
  if (!result.ok) return { status: 'error', message: result.reason };

  revalidatePath('/admin');
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/payments');
  revalidatePath(`/admin/bookings/${result.bookingId}`);
  revalidatePath(`/booking/${result.bookingCode}`);

  return {
    status: 'cancelled',
    tier: result.refund.tier,
    refundPaise: result.refund.totalRefundPaise,
  };
}

/**
 * Record an offline payment (cash / UPI / bank transfer) against a
 * pending_payment booking. Routes through recordPaymentSuccess() so
 * deposit ledger, prior outstanding, notifications, and conflict checks
 * match the QR approval path.
 */
export async function recordOfflinePaymentAction(
  _prev: AdminRecordPaymentState,
  formData: FormData,
): Promise<AdminRecordPaymentState> {
  const admin = await requireAdminPermission('payments:write');
  const bookingCode = String(formData.get('bookingCode') ?? '');
  if (!BOOKING_CODE_RE.test(bookingCode)) {
    return { status: 'error', message: 'Invalid booking code.' };
  }
  const providerRaw = String(formData.get('provider') ?? '');
  if (!['cash', 'upi_manual', 'bank_transfer'].includes(providerRaw)) {
    return { status: 'error', message: 'Pick a valid offline provider.' };
  }
  const provider = providerRaw as 'cash' | 'upi_manual' | 'bank_transfer';
  const amountRaw = String(formData.get('amountRupees') ?? '');
  const amountRupees = Number.parseFloat(amountRaw);
  if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
    return { status: 'error', message: 'Enter a positive amount in rupees.' };
  }
  const amountPaise = Math.round(amountRupees * 100);
  const reference = String(formData.get('reference') ?? '').trim() || null;
  const amountOverrideReason = String(formData.get('amountOverrideReason') ?? '').trim();

  try {
    await assertAdminBookingCodeAccess(admin, bookingCode);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }

  const [b] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      totalPaise: bookings.totalPaise,
    })
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!b) return { status: 'error', message: `No booking "${bookingCode}".` };
  if (b.status !== 'pending_payment' && b.status !== 'draft' && b.status !== 'confirmed') {
    return {
      status: 'error',
      message: `Cannot record payment for a booking in status "${b.status}".`,
    };
  }

  const willConfirmBooking = b.status !== 'confirmed';
  if (willConfirmBooking && amountPaise !== b.totalPaise) {
    const canOverride = adminHasPermission(admin.role, 'payments:override');
    if (!canOverride || amountOverrideReason.length < 5) {
      return {
        status: 'error',
        message: `Amount must match booking total (₹${(b.totalPaise / 100).toFixed(2)}). Super admins may override with a documented reason.`,
      };
    }
  }

  const providerPaymentId =
    reference && reference.length > 0
      ? `offline_${reference.replace(/\s+/g, '_').slice(0, 120)}`
      : `offline_${randomUUID()}`;

  const result = await recordPaymentSuccess({
    provider,
    providerPaymentId,
    providerOrderId: reference,
    amountPaise,
    bookingCode,
    recordedByAdminId: admin.adminId,
    rawPayload: {
      recordedBy: 'admin',
      reference,
      adminAmountOverrideReason:
        willConfirmBooking && amountPaise !== b.totalPaise ? amountOverrideReason : undefined,
    },
  });

  if (!result.ok) {
    return {
      status: 'error',
      message: result.reason ?? 'Could not record payment for this booking.',
    };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/payments');
  revalidatePath(`/admin/bookings/${b.id}`);
  revalidatePath(`/booking/${bookingCode}`);

  return { status: 'success', paymentId: result.paymentId, amountPaise };
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 5 — admin extension actions
// ───────────────────────────────────────────────────────────────────────────

export type AdminRequestExtensionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | {
      status: 'conflict';
      message: string;
      conflicts: ExtensionConflict[];
    }
  | {
      status: 'created';
      extensionId: string;
      bookingCode: string;
      quotedTotalPaise: number;
    };

/**
 * Admin-initiated extension request — no phone gate (admin is implicitly
 * trusted, full RBAC arrives in Phase 6). On success the operator can
 * either send the customer to the extension pay page OR record an offline
 * extension payment from the booking detail page.
 */
export async function adminRequestExtensionAction(
  _prev: AdminRequestExtensionState,
  formData: FormData,
): Promise<AdminRequestExtensionState> {
  const bookingCode = String(formData.get('bookingCode') ?? '');
  if (!BOOKING_CODE_RE.test(bookingCode)) {
    return { status: 'error', message: 'Invalid booking code.' };
  }
  const newUntilDate = String(formData.get('newUntilDate') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newUntilDate)) {
    return { status: 'error', message: 'Pick a new check-out date.' };
  }
  const durationMode = String(formData.get('durationMode') ?? '');
  if (!['daily', 'weekly', 'monthly'].includes(durationMode)) {
    return { status: 'error', message: 'Select a duration mode.' };
  }

  const admin = await requireAdminPermission('extensions:write');
  const result = await requestExtension({
    bookingCode,
    newUntilDate,
    durationMode: durationMode as 'daily' | 'weekly' | 'monthly',
    requestedBy: 'admin',
    actor: { kind: 'admin', adminId: admin.adminId },
  });
  if (!result.ok) {
    if (result.kind === 'conflict') {
      return {
        status: 'conflict',
        message: result.message,
        conflicts: result.conflicts,
      };
    }
    return { status: 'error', message: result.message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/extensions');
  revalidatePath(`/admin/bookings/${result.bookingId}`);
  revalidatePath(`/booking/${bookingCode}`);

  return {
    status: 'created',
    extensionId: result.extensionId,
    bookingCode: result.bookingCode,
    quotedTotalPaise: result.quote.totalPaise,
  };
}

export type AdminCancelExtensionState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'cancelled' };

export async function adminCancelExtensionAction(
  _prev: AdminCancelExtensionState,
  formData: FormData,
): Promise<AdminCancelExtensionState> {
  const extensionId = String(formData.get('extensionId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(extensionId)) {
    return { status: 'error', message: 'Invalid extension id.' };
  }
  const reason = String(formData.get('reason') ?? '').trim();
  const admin = await requireAdminPermission('extensions:write');
  const r = await cancelPendingExtension({
    extensionId,
    actor: { kind: 'admin', adminId: admin.adminId },
    reason: reason ? `[admin] ${reason}` : '[admin] cancelled from admin panel',
  });
  if (!r.ok) return { status: 'error', message: r.message };

  revalidatePath('/admin');
  revalidatePath('/admin/extensions');
  revalidatePath(`/admin/bookings/${r.bookingId}`);

  return { status: 'cancelled' };
}

export type AdminRecordExtensionPaymentState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; paymentId: string; amountPaise: number };

/**
 * Record an offline payment AGAINST AN EXTENSION (cash / UPI / bank).
 * Reuses recordExtensionPaymentSuccess for the lifecycle flip — same end
 * state as a Razorpay capture, just routed via an admin-supplied
 * provider+reference instead of a webhook.
 */
export async function recordOfflineExtensionPaymentAction(
  _prev: AdminRecordExtensionPaymentState,
  formData: FormData,
): Promise<AdminRecordExtensionPaymentState> {
  const admin = await requireAdminPermission('payments:write');
  const extensionId = String(formData.get('extensionId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(extensionId)) {
    return { status: 'error', message: 'Invalid extension id.' };
  }
  const providerRaw = String(formData.get('provider') ?? '');
  if (!['cash', 'upi_manual', 'bank_transfer'].includes(providerRaw)) {
    return { status: 'error', message: 'Pick a valid offline provider.' };
  }
  const reference = String(formData.get('reference') ?? '').trim() || null;

  // Pull the extension to learn its quoted total + booking link.
  const [ext] = await db
    .select({
      id: stayExtensions.id,
      bookingId: stayExtensions.bookingId,
      quotedTotalPaise: stayExtensions.quotedTotalPaise,
      status: stayExtensions.status,
    })
    .from(stayExtensions)
    .where(eq(stayExtensions.id, extensionId))
    .limit(1);
  if (!ext) return { status: 'error', message: 'Extension not found.' };
  try {
    await assertAdminBookingAccess(admin, ext.bookingId);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }
  if (ext.status !== 'pending') {
    return {
      status: 'error',
      message: `Extension is in status "${ext.status}" — only pending extensions accept payments.`,
    };
  }

  // We synthesise a provider_payment_id from the reference (when provided)
  // OR generate a stable string from the extension id. recordExtensionPaymentSuccess
  // is idempotent on (provider, providerPaymentId), so re-running this form
  // with the same reference is safely a no-op.
  const synthesisedId = reference ?? `offline_ext_${extensionId.slice(0, 12)}`;

  const r = await recordExtensionPaymentSuccess({
    provider: providerRaw as 'cash' | 'upi_manual' | 'bank_transfer',
    providerPaymentId: synthesisedId,
    providerOrderId: null,
    amountPaise: ext.quotedTotalPaise,
    currency: 'INR',
    extensionId,
    rawPayload: { recordedBy: 'admin', reference },
  });
  if (!r.ok) return { status: 'error', message: r.reason };

  revalidatePath('/admin');
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/extensions');
  revalidatePath('/admin/payments');
  revalidatePath(`/admin/bookings/${ext.bookingId}`);

  return {
    status: 'success',
    paymentId: r.paymentId ?? '',
    amountPaise: ext.quotedTotalPaise,
  };
}

export async function updateBookingAdminOpsAction(
  bookingId: string,
  input: {
    adminDuesStatus?: 'unknown' | 'cleared' | 'has_dues';
    adminDepositRefundStatus?:
      | 'unknown'
      | 'pending'
      | 'refunded'
      | 'blocked'
      | 'not_applicable';
    adminOpsNotes?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('bookings:write');
    const { updateBookingAdminOps } = await import('@/src/services/bookingAdminOps');
    await updateBookingAdminOps(session, bookingId, input);
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath('/admin/bookings');
    revalidatePath('/admin/deposits');
    revalidatePath('/account/profile');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateBedStatusAction(
  bedId: string,
  status: 'available' | 'maintenance' | 'blocked',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await requireAdminPermission('pgs:write');
    const { updateBedInventoryStatus } = await import('@/src/services/bookingAdminOps');
    await updateBedInventoryStatus(session, bedId, status);
    revalidatePath('/admin');
    revalidatePath('/admin/pgs');
    revalidatePath('/pgs');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
