/**
 * Collections bulk ops — permission-gated Phase 3 actions.
 */

import {
  adminHasPermission,
  type AdminPermission,
  type AdminRole,
} from '@/src/lib/auth/roles';

export type BulkOpsActor = {
  adminId: string;
  role: AdminRole;
};

export type BulkRemindInput = {
  rentInvoiceIds: string[];
  actor: BulkOpsActor;
};

export type BulkWaiveInput = {
  rentInvoiceIds: string[];
  amountPaisePerInvoice?: number | null;
  reason: string;
  actor: BulkOpsActor;
};

export type BulkOpsResult = {
  ok: boolean;
  reason: string;
  processed: number;
  skipped: number;
  details?: Array<{ rentInvoiceId: string; status: string; error?: string }>;
};

function requirePerm(
  actor: BulkOpsActor,
  permission: AdminPermission,
): BulkOpsResult | null {
  if (!adminHasPermission(actor.role, permission)) {
    return {
      ok: false,
      reason: `Missing permission ${permission}`,
      processed: 0,
      skipped: 0,
    };
  }
  return null;
}

/**
 * Bulk remind — creates wa.me delivery log rows for matching due policies
 * on the selected open invoices (honest sent_link status).
 */
export async function bulkRemindResidents(
  input: BulkRemindInput,
): Promise<BulkOpsResult> {
  const denied = requirePerm(input.actor, 'collections:remind');
  if (denied) return denied;

  const ids = [...new Set(input.rentInvoiceIds.filter(Boolean))];
  if (ids.length === 0) {
    return { ok: false, reason: 'No invoice ids provided', processed: 0, skipped: 0 };
  }

  const {
    listDueReminders,
    createReminderDelivery,
  } = await import('@/src/services/collectionReminders');
  const candidates = await listDueReminders();
  const selected = candidates.filter((c) => ids.includes(c.rentInvoiceId));

  if (selected.length === 0) {
    return {
      ok: true,
      reason: 'No due reminder policies matched the selected invoices for today',
      processed: 0,
      skipped: ids.length,
    };
  }

  let processed = 0;
  let skipped = 0;
  const details: BulkOpsResult['details'] = [];

  for (const c of selected) {
    const result = await createReminderDelivery(c);
    details.push({
      rentInvoiceId: c.rentInvoiceId,
      status: result.status,
      error: result.error ?? undefined,
    });
    if (result.status === 'sent_link') processed += 1;
    else skipped += 1;
  }

  return {
    ok: true,
    reason: `Logged ${processed} wa.me reminder link(s)`,
    processed,
    skipped,
    details,
  };
}

/**
 * Bulk waive — writes late_fee_waivers for each invoice (same amount or skip).
 */
export async function bulkWaiveLateFees(
  input: BulkWaiveInput,
): Promise<BulkOpsResult> {
  const denied = requirePerm(input.actor, 'collections:waive');
  if (denied) return denied;

  if (!input.reason.trim()) {
    return { ok: false, reason: 'Waiver reason required', processed: 0, skipped: 0 };
  }

  const ids = [...new Set(input.rentInvoiceIds.filter(Boolean))];
  if (ids.length === 0) {
    return { ok: false, reason: 'No invoice ids provided', processed: 0, skipped: 0 };
  }

  const amount = input.amountPaisePerInvoice;
  if (amount == null || amount <= 0) {
    return {
      ok: false,
      reason: 'amountPaisePerInvoice is required for bulk waive',
      processed: 0,
      skipped: ids.length,
    };
  }

  const { recordLateFeeWaiver } = await import('@/src/services/lateFeePolicy');
  let processed = 0;
  let skipped = 0;
  const details: BulkOpsResult['details'] = [];

  for (const rentInvoiceId of ids) {
    try {
      await recordLateFeeWaiver({
        rentInvoiceId,
        amountPaise: amount,
        reason: input.reason,
        actorAdminId: input.actor.adminId,
      });
      processed += 1;
      details.push({ rentInvoiceId, status: 'waived' });
    } catch (err) {
      skipped += 1;
      details.push({
        rentInvoiceId,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: processed > 0,
    reason: `Waived late fees on ${processed} invoice(s)`,
    processed,
    skipped,
    details,
  };
}
