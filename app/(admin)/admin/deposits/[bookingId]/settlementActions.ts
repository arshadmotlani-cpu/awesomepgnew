'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings } from '@/src/db/schema';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { computeRefundDeductions } from '@/src/lib/refundDeductions';
import {
  getDepositSummaryForBooking,
  recordDepositDeducted,
  recordDepositRefunded,
} from '@/src/services/deposits';
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

    const summary = await getDepositSummaryForBooking(bookingId);
    if (!summary || summary.refundableBalancePaise <= 0) {
      return { status: 'error', message: 'No refundable deposit balance.' };
    }

    const calc = computeRefundDeductions(summary.refundableBalancePaise, {
      electricityUnitCostPaise: parseInrField(formData, 'electricityUnitCostInr'),
      electricityUnits: parseInt(String(formData.get('electricityUnits') ?? '0'), 10) || 0,
      damageChargePaise: parseInrField(formData, 'damageInr'),
      penaltyChargePaise: parseInrField(formData, 'penaltyInr'),
      customChargePaise: parseInrField(formData, 'otherInr'),
      customChargeLabel: String(formData.get('otherLabel') ?? '').trim() || undefined,
    });

    if (calc.electricityDeductionPaise && calc.electricityDeductionPaise > 0) {
      const units = parseInt(String(formData.get('electricityUnits') ?? '0'), 10) || 0;
      const rate = parseInrField(formData, 'electricityUnitCostInr');
      await recordDepositDeducted({
        bookingId,
        customerId,
        amountPaise: calc.electricityDeductionPaise,
        reason: `Electricity: ${units} units @ ₹${(rate / 100).toFixed(2)}/unit`,
        createdByAdminId: session.adminId,
      });
    }

    const otherDeductions =
      (calc.damageChargePaise ?? 0) +
      (calc.cleaningChargePaise ?? 0) +
      (calc.penaltyChargePaise ?? 0) +
      (calc.customChargePaise ?? 0);

    if (otherDeductions > 0) {
      const parts: string[] = [];
      if (calc.damageChargePaise) parts.push(`Damage ₹${calc.damageChargePaise / 100}`);
      if (calc.penaltyChargePaise) parts.push(`Penalty ₹${calc.penaltyChargePaise / 100}`);
      if (calc.customChargePaise) {
        parts.push(`${calc.customChargeLabel ?? 'Other'} ₹${calc.customChargePaise / 100}`);
      }
      await recordDepositDeducted({
        bookingId,
        customerId,
        amountPaise: otherDeductions,
        reason: `Settlement deductions: ${parts.join(', ')}`,
        createdByAdminId: session.adminId,
      });
    }

    if (calc.finalRefundPaise > 0) {
      await recordDepositRefunded({
        bookingId,
        customerId,
        amountPaise: calc.finalRefundPaise,
        reason: 'Deposit settlement refund approved',
        createdByAdminId: session.adminId,
      });
    }

    await db
      .update(bookings)
      .set({ adminDepositRefundStatus: 'refunded', updatedAt: new Date() })
      .where(eq(bookings.id, bookingId));

    await syncActionItems(session).catch(() => undefined);
    revalidatePath(`/admin/deposits/${bookingId}`);
    revalidatePath('/admin/deposits');
    revalidateFinancialViews();

    return {
      status: 'ok',
      message: `Refund approved — final payout ₹${(calc.finalRefundPaise / 100).toFixed(2)}.`,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Settlement failed.',
    };
  }
}
