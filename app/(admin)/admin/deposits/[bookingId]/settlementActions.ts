'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { assertAdminBookingAccess } from '@/src/lib/auth/pgAccess';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { settleDepositWithDeductions } from '@/src/services/depositSettlement';
import { syncActionItems } from '@/src/services/actionItems';

export type DepositSettlementState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

function parseInrField(formData: FormData, key: string): number {
  const raw = formData.get(key)?.toString() ?? '0';
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export async function processDepositSettlementAction(
  _prev: DepositSettlementState,
  formData: FormData,
): Promise<DepositSettlementState> {
  try {
    const session = await requireAdminPermission('deposits:write');
    const bookingId = String(formData.get('bookingId') ?? '');
    const customerId = String(formData.get('customerId') ?? '');
    const decision = String(formData.get('decision') ?? '');

    if (!bookingId || !customerId) {
      return { status: 'error', message: 'Missing booking or resident.' };
    }

    await assertAdminBookingAccess(session, bookingId);

    if (decision === 'reject') {
      await db
        .update(bookings)
        .set({ adminDepositRefundStatus: 'blocked', updatedAt: new Date() })
        .where(eq(bookings.id, bookingId));
      await syncActionItems(session).catch(() => undefined);
      revalidatePath(`/admin/deposits/${bookingId}`);
      revalidateFinancialViews();
      return { status: 'ok', message: 'Refund rejected.' };
    }

    if (decision !== 'approve') {
      return { status: 'error', message: 'Select approve or reject.' };
    }

    const legacyGuard = await import('@/src/lib/deposits/depositRefundGuard').then((m) =>
      m.assertLegacyDepositRefundAllowed(bookingId),
    );
    if (!legacyGuard.ok) {
      return { status: 'error', message: legacyGuard.error };
    }

    const refundCompletion = {
      electricityUnitCostPaise: parseInrField(formData, 'electricityUnitCostInr'),
      electricityUnits: parseInt(String(formData.get('electricityUnits') ?? '0'), 10) || 0,
      damageChargePaise: parseInrField(formData, 'damageInr'),
      penaltyChargePaise: parseInrField(formData, 'penaltyInr'),
      customChargePaise: parseInrField(formData, 'otherInr'),
      customChargeLabel: String(formData.get('otherLabel') ?? '').trim() || undefined,
      refundMethod: String(formData.get('refundMethod') ?? '').trim() || undefined,
    };

    const settlement = await settleDepositWithDeductions({
      bookingId,
      customerId,
      idempotencyKey: `admin_panel:${bookingId}`,
      source: 'admin_panel',
      sourceId: bookingId,
      adminId: session.adminId,
      refundCompletion,
      refundAudit: {
        refundMethod: refundCompletion.refundMethod ?? null,
        refundReference: String(formData.get('refundReference') ?? '').trim() || null,
        refundProofUrl: String(formData.get('refundProofUrl') ?? '').trim() || null,
      },
      markBookingRefunded: true,
    });

    if (!settlement.ok) {
      return { status: 'error', message: settlement.error };
    }

    await syncActionItems(session).catch(() => undefined);
    revalidatePath(`/admin/deposits/${bookingId}`);
    revalidatePath('/admin/deposits');
    revalidateFinancialViews();

    return {
      status: 'ok',
      message: `Refund approved — final payout ₹${(settlement.refundPaise / 100).toFixed(2)}.`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Settlement failed.',
    };
  }
}
