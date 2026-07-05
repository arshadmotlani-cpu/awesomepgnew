/**
 * Referral earnings withdrawal — separate ledger from deposit refunds.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  customers,
  referralEarnings,
  referralWithdrawalRequests,
} from '@/src/db/schema';
import { getReferralSummaryForCustomer } from '@/src/services/referrals';

export type ReferralWithdrawalRow = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  amountPaise: number;
  status: string;
  upiId: string | null;
  requestedAt: Date;
  processedAt: Date | null;
};

export async function createReferralWithdrawalRequest(input: {
  customerId: string;
  amountPaise: number;
  upiId: string;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const upi = input.upiId.trim();
  if (!upi) return { ok: false, error: 'Enter your UPI ID.' };
  if (input.amountPaise <= 0) return { ok: false, error: 'Enter a valid amount.' };

  const summary = await getReferralSummaryForCustomer(input.customerId);
  if (input.amountPaise > summary.availablePaise) {
    return {
      ok: false,
      error: `Maximum withdrawable is ₹${Math.round(summary.availablePaise / 100)}.`,
    };
  }

  const [open] = await db
    .select({ id: referralWithdrawalRequests.id })
    .from(referralWithdrawalRequests)
    .where(
      and(
        eq(referralWithdrawalRequests.customerId, input.customerId),
        inArray(referralWithdrawalRequests.status, ['pending', 'approved']),
      ),
    )
    .limit(1);
  if (open) {
    return { ok: false, error: 'You already have a withdrawal request in progress.' };
  }

  const [row] = await db
    .insert(referralWithdrawalRequests)
    .values({
      customerId: input.customerId,
      amountPaise: input.amountPaise,
      upiId: upi,
      status: 'pending',
    })
    .returning({ id: referralWithdrawalRequests.id });

  if (!row) return { ok: false, error: 'Could not create withdrawal request.' };

  await db.insert(auditLog).values({
    actorType: 'customer',
    actorId: input.customerId,
    entity: 'referral_withdrawal_request',
    entityId: row.id,
    action: 'requested',
    diff: { amountPaise: input.amountPaise, upiId: upi },
  });

  return { ok: true, requestId: row.id };
}

export async function listReferralWithdrawalsForAdmin(opts?: {
  status?: 'pending' | 'approved' | 'paid' | 'rejected';
}): Promise<ReferralWithdrawalRow[]> {
  const conditions = opts?.status
    ? [eq(referralWithdrawalRequests.status, opts.status)]
    : [];

  const rows = await db
    .select({
      id: referralWithdrawalRequests.id,
      customerId: referralWithdrawalRequests.customerId,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      amountPaise: referralWithdrawalRequests.amountPaise,
      status: referralWithdrawalRequests.status,
      upiId: referralWithdrawalRequests.upiId,
      requestedAt: referralWithdrawalRequests.requestedAt,
      processedAt: referralWithdrawalRequests.processedAt,
    })
    .from(referralWithdrawalRequests)
    .innerJoin(customers, eq(customers.id, referralWithdrawalRequests.customerId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sql`${referralWithdrawalRequests.requestedAt} DESC`);

  return rows;
}

export async function approveReferralWithdrawal(input: {
  requestId: string;
  adminId: string;
  adminNotes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const [req] = await db
    .select()
    .from(referralWithdrawalRequests)
    .where(eq(referralWithdrawalRequests.id, input.requestId))
    .limit(1);
  if (!req) return { ok: false, error: 'Request not found.' };
  if (req.status !== 'pending') return { ok: false, error: 'Request is not pending.' };

  await db
    .update(referralWithdrawalRequests)
    .set({
      status: 'approved',
      adminNotes: input.adminNotes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(referralWithdrawalRequests.id, input.requestId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'referral_withdrawal_request',
    entityId: input.requestId,
    action: 'approved',
    diff: { adminNotes: input.adminNotes ?? null },
  });

  return { ok: true };
}

export async function rejectReferralWithdrawal(input: {
  requestId: string;
  adminId: string;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  const [req] = await db
    .select()
    .from(referralWithdrawalRequests)
    .where(eq(referralWithdrawalRequests.id, input.requestId))
    .limit(1);
  if (!req) return { ok: false, error: 'Request not found.' };
  if (req.status !== 'pending' && req.status !== 'approved') {
    return { ok: false, error: 'Request cannot be rejected.' };
  }

  await db
    .update(referralWithdrawalRequests)
    .set({
      status: 'rejected',
      adminNotes: input.reason,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(referralWithdrawalRequests.id, input.requestId));

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'referral_withdrawal_request',
    entityId: input.requestId,
    action: 'rejected',
    diff: { reason: input.reason },
  });

  return { ok: true };
}

export async function markReferralWithdrawalPaid(input: {
  requestId: string;
  adminId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const [req] = await db
    .select()
    .from(referralWithdrawalRequests)
    .where(eq(referralWithdrawalRequests.id, input.requestId))
    .limit(1);
  if (!req) return { ok: false, error: 'Request not found.' };
  if (req.status !== 'approved') return { ok: false, error: 'Request must be approved first.' };

  const summary = await getReferralSummaryForCustomer(req.customerId);
  if (req.amountPaise > summary.availablePaise) {
    return { ok: false, error: 'Insufficient available referral balance.' };
  }

  await db.transaction(async (tx) => {
    let remaining = req.amountPaise;
    const available = await tx
      .select()
      .from(referralEarnings)
      .where(
        and(
          eq(referralEarnings.referrerCustomerId, req.customerId),
          eq(referralEarnings.status, 'available'),
        ),
      )
      .orderBy(referralEarnings.createdAt);

    for (const earning of available) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, earning.amountPaise);
      if (take >= earning.amountPaise) {
        await tx
          .update(referralEarnings)
          .set({ status: 'withdrawn', withdrawnAt: new Date() })
          .where(eq(referralEarnings.id, earning.id));
      } else {
        await tx
          .update(referralEarnings)
          .set({ amountPaise: earning.amountPaise - take })
          .where(eq(referralEarnings.id, earning.id));
        await tx.insert(referralEarnings).values({
          referrerCustomerId: req.customerId,
          redemptionId: earning.redemptionId,
          amountPaise: take,
          status: 'withdrawn',
          withdrawnAt: new Date(),
        });
      }
      remaining -= take;
    }

    await tx
      .update(referralWithdrawalRequests)
      .set({
        status: 'paid',
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(referralWithdrawalRequests.id, input.requestId));
  });

  await db.insert(auditLog).values({
    actorType: 'admin',
    actorId: input.adminId,
    entity: 'referral_withdrawal_request',
    entityId: input.requestId,
    action: 'paid',
    diff: { amountPaise: req.amountPaise },
  });

  return { ok: true };
}

export async function listReferralWithdrawalsForCustomer(customerId: string) {
  return db
    .select()
    .from(referralWithdrawalRequests)
    .where(eq(referralWithdrawalRequests.customerId, customerId))
    .orderBy(sql`${referralWithdrawalRequests.requestedAt} DESC`);
}
