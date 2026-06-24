import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { adminUsers, auditLog, bookings, depositLedger, pgPaymentRecords } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import type { AdminSession } from '@/src/lib/auth/session';
import { breakdownBookingCheckoutPayment } from '@/src/lib/billing/bookingCheckoutTotals';
import { resolveBookingDepositCreditAppliedPaise } from '@/src/lib/billing/bookingCheckoutTotals';
import { splitBookingPayment } from '@/src/services/depositCollection';
import { getDepositSummaryForBooking, recordDepositCollected } from '@/src/services/deposits';
import { transferOldDepositAdmin } from '@/src/services/depositCredit';
import { applyDepositDeduction } from '@/src/services/depositSettlement';
import { reviewPaymentRecord } from '@/src/services/qrPayments';

const DEPOSIT_CREDIT_REASON = 'Deposit credit applied from prior stay wallet';

const TARGET_CODE = 'APG-2026-0036';
const SOURCE_CODE = 'APG-2026-0032';
const TRANSFER_PAISE = 33_000;

const EXPECTED = {
  rentPaise: 190_000,
  depositCashPaise: 62_000,
  transferPaise: TRANSFER_PAISE,
  priorOutstandingPaise: 16_500,
  totalPaise: 268_500,
  totalDepositHeldPaise: 95_000,
};

export type RepairApg20260036Result = {
  ok: true;
  alreadyComplete: boolean;
  checks: Record<string, boolean>;
};

async function findAdmin() {
  const fromEnv = process.env.REPAIR_ADMIN_ID?.trim();
  if (fromEnv) {
    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, fromEnv)).limit(1);
    if (row) return row;
  }
  const [row] = await db
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.role, 'super_admin'), eq(adminUsers.isActive, true)))
    .limit(1);
  return row ?? null;
}

function adminSession(admin: typeof adminUsers.$inferSelect): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'repair-apg-2026-0036',
    adminId: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    role: admin.role,
    pgScope: admin.pgScope ?? [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

async function hasTransferComplete(targetBookingId: string, sourceBookingId: string): Promise<boolean> {
  const [audit] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, 'booking'),
        eq(auditLog.entityId, targetBookingId),
        eq(auditLog.action, 'deposit_transfer_from_prior_booking'),
      ),
    )
    .limit(1);
  if (audit) return true;

  const rows = await db
    .select({ reason: depositLedger.reason })
    .from(depositLedger)
    .where(eq(depositLedger.bookingId, sourceBookingId));
  return rows.some(
    (r) =>
      typeof r.reason === 'string' &&
      r.reason.includes('Deposit credit transferred to booking') &&
      r.reason.includes(targetBookingId),
  );
}

async function finalizeSourceLedgerTransfer(
  target: typeof bookings.$inferSelect,
  source: typeof bookings.$inferSelect,
  adminId: string,
): Promise<void> {
  const sourceSummary = await getDepositSummaryForBooking(source.id);
  const refundable = sourceSummary?.refundableBalancePaise ?? 0;
  if (refundable <= 0) return;

  const slice = Math.min(TRANSFER_PAISE, refundable);
  const deducted = await applyDepositDeduction({
    bookingId: source.id,
    customerId: source.customerId,
    amountPaise: slice,
    reason: `Deposit credit transferred to booking ${target.id}`,
  });
  if (!deducted.ok) {
    throw new Error(`Source deposit deduction failed: ${deducted.error}`);
  }

  const targetSummary = await getDepositSummaryForBooking(target.id);
  const missingPaise = EXPECTED.totalDepositHeldPaise - (targetSummary?.collectedPaise ?? 0);
  if (missingPaise > 0) {
    await recordDepositCollected({
      bookingId: target.id,
      customerId: target.customerId,
      amountPaise: missingPaise,
      reason: DEPOSIT_CREDIT_REASON,
    });
  }

  const transferLogged = await hasTransferComplete(target.id, source.id);
  if (!transferLogged) {
    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: adminId,
      entity: 'booking',
      entityId: target.id,
      action: 'deposit_transfer_from_prior_booking',
      diff: {
        reason: `Transfer ₹330 refundable deposit from ${SOURCE_CODE} to ${TARGET_CODE}`,
        sourceBookingId: source.id,
        sourceBookingCode: source.bookingCode,
        targetBookingCode: target.bookingCode,
        creditAppliedPaise: slice,
      },
    });
  }
}

/** Idempotent one-time repair for APG-2026-0036. */
export async function repairApg20260036(): Promise<RepairApg20260036Result> {
  const [target] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.bookingCode, TARGET_CODE))
    .limit(1);
  if (!target) throw new Error(`${TARGET_CODE} not found`);

  const [source] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.bookingCode, SOURCE_CODE))
    .limit(1);
  if (!source) throw new Error(`${SOURCE_CODE} not found`);

  const [prior] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.bookingCode, 'APG-2026-0031'))
    .limit(1);

  const [proof] = await db
    .select()
    .from(pgPaymentRecords)
    .where(eq(pgPaymentRecords.bookingId, target.id))
    .orderBy(sql`${pgPaymentRecords.createdAt} DESC`)
    .limit(1);

  const admin = await findAdmin();
  if (!admin) throw new Error('No super_admin found. Set REPAIR_ADMIN_ID.');

  const transferDone = await hasTransferComplete(target.id, source.id);
  const snapshot = (target.pricingSnapshot ?? {}) as PricingSnapshot;
  const creditApplied = resolveBookingDepositCreditAppliedPaise(snapshot.depositCredit);

  const targetSummary = await getDepositSummaryForBooking(target.id);
  const sourceSummary = await getDepositSummaryForBooking(source.id);

  const fullySettled =
    target.status === 'confirmed' &&
    proof?.status === 'approved' &&
    transferDone &&
    creditApplied >= TRANSFER_PAISE &&
    (target.depositDuePaise ?? 0) === 0 &&
    (targetSummary?.collectedPaise ?? 0) >= EXPECTED.totalDepositHeldPaise &&
    (sourceSummary?.refundableBalancePaise ?? 0) === 0;

  if (fullySettled) {
    return {
      ok: true,
      alreadyComplete: true,
      checks: {
        targetConfirmed: true,
        targetDepositHeld: true,
        targetDepositDue: true,
        sourceRefundableZero: true,
      },
    };
  }

  if (!transferDone || creditApplied < TRANSFER_PAISE) {
    if (snapshot.depositCredit && !snapshot.depositCredit.adminTransferred) {
      const cleaned = { ...snapshot };
      delete cleaned.depositCredit;
      await db
        .update(bookings)
        .set({ pricingSnapshot: cleaned, updatedAt: new Date() })
        .where(eq(bookings.id, target.id));
    }

    const transferResult = await transferOldDepositAdmin({
      targetBookingId: target.id,
      sourceBookingId: source.id,
      creditPaise: TRANSFER_PAISE,
      adminId: admin.id,
      reason: `Transfer ₹330 refundable deposit from ${SOURCE_CODE} to ${TARGET_CODE}`,
    });
    if (!transferResult.ok) {
      throw new Error(`Transfer failed: ${transferResult.error}`);
    }
  } else if ((sourceSummary?.refundableBalancePaise ?? 0) > 0) {
    await finalizeSourceLedgerTransfer(target, source, admin.id);
  }

  const [targetAfterTransfer] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, target.id))
    .limit(1);
  if (!targetAfterTransfer) throw new Error('Target booking missing after transfer');

  const breakdown = breakdownBookingCheckoutPayment(targetAfterTransfer);
  if (breakdown.bookingTotalDuePaise !== EXPECTED.totalPaise) {
    throw new Error(
      `Checkout total mismatch: expected ${EXPECTED.totalPaise}, got ${breakdown.bookingTotalDuePaise}`,
    );
  }

  if (proof && proof.amountPaise !== EXPECTED.totalPaise) {
    throw new Error(
      `Payment proof amount ${proof.amountPaise} does not match expected ${EXPECTED.totalPaise}`,
    );
  }

  if (proof?.status === 'pending') {
    await reviewPaymentRecord(adminSession(admin), proof.id, 'approved', {
      reviewMeta: {
        approvalNotes: `₹330 transferred from ${SOURCE_CODE}; prior ₹165 deposit cleared.`,
        reviewNotes: 'Customer paid displayed total ₹2,685.',
      },
    });
  } else if (targetAfterTransfer.status !== 'confirmed') {
    if (!proof) throw new Error('No payment proof found to approve');
    if (proof.status !== 'approved') {
      throw new Error(`Payment proof status is ${proof.status}`);
    }
  }

  const [finalTarget] = await db.select().from(bookings).where(eq(bookings.id, target.id)).limit(1);
  const finalSummary = await getDepositSummaryForBooking(target.id);
  const finalSourceSummary = await getDepositSummaryForBooking(source.id);
  const priorSummary = prior ? await getDepositSummaryForBooking(prior.id) : null;

  const split = proof != null ? splitBookingPayment(targetAfterTransfer, proof.amountPaise) : null;

  const [finalSource] = await db
    .select({ depositDuePaise: bookings.depositDuePaise })
    .from(bookings)
    .where(eq(bookings.id, source.id))
    .limit(1);

  const checks = {
    targetConfirmed: finalTarget?.status === 'confirmed',
    targetDepositRequired: (finalTarget?.depositPaise ?? 0) === EXPECTED.totalDepositHeldPaise,
    targetDepositHeld: (finalSummary?.collectedPaise ?? 0) >= EXPECTED.totalDepositHeldPaise,
    targetDepositDue: (finalTarget?.depositDuePaise ?? 0) === 0,
    sourceRefundableZero: (finalSourceSummary?.refundableBalancePaise ?? 0) === 0,
    sourceDepositDueZero: (finalSource?.depositDuePaise ?? 0) === 0,
    priorOutstandingCleared: priorSummary ? priorSummary.collectedPaise >= 16_500 : true,
    splitRent: split?.rentPaisePaid === EXPECTED.rentPaise,
    splitDepositCash: split?.depositPaisePaid === EXPECTED.depositCashPaise,
    splitPriorCollected:
      proof != null && split != null
        ? proof.amountPaise - split.rentPaisePaid - split.depositPaisePaid ===
          EXPECTED.priorOutstandingPaise
        : true,
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  if (failed.length > 0) {
    throw new Error(`Verification failed: ${failed.map(([k]) => k).join(', ')}`);
  }

  return { ok: true, alreadyComplete: false, checks };
}
