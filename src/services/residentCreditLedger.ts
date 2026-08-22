/**
 * Resident Credit Balance — overpayments and adjustments separate from deposit escrow.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { residentCreditLedger } from '@/src/db/schema';

export type ResidentCreditBalance = {
  customerId: string;
  balancePaise: number;
};

export async function getResidentCreditBalance(customerId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${residentCreditLedger.amountPaise}), 0)::bigint::int`,
    })
    .from(residentCreditLedger)
    .where(eq(residentCreditLedger.customerId, customerId));
  return Math.max(0, row?.total ?? 0);
}

export async function recordResidentCredit(input: {
  customerId: string;
  bookingId?: string | null;
  amountPaise: number;
  reason: string;
  relatedPaymentId?: string | null;
  createdByAdminId?: string | null;
}): Promise<void> {
  if (input.amountPaise <= 0) return;
  await db.insert(residentCreditLedger).values({
    customerId: input.customerId,
    bookingId: input.bookingId ?? null,
    entryKind: 'credit',
    amountPaise: input.amountPaise,
    reason: input.reason,
    relatedPaymentId: input.relatedPaymentId ?? null,
    createdByAdminId: input.createdByAdminId ?? null,
  });
}

/**
 * Advance rent credit SSOT = resident_credit_ledger.
 * entry_kind stays `credit` (enum); reason embeds `advance_rent` marker
 * because reason is free text (no separate kind enum value).
 */
export const ADVANCE_RENT_REASON_MARKER = 'advance_rent';

export const MOVE_OUT_UNUSED_RENT_MARKER = 'move_out_unused_rent';

export function moveOutUnusedRentCreditReason(vacatingRequestId: string): string {
  return `${MOVE_OUT_UNUSED_RENT_MARKER}:${vacatingRequestId}`;
}

export function moveOutUnusedRentPayoutDebitReason(settlementId: string): string {
  return `move_out_unused_rent_payout:${settlementId}`;
}

export function isMoveOutUnusedRentLedgerReason(reason: string): boolean {
  return reason.startsWith(`${MOVE_OUT_UNUSED_RENT_MARKER}:`);
}

export async function postAdvanceRentCredit(input: {
  customerId: string;
  bookingId?: string | null;
  amountPaise: number;
  note?: string | null;
  relatedPaymentId?: string | null;
  createdByAdminId?: string | null;
}): Promise<void> {
  const note = input.note?.trim();
  const reason = note
    ? `${ADVANCE_RENT_REASON_MARKER}: ${note}`
    : ADVANCE_RENT_REASON_MARKER;
  await recordResidentCredit({
    customerId: input.customerId,
    bookingId: input.bookingId,
    amountPaise: input.amountPaise,
    reason,
    relatedPaymentId: input.relatedPaymentId,
    createdByAdminId: input.createdByAdminId,
  });
}

export function isAdvanceRentLedgerReason(reason: string): boolean {
  return (
    reason === ADVANCE_RENT_REASON_MARKER ||
    reason.startsWith(`${ADVANCE_RENT_REASON_MARKER}:`)
  );
}

export async function recordResidentCreditDebit(input: {
  customerId: string;
  bookingId?: string | null;
  amountPaise: number;
  reason: string;
  createdByAdminId?: string | null;
}): Promise<void> {
  if (input.amountPaise <= 0) return;
  await db.insert(residentCreditLedger).values({
    customerId: input.customerId,
    bookingId: input.bookingId ?? null,
    entryKind: 'debit',
    amountPaise: -input.amountPaise,
    reason: input.reason,
    createdByAdminId: input.createdByAdminId ?? null,
  });
}

export async function hasResidentCreditEntryWithReasonPrefix(
  customerId: string,
  reasonPrefix: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: residentCreditLedger.id })
    .from(residentCreditLedger)
    .where(
      and(
        eq(residentCreditLedger.customerId, customerId),
        sql`${residentCreditLedger.reason} LIKE ${`${reasonPrefix}%`}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Credit eligible unused prepaid rent to resident wallet once per vacating request.
 * SSOT amount from loadVacatingBillingPresentationBundle — no alternate math.
 */
export async function syncMoveOutUnusedRentWalletCredit(input: {
  vacatingRequestId: string;
  adminId?: string | null;
}): Promise<{ ok: true; creditedPaise: number; skipped: boolean }> {
  const { vacatingRequests, bookings } = await import('@/src/db/schema');
  const [vr] = await db
    .select({
      id: vacatingRequests.id,
      bookingId: vacatingRequests.bookingId,
      customerId: vacatingRequests.customerId,
      noticeGivenDate: vacatingRequests.noticeGivenDate,
      originalNoticeSubmittedAt: vacatingRequests.originalNoticeSubmittedAt,
      vacatingDate: vacatingRequests.vacatingDate,
      monthlyRentPaiseSnapshot: vacatingRequests.monthlyRentPaiseSnapshot,
      status: vacatingRequests.status,
    })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, input.vacatingRequestId))
    .limit(1);
  if (!vr || !['approved', 'completed'].includes(vr.status)) {
    return { ok: true, creditedPaise: 0, skipped: true };
  }

  const reasonPrefix = moveOutUnusedRentCreditReason(vr.id);
  const already = await hasResidentCreditEntryWithReasonPrefix(vr.customerId, reasonPrefix);
  if (already) {
    return { ok: true, creditedPaise: 0, skipped: true };
  }

  const [booking] = await db
    .select({ stayType: bookings.stayType, durationMode: bookings.durationMode })
    .from(bookings)
    .where(eq(bookings.id, vr.bookingId))
    .limit(1);

  const { loadVacatingBillingPresentationBundle } = await import(
    '@/src/lib/vacating/loadVacatingBillingPresentation'
  );
  const { resolveNoticeGivenDateForVacating } = await import('@/src/lib/vacating/noticeDateSsot');
  const bundle = await loadVacatingBillingPresentationBundle({
    bookingId: vr.bookingId,
    noticeGivenDate: resolveNoticeGivenDateForVacating({
      noticeGivenDate: vr.noticeGivenDate,
      originalNoticeSubmittedAt: vr.originalNoticeSubmittedAt,
    }),
    vacatingDate: String(vr.vacatingDate),
    monthlyRentPaiseSnapshot: vr.monthlyRentPaiseSnapshot,
    stayType: booking?.stayType,
    durationMode: booking?.durationMode,
    mode: 'estimate',
    treatAsApprovedForTail: true,
  });

  const amountPaise = bundle?.estimatedSettlement?.waterfall.refund.unusedRentPortionPaise ?? 0;
  if (amountPaise <= 0) {
    return { ok: true, creditedPaise: 0, skipped: true };
  }

  await recordResidentCredit({
    customerId: vr.customerId,
    bookingId: vr.bookingId,
    amountPaise,
    reason: `${reasonPrefix} Unused prepaid rent from move-out`,
    createdByAdminId: input.adminId ?? null,
  });

  return { ok: true, creditedPaise: amountPaise, skipped: false };
}

/**
 * Auto-apply available credit to a newly issued rent invoice (default on).
 * Idempotent via unique index on related_rent_invoice_id.
 */
export async function autoApplyCreditToRentInvoice(input: {
  customerId: string;
  bookingId: string;
  invoiceId: string;
  outstandingPaise: number;
}): Promise<{ appliedPaise: number }> {
  if (input.outstandingPaise <= 0) return { appliedPaise: 0 };

  const balance = await getResidentCreditBalance(input.customerId);
  if (balance <= 0) return { appliedPaise: 0 };

  const applyPaise = Math.min(balance, input.outstandingPaise);

  try {
    await db.insert(residentCreditLedger).values({
      customerId: input.customerId,
      bookingId: input.bookingId,
      entryKind: 'applied',
      amountPaise: -applyPaise,
      reason: `Auto-applied to rent invoice`,
      relatedRentInvoiceId: input.invoiceId,
    });
  } catch {
    return { appliedPaise: 0 };
  }

  const { recordRentPaymentSuccess } = await import('@/src/services/rentInvoices');
  await recordRentPaymentSuccess({
    invoiceId: input.invoiceId,
    amountPaise: applyPaise,
    provider: 'mock',
    providerPaymentId: `credit:${input.invoiceId}`,
    offlineProvider: 'cash',
  }).catch(() => undefined);

  return { appliedPaise: applyPaise };
}

export async function listRecentCreditEntries(
  customerId: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    entryKind: string;
    amountPaise: number;
    reason: string;
    createdAt: Date;
  }>
> {
  return db
    .select({
      id: residentCreditLedger.id,
      entryKind: residentCreditLedger.entryKind,
      amountPaise: residentCreditLedger.amountPaise,
      reason: residentCreditLedger.reason,
      createdAt: residentCreditLedger.createdAt,
    })
    .from(residentCreditLedger)
    .where(eq(residentCreditLedger.customerId, customerId))
    .orderBy(sql`${residentCreditLedger.createdAt} DESC`)
    .limit(limit);
}
