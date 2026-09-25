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

const MOVE_OUT_UNUSED_REVERSAL_PREFIX = 'move_out_unused_rent_reversal:';

export function moveOutUnusedRentReversalReason(vacatingRequestId: string): string {
  return `${MOVE_OUT_UNUSED_REVERSAL_PREFIX}${vacatingRequestId}`;
}

/**
 * Reverse wallet credit posted for an approved vacating notice when the notice is withdrawn.
 * Idempotent — safe to call multiple times after cancel/reject.
 */
export async function reverseMoveOutUnusedRentWalletCredit(input: {
  vacatingRequestId: string;
  adminId?: string | null;
  note?: string;
}): Promise<{ ok: true; reversedPaise: number; skipped: boolean }> {
  const creditPrefix = moveOutUnusedRentCreditReason(input.vacatingRequestId);
  const reversalPrefix = moveOutUnusedRentReversalReason(input.vacatingRequestId);

  const [creditRow] = await db
    .select({
      customerId: residentCreditLedger.customerId,
      bookingId: residentCreditLedger.bookingId,
      amountPaise: residentCreditLedger.amountPaise,
    })
    .from(residentCreditLedger)
    .where(
      and(
        sql`${residentCreditLedger.reason} LIKE ${`${creditPrefix}%`}`,
        eq(residentCreditLedger.entryKind, 'credit'),
      ),
    )
    .orderBy(sql`${residentCreditLedger.createdAt} DESC`)
    .limit(1);

  if (!creditRow?.amountPaise || creditRow.amountPaise <= 0) {
    return { ok: true, reversedPaise: 0, skipped: true };
  }

  const alreadyReversed = await hasResidentCreditEntryWithReasonPrefix(
    creditRow.customerId,
    reversalPrefix,
  );
  if (alreadyReversed) {
    return { ok: true, reversedPaise: 0, skipped: true };
  }

  await recordResidentCreditDebit({
    customerId: creditRow.customerId,
    bookingId: creditRow.bookingId,
    amountPaise: creditRow.amountPaise,
    reason: `${reversalPrefix} ${input.note ?? 'Vacating notice withdrawn — unused prepaid rent credit reversed'}`,
    createdByAdminId: input.adminId ?? null,
  });

  return { ok: true, reversedPaise: creditRow.amountPaise, skipped: false };
}

/**
 * Reverse move-out unused-rent credits when the linked vacating notice is no longer active
 * (e.g. cancelled after approval). Idempotent; safe on every wallet load.
 */
export async function reconcileStaleMoveOutUnusedRentWalletCredits(input: {
  customerId: string;
  adminId?: string | null;
}): Promise<void> {
  const creditRows = await db
    .select({ reason: residentCreditLedger.reason })
    .from(residentCreditLedger)
    .where(
      and(
        eq(residentCreditLedger.customerId, input.customerId),
        eq(residentCreditLedger.entryKind, 'credit'),
        sql`${residentCreditLedger.reason} LIKE ${`${MOVE_OUT_UNUSED_RENT_MARKER}:%`}`,
      ),
    );

  const vacatingIds = new Set<string>();
  for (const row of creditRows) {
    const afterMarker = row.reason.slice(MOVE_OUT_UNUSED_RENT_MARKER.length + 1);
    const id = afterMarker.split(/[\s:]/)[0]?.trim();
    if (id) vacatingIds.add(id);
  }
  if (vacatingIds.size === 0) return;

  const { vacatingRequests } = await import('@/src/db/schema');
  for (const vacatingRequestId of vacatingIds) {
    const [vr] = await db
      .select({ status: vacatingRequests.status })
      .from(vacatingRequests)
      .where(eq(vacatingRequests.id, vacatingRequestId))
      .limit(1);
    if (vr && ['approved', 'completed'].includes(vr.status)) continue;
    await reverseMoveOutUnusedRentWalletCredit({
      vacatingRequestId,
      adminId: input.adminId ?? null,
      note: 'Vacating no longer active — unused prepaid rent credit reversed',
    }).catch((err) => {
      console.error('[residentCreditLedger] stale unused rent reconciliation failed:', err);
    });
  }
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
