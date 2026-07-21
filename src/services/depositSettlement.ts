/**
 * Canonical deposit refund settlement — single entry point for all refund paths.
 * Uses row locks, idempotency keys, balance validation, and audit records.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bookings,
  depositLedger,
  depositSettlements,
  type RefundDeductionsSnapshot,
} from '@/src/db/schema';
import { computeRefundDeductions, type RefundCompletionInput } from '@/src/lib/refundDeductions';

export type DepositSettlementSource =
  | 'vacating'
  | 'resident_request'
  | 'admin_panel'
  | 'manual'
  | 'checkout';

export type DepositRefundAudit = {
  refundMethod?: string | null;
  refundReference?: string | null;
  refundProofUrl?: string | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SettleDepositRefundInput = {
  bookingId: string;
  customerId: string;
  idempotencyKey: string;
  source: DepositSettlementSource;
  sourceId?: string | null;
  adminId?: string | null;
  reason: string;
  refundPaise: number;
  deductionsSnapshot?: RefundDeductionsSnapshot | null;
  refundAudit?: DepositRefundAudit;
  relatedVacatingId?: string | null;
  markBookingRefunded?: boolean;
};

export type SettleDepositRefundResult =
  | {
      ok: true;
      settlementId: string;
      ledgerEntryId: string;
      refundPaise: number;
      idempotentReplay: boolean;
    }
  | { ok: false; error: string };

async function sumRefundableBalanceInTx(tx: Tx, bookingId: string): Promise<number> {
  const [row] = await tx
    .select({
      balance: sql<number>`coalesce(sum(${depositLedger.amountPaise}), 0)::bigint`,
    })
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, bookingId));
  return Number(row?.balance ?? 0);
}

export async function applyDepositDeductionsInTx(
  tx: Tx,
  input: {
    bookingId: string;
    customerId: string;
    adminId?: string | null;
    relatedVacatingId?: string | null;
    deductions: Array<{ amountPaise: number; reason: string; deductionCategory?: string | null }>;
  },
): Promise<void> {
  for (const d of input.deductions) {
    if (d.amountPaise <= 0) continue;
    const balance = await sumRefundableBalanceInTx(tx, input.bookingId);
    if (d.amountPaise > balance) {
      throw new Error('Deduction exceeds refundable deposit balance.');
    }
    await tx.insert(depositLedger).values({
      bookingId: input.bookingId,
      customerId: input.customerId,
      entryKind: 'deducted',
      amountPaise: -d.amountPaise,
      reason: d.reason,
      deductionCategory: d.deductionCategory ?? null,
      relatedVacatingId: input.relatedVacatingId ?? null,
      createdByAdminId: input.adminId ?? null,
    });
  }
}

/** Canonical single deduction — transaction, row lock, balance validation. */
export async function applyDepositDeduction(input: {
  bookingId: string;
  customerId: string;
  amountPaise: number;
  reason: string;
  deductionCategory?: string | null;
  adminId?: string | null;
  relatedVacatingId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.amountPaise <= 0) {
    return { ok: false, error: 'Deduction amount must be > 0.' };
  }
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM bookings WHERE id = ${input.bookingId} FOR UPDATE`,
      );
      await applyDepositDeductionsInTx(tx, {
        bookingId: input.bookingId,
        customerId: input.customerId,
        adminId: input.adminId,
        relatedVacatingId: input.relatedVacatingId,
        deductions: [
          {
            amountPaise: input.amountPaise,
            reason: input.reason,
            deductionCategory: input.deductionCategory ?? null,
          },
        ],
      });
      await tx.insert(auditLog).values({
        actorType: input.adminId ? 'admin' : 'system',
        actorId: input.adminId ?? null,
        entity: 'deposit_ledger',
        entityId: input.bookingId,
        action: 'deposit_deducted',
        diff: {
          bookingId: input.bookingId,
          amountPaise: input.amountPaise,
          reason: input.reason,
        },
      });
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Deposit deduction failed.',
    };
  }
}

export async function settleDepositRefund(
  input: SettleDepositRefundInput,
): Promise<SettleDepositRefundResult> {
  if (input.refundPaise < 0) {
    return { ok: false, error: 'Refund amount cannot be negative.' };
  }

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(depositSettlements)
        .where(eq(depositSettlements.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) {
        return {
          ok: true,
          settlementId: existing.id,
          ledgerEntryId: existing.ledgerEntryId ?? '',
          refundPaise: existing.finalRefundPaise,
          idempotentReplay: true,
        };
      }

      await tx.execute(
        sql`SELECT id FROM bookings WHERE id = ${input.bookingId} FOR UPDATE`,
      );

      const [booking] = await tx
        .select({
          customerId: bookings.customerId,
          adminDepositRefundStatus: bookings.adminDepositRefundStatus,
        })
        .from(bookings)
        .where(eq(bookings.id, input.bookingId))
        .limit(1);
      if (!booking) return { ok: false, error: 'Booking not found.' };
      if (booking.customerId !== input.customerId) {
        return { ok: false, error: 'Customer does not match booking.' };
      }

      if (
        input.markBookingRefunded &&
        booking.adminDepositRefundStatus === 'refunded' &&
        input.source !== 'manual'
      ) {
        return { ok: false, error: 'Deposit already marked refunded for this booking.' };
      }

      const refundableBalance = await sumRefundableBalanceInTx(tx, input.bookingId);
      if (input.refundPaise > 0 && input.refundPaise > refundableBalance) {
        return {
          ok: false,
          error: `Refund exceeds refundable balance (₹${(refundableBalance / 100).toFixed(2)} available).`,
        };
      }

      let ledgerEntryId: string | null = null;
      if (input.refundPaise > 0) {
        const [ledgerRow] = await tx
          .insert(depositLedger)
          .values({
            bookingId: input.bookingId,
            customerId: input.customerId,
            entryKind: 'refunded',
            amountPaise: -input.refundPaise,
            reason: input.reason,
            relatedVacatingId: input.relatedVacatingId ?? null,
            createdByAdminId: input.adminId ?? null,
          })
          .returning({ id: depositLedger.id });
        ledgerEntryId = ledgerRow.id;

        await tx.insert(auditLog).values({
          actorType: input.adminId ? 'admin' : 'system',
          actorId: input.adminId ?? null,
          entity: 'deposit_ledger',
          entityId: ledgerRow.id,
          action: 'deposit_refunded',
          diff: {
            bookingId: input.bookingId,
            amountPaise: input.refundPaise,
            source: input.source,
            idempotencyKey: input.idempotencyKey,
          },
        });
      }

      const refundedAt = new Date();
      const [settlement] = await tx
        .insert(depositSettlements)
        .values({
          bookingId: input.bookingId,
          customerId: input.customerId,
          idempotencyKey: input.idempotencyKey,
          source: input.source,
          sourceId: input.sourceId ?? null,
          finalRefundPaise: input.refundPaise,
          deductionsSnapshot: input.deductionsSnapshot ?? null,
          refundMethod: input.refundAudit?.refundMethod ?? null,
          refundReference: input.refundAudit?.refundReference ?? null,
          refundProofUrl: input.refundAudit?.refundProofUrl ?? null,
          refundedByAdminId: input.adminId ?? null,
          refundedAt,
          ledgerEntryId,
        })
        .returning({ id: depositSettlements.id });

      if (input.markBookingRefunded) {
        await tx
          .update(bookings)
          .set({ adminDepositRefundStatus: 'refunded', updatedAt: new Date() })
          .where(eq(bookings.id, input.bookingId));
      }

      return {
        ok: true,
        settlementId: settlement.id,
        ledgerEntryId: ledgerEntryId ?? '',
        refundPaise: input.refundPaise,
        idempotentReplay: false,
      };
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Deposit settlement failed.',
    };
  }
}

export async function settleDepositWithDeductions(input: {
  bookingId: string;
  customerId: string;
  idempotencyKey: string;
  source: DepositSettlementSource;
  sourceId?: string | null;
  adminId?: string | null;
  relatedVacatingId?: string | null;
  refundCompletion?: RefundCompletionInput;
  refundAudit?: DepositRefundAudit;
  markBookingRefunded?: boolean;
  vacatingRefundReason?: string;
}): Promise<SettleDepositRefundResult> {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(depositSettlements)
        .where(eq(depositSettlements.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) {
        return {
          ok: true,
          settlementId: existing.id,
          ledgerEntryId: existing.ledgerEntryId ?? '',
          refundPaise: existing.finalRefundPaise,
          idempotentReplay: true,
        };
      }

      await tx.execute(
        sql`SELECT id FROM bookings WHERE id = ${input.bookingId} FOR UPDATE`,
      );

      const balance = await sumRefundableBalanceInTx(tx, input.bookingId);
      if (balance <= 0) {
        return { ok: false, error: 'No refundable deposit balance.' };
      }

      const calc = computeRefundDeductions(balance, input.refundCompletion ?? {});
      const deductions: Array<{ amountPaise: number; reason: string }> = [];

      if (calc.electricityDeductionPaise && calc.electricityDeductionPaise > 0) {
        deductions.push({
          amountPaise: calc.electricityDeductionPaise,
          reason: `Electricity: ${input.refundCompletion?.electricityUnits ?? 0} units`,
        });
      }
      const other =
        (calc.damageChargePaise ?? 0) +
        (calc.cleaningChargePaise ?? 0) +
        (calc.penaltyChargePaise ?? 0) +
        (calc.customChargePaise ?? 0);
      if (other > 0) {
        deductions.push({
          amountPaise: other,
          reason: 'Refund deductions',
        });
      }

      await applyDepositDeductionsInTx(tx, {
        bookingId: input.bookingId,
        customerId: input.customerId,
        adminId: input.adminId,
        relatedVacatingId: input.relatedVacatingId,
        deductions,
      });

      const refundableAfter = await sumRefundableBalanceInTx(tx, input.bookingId);
      const refundPaise = Math.min(calc.finalRefundPaise, refundableAfter);

      let ledgerEntryId: string | null = null;
      if (refundPaise > 0) {
        const [ledgerRow] = await tx
          .insert(depositLedger)
          .values({
            bookingId: input.bookingId,
            customerId: input.customerId,
            entryKind: 'refunded',
            amountPaise: -refundPaise,
            reason: input.vacatingRefundReason ?? 'Deposit refund settlement',
            relatedVacatingId: input.relatedVacatingId ?? null,
            createdByAdminId: input.adminId ?? null,
          })
          .returning({ id: depositLedger.id });
        ledgerEntryId = ledgerRow.id;
      }

      const refundedAt = new Date();
      const [settlement] = await tx
        .insert(depositSettlements)
        .values({
          bookingId: input.bookingId,
          customerId: input.customerId,
          idempotencyKey: input.idempotencyKey,
          source: input.source,
          sourceId: input.sourceId ?? null,
          finalRefundPaise: refundPaise,
          deductionsSnapshot: calc,
          refundMethod:
            input.refundAudit?.refundMethod ?? input.refundCompletion?.refundMethod ?? null,
          refundReference: input.refundAudit?.refundReference ?? null,
          refundProofUrl: input.refundAudit?.refundProofUrl ?? null,
          refundedByAdminId: input.adminId ?? null,
          refundedAt,
          ledgerEntryId,
        })
        .returning({ id: depositSettlements.id });

      if (input.markBookingRefunded) {
        await tx
          .update(bookings)
          .set({ adminDepositRefundStatus: 'refunded', updatedAt: new Date() })
          .where(eq(bookings.id, input.bookingId));
      }

      return {
        ok: true,
        settlementId: settlement.id,
        ledgerEntryId: ledgerEntryId ?? '',
        refundPaise,
        idempotentReplay: false,
      };
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Deposit settlement failed.',
    };
  }
}

export async function settleVacatingDepositRefund(input: {
  requestId: string;
  bookingId: string;
  customerId: string;
  adminId?: string | null;
  deductionPaise: number;
  noticeCompliant: boolean;
}): Promise<
  | (SettleDepositRefundResult & { deductionPaise: number; depositRefundPaise: number })
  | { ok: false; error: string; deductionPaise: number; depositRefundPaise: number }
> {
  const idempotencyKey = `vacating:${input.requestId}`;
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(depositSettlements)
        .where(eq(depositSettlements.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing) {
        return {
          ok: true as const,
          settlementId: existing.id,
          ledgerEntryId: existing.ledgerEntryId ?? '',
          refundPaise: existing.finalRefundPaise,
          idempotentReplay: true,
          deductionPaise: input.deductionPaise,
          depositRefundPaise: existing.finalRefundPaise,
        };
      }

      await tx.execute(
        sql`SELECT id FROM bookings WHERE id = ${input.bookingId} FOR UPDATE`,
      );

      const balanceBefore = await sumRefundableBalanceInTx(tx, input.bookingId);
      if (balanceBefore <= 0 && input.deductionPaise <= 0) {
        return { ok: false as const, error: 'No refundable deposit balance.' };
      }

      if (input.deductionPaise > 0) {
        await applyDepositDeductionsInTx(tx, {
          bookingId: input.bookingId,
          customerId: input.customerId,
          adminId: input.adminId,
          relatedVacatingId: input.requestId,
          deductions: [
            {
              amountPaise: input.deductionPaise,
              reason: `vacating notice ${
                input.noticeCompliant ? 'compliant' : 'short'
              } — missing notice period rent`,
            },
          ],
        });
      }

      const balanceAfter = await sumRefundableBalanceInTx(tx, input.bookingId);
      const refundPaise = Math.max(0, balanceAfter);

      let ledgerEntryId: string | null = null;
      if (refundPaise > 0) {
        const [ledgerRow] = await tx
          .insert(depositLedger)
          .values({
            bookingId: input.bookingId,
            customerId: input.customerId,
            entryKind: 'refunded',
            amountPaise: -refundPaise,
            reason: 'vacating refund',
            relatedVacatingId: input.requestId,
            createdByAdminId: input.adminId ?? null,
          })
          .returning({ id: depositLedger.id });
        ledgerEntryId = ledgerRow.id;
      }

      const [settlement] = await tx
        .insert(depositSettlements)
        .values({
          bookingId: input.bookingId,
          customerId: input.customerId,
          idempotencyKey,
          source: 'vacating',
          sourceId: input.requestId,
          finalRefundPaise: refundPaise,
          refundedByAdminId: input.adminId ?? null,
          refundedAt: new Date(),
          ledgerEntryId,
        })
        .returning({ id: depositSettlements.id });

      return {
        ok: true as const,
        settlementId: settlement.id,
        ledgerEntryId: ledgerEntryId ?? '',
        refundPaise,
        idempotentReplay: false,
        deductionPaise: input.deductionPaise,
        depositRefundPaise: refundPaise,
      };
    });

    if (!result.ok) {
      return { ok: false, error: result.error, deductionPaise: 0, depositRefundPaise: 0 };
    }
    return result;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Vacating settlement failed.',
      deductionPaise: 0,
      depositRefundPaise: 0,
    };
  }
}
