/**
 * Extension service — Phase 5 of PROJECT_PLAN.md ("Stay Extensions").
 *
 * Extends an EXISTING confirmed booking by `[old_end, new_end)` across the
 * same set of beds. The actual extra inventory lives in `bed_reservations`
 * with `kind = 'extension'` and `parent_reservation_id` pointing at the
 * matching primary reservation; the `stay_extensions` table tracks the
 * request, the quote, and the payment lifecycle.
 *
 * The transactional algorithm follows PROJECT_PLAN.md §2.5 "Extend a stay":
 *
 *   1. BEGIN.
 *   2. Re-fetch the booking + its primary reservations; validate state.
 *   3. For each bed, insert a new reservation `[old_end, new_end)`,
 *      `kind='extension'`, `parent=original`, `status='hold'`. If the
 *      GiST EXCLUDE constraint fires (23P01) on ANY bed, we ROLLBACK and
 *      return a structured conflict listing all beds that couldn't fit
 *      (we pre-flight every bed first so the typical case is the
 *      `requestExtension` caller sees ALL conflicts in one round-trip,
 *      not just the first one).
 *   4. Compute the quote with `quoteExtension()` (deposit always 0).
 *   5. Insert `stay_extensions` row in `pending` with the snapshotted
 *      quote total and the new reservation ids.
 *   6. Audit log `extension_requested`.
 *   7. COMMIT.
 *
 * On payment success (see `bookingLifecycle.ts → recordExtensionPaymentSuccess`)
 * the extension reservations flip to `active`, the extension row flips to
 * `paid`, and `bookings.expected_checkout_date` rolls forward. The price
 * snapshotted at request time wins — this is the documented Phase-5 race
 * condition resolution from PROJECT_PLAN.md §8.6.
 */

import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  rooms,
  stayExtensions,
} from '../db/schema';
import { adminCanAccessPg } from '../lib/auth/roles';
import type { AdminSession } from '../lib/auth/session';
import { env } from '../lib/env';
import { formatDate, parseDate, type DateLike } from '../lib/dates';
import { extensionCapMessage } from '../lib/bedAvailabilityWindows';
import { isBedAvailable } from './availability';
import { quoteExtension as priceExtension, type ExtensionQuote } from './pricing';

// ───────────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────────

export type ExtensionDurationMode = 'daily' | 'weekly' | 'monthly';

export type ExtensionActor =
  | { kind: 'customer'; customerId: string | null }
  | { kind: 'admin'; adminId: string | null };

export type ExtensionConflict = {
  bedId: string;
  bedCode: string;
  /** ISO date — inclusive start of the blocking reservation. */
  blockingFrom: string;
  /** ISO date string (YYYY-MM-DD), exclusive upper bound of the blocking range. */
  blockingUntil: string;
  /** Booking that owns the conflicting reservation, when discoverable. */
  blockingBookingCode: string | null;
};

export type QuoteExtensionResult =
  | {
      ok: true;
      bookingId: string;
      bookingCode: string;
      bedIds: string[];
      fromDate: string;
      untilDate: string;
      durationMode: ExtensionDurationMode;
      quote: ExtensionQuote;
    }
  | {
      ok: false;
      kind:
        | 'no_such_booking'
        | 'booking_not_extendable'
        | 'invalid_dates'
        | 'open_ended_not_supported'
        | 'conflict'
        | 'unknown';
      message: string;
      conflicts?: ExtensionConflict[];
    };

export type RequestExtensionInput = {
  bookingCode: string;
  /** Exclusive — the new `bookings.expected_checkout_date` if paid. */
  newUntilDate: DateLike;
  durationMode: ExtensionDurationMode;
  requestedBy: 'customer' | 'admin';
  actor: ExtensionActor;
  /** Ownership proof for customer-requested extensions. Required when requestedBy='customer'. */
  customerPhone?: string | null;
  notes?: string;
};

export type RequestExtensionSuccess = {
  ok: true;
  extensionId: string;
  bookingId: string;
  bookingCode: string;
  status: 'pending';
  fromDate: string;
  untilDate: string;
  durationMode: ExtensionDurationMode;
  quote: ExtensionQuote;
  holdExpiresAt: Date;
  newReservationIds: string[];
};

export type RequestExtensionFailure =
  | {
      ok: false;
      kind:
        | 'no_such_booking'
        | 'booking_not_extendable'
        | 'invalid_dates'
        | 'open_ended_not_supported'
        | 'ownership_failed'
        | 'unknown';
      message: string;
    }
  | { ok: false; kind: 'conflict'; message: string; conflicts: ExtensionConflict[] };

export type RequestExtensionResult = RequestExtensionSuccess | RequestExtensionFailure;

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function pgCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return null;
}

/**
 * Load a booking + its primary reservations + the customer phone. Returns
 * null if no such booking. This is the canonical "is this booking
 * extendable?" probe.
 */
async function loadBookingForExtension(bookingCode: string) {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      status: bookings.status,
      durationMode: bookings.durationMode,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      customerId: bookings.customerId,
      customerPhone: customers.phone,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!booking) return null;

  // We extend the booking off the LATEST end of any active/hold extension
  // OR the primary reservations — i.e. you can chain extensions. The
  // booking's `expected_checkout_date` is the canonical answer because
  // recordExtensionPaymentSuccess keeps it in sync, but we fall back to a
  // reservations-derived max as belt-and-braces in case of bad data.
  const primaries = await db
    .select({
      id: bedReservations.id,
      bedId: bedReservations.bedId,
      status: bedReservations.status,
      upper: sql<string>`to_char(upper(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, booking.id),
        eq(bedReservations.kind, 'primary'),
      ),
    )
    .orderBy(asc(bedReservations.bedId));
  return { booking, primaries };
}

async function resolveBedCodes(
  bedIds: string[],
): Promise<Map<string, string>> {
  if (bedIds.length === 0) return new Map();
  const rows = await db
    .select({ id: beds.id, bedCode: beds.bedCode })
    .from(beds)
    .where(inArray(beds.id, bedIds));
  return new Map(rows.map((r) => [r.id, r.bedCode]));
}

/**
 * For every bed in `bedIds`, scan `bed_reservations` for any active/hold
 * reservation whose `stay_range` overlaps `[from, until)` and return a
 * structured list. Used to surface ALL conflicts at once instead of relying
 * on the first 23P01 from the DB.
 */
async function findConflicts(args: {
  bedIds: string[];
  fromDate: string;
  untilDate: string;
  excludeBookingId: string;
}): Promise<ExtensionConflict[]> {
  if (args.bedIds.length === 0) return [];
  const codeMap = await resolveBedCodes(args.bedIds);
  const rows = await db
    .select({
      bedId: bedReservations.bedId,
      lowerRaw: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
      upperRaw: sql<string>`to_char(upper(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
      blockingBookingId: bedReservations.bookingId,
      blockingBookingCode: bookings.bookingCode,
    })
    .from(bedReservations)
    .innerJoin(bookings, eq(bookings.id, bedReservations.bookingId))
    .where(
      and(
        inArray(bedReservations.bedId, args.bedIds),
        inArray(bedReservations.status, ['hold', 'active']),
        sql`${bedReservations.stayRange} && daterange(${args.fromDate}::date, ${args.untilDate}::date, '[)')`,
      ),
    );

  const conflicts: ExtensionConflict[] = [];
  for (const r of rows) {
    // Skip rows that belong to the booking we're extending — they're our own
    // primary/extension reservations and don't count as conflicts.
    if (r.blockingBookingId === args.excludeBookingId) continue;
    conflicts.push({
      bedId: r.bedId,
      bedCode: codeMap.get(r.bedId) ?? '?',
      blockingFrom: r.lowerRaw,
      blockingUntil: r.upperRaw,
      blockingBookingCode: r.blockingBookingCode,
    });
  }
  return conflicts;
}

// ───────────────────────────────────────────────────────────────────────────
// quoteExtension — read-only, fast-path for the customer pre-pay UI
// ───────────────────────────────────────────────────────────────────────────

export async function quoteExtension(args: {
  bookingCode: string;
  newUntilDate: DateLike;
  durationMode: ExtensionDurationMode;
}): Promise<QuoteExtensionResult> {
  const loaded = await loadBookingForExtension(args.bookingCode);
  if (!loaded) {
    return {
      ok: false,
      kind: 'no_such_booking',
      message: `No booking with code "${args.bookingCode}".`,
    };
  }
  const { booking, primaries } = loaded;

  if (booking.status !== 'confirmed') {
    return {
      ok: false,
      kind: 'booking_not_extendable',
      message: `Only confirmed bookings can be extended (current status: ${booking.status}).`,
    };
  }
  if (booking.durationMode === 'open_ended') {
    return {
      ok: false,
      kind: 'open_ended_not_supported',
      message:
        'Open-ended bookings auto-renew monthly — they do not have a finite checkout to extend.',
    };
  }
  if (!booking.expectedCheckoutDate) {
    return {
      ok: false,
      kind: 'booking_not_extendable',
      message: 'This booking has no scheduled checkout date — extensions are not applicable.',
    };
  }

  const fromDate = booking.expectedCheckoutDate; // YYYY-MM-DD
  const untilDateRaw = parseDate(args.newUntilDate);
  const untilDate = formatDate(untilDateRaw);
  if (untilDate <= fromDate) {
    return {
      ok: false,
      kind: 'invalid_dates',
      message: `New end date (${untilDate}) must be strictly after the current end date (${fromDate}).`,
    };
  }
  // Anti-foot-gun: cap at 2 years out from the current checkout.
  const maxDate = new Date(parseDate(fromDate).getTime() + 730 * 86400_000);
  if (untilDateRaw.getTime() > maxDate.getTime()) {
    return {
      ok: false,
      kind: 'invalid_dates',
      message: 'Extension cannot exceed 2 years past the current checkout date.',
    };
  }

  const bedIds = Array.from(new Set(primaries.map((p) => p.bedId)));
  const conflicts = await findConflicts({
    bedIds,
    fromDate,
    untilDate,
    excludeBookingId: booking.id,
  });
  if (conflicts.length > 0) {
    const capUntil = conflicts
      .map((c) => c.blockingFrom)
      .filter((d) => d > fromDate)
      .sort()[0] ?? fromDate;
    return {
      ok: false,
      kind: 'conflict',
      message: extensionCapMessage(capUntil),
      conflicts,
    };
  }

  let quote: ExtensionQuote;
  try {
    quote = await priceExtension({
      bedIds,
      fromDate,
      untilDate,
      durationMode: args.durationMode,
    });
  } catch (err) {
    return {
      ok: false,
      kind: 'unknown',
      message: err instanceof Error ? err.message : 'Failed to compute extension quote.',
    };
  }

  return {
    ok: true,
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    bedIds,
    fromDate,
    untilDate,
    durationMode: args.durationMode,
    quote,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// requestExtension — mutating, transactional, hold-creating
// ───────────────────────────────────────────────────────────────────────────

export async function requestExtension(
  _input: RequestExtensionInput,
): Promise<RequestExtensionResult> {
  return {
    ok: false,
    kind: 'booking_not_extendable',
    message:
      'Stay extensions are no longer available. To continue living, cancel your vacating notice instead.',
  };
}

// ───────────────────────────────────────────────────────────────────────────
// cancelPendingExtension — release a still-pending extension before payment
// ───────────────────────────────────────────────────────────────────────────

export type CancelExtensionResult =
  | {
      ok: true;
      extensionId: string;
      stateChanged: boolean;
      bookingId: string;
      releasedReservationIds: string[];
    }
  | { ok: false; kind: 'no_such_extension' | 'not_cancellable' | 'unknown'; message: string };

/**
 * Cancel a `stay_extensions` row that's still in `pending`. Releases its
 * held reservations and writes an audit log. Idempotent — re-invocation on
 * an already-cancelled extension returns `stateChanged: false`.
 */
export async function cancelPendingExtension(args: {
  extensionId: string;
  actor: ExtensionActor;
  reason?: string;
}): Promise<CancelExtensionResult> {
  const [row] = await db
    .select({
      id: stayExtensions.id,
      bookingId: stayExtensions.bookingId,
      status: stayExtensions.status,
      newReservationIds: stayExtensions.newReservationIds,
    })
    .from(stayExtensions)
    .where(eq(stayExtensions.id, args.extensionId))
    .limit(1);
  if (!row) {
    return { ok: false, kind: 'no_such_extension', message: 'Extension not found.' };
  }
  if (row.status === 'cancelled' || row.status === 'rejected') {
    return {
      ok: true,
      extensionId: row.id,
      stateChanged: false,
      bookingId: row.bookingId,
      releasedReservationIds: [],
    };
  }
  if (row.status !== 'pending') {
    return {
      ok: false,
      kind: 'not_cancellable',
      message: `Extensions in status "${row.status}" cannot be cancelled (only "pending" can).`,
    };
  }

  const ids = row.newReservationIds ?? [];
  try {
    await db.transaction(async (tx) => {
      if (ids.length > 0) {
        await tx
          .update(bedReservations)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(
            and(
              inArray(bedReservations.id, ids),
              inArray(bedReservations.status, ['hold', 'active']),
            ),
          );
      }
      await tx
        .update(stayExtensions)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(stayExtensions.id, row.id));
      await tx.insert(auditLog).values({
        actorType: args.actor.kind,
        actorId:
          args.actor.kind === 'customer'
            ? args.actor.customerId
            : args.actor.adminId,
        entity: 'stay_extension',
        entityId: row.id,
        action: 'extension_cancelled',
        diff: {
          bookingId: row.bookingId,
          reason: args.reason ?? null,
          releasedReservationIds: ids,
        },
      });
    });
    return {
      ok: true,
      extensionId: row.id,
      stateChanged: true,
      bookingId: row.bookingId,
      releasedReservationIds: ids,
    };
  } catch (err) {
    return {
      ok: false,
      kind: 'unknown',
      message: err instanceof Error ? err.message : 'Failed to cancel extension.',
    };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// markExpiredExtensions — sweeper fold-in
// ───────────────────────────────────────────────────────────────────────────

/**
 * Find `stay_extensions` rows whose `new_reservation_ids` are now ALL in
 * `cancelled` state (because `releaseExpiredHolds` got to them first) and
 * flip the extension row from `pending` to `cancelled`. Called from the
 * hold-expiry cron right after `releaseExpiredHolds` so the customer's UI
 * doesn't continue to advertise a pay button for a dead extension.
 *
 * Idempotent: it only touches rows still in `pending`.
 */
export async function markExpiredExtensions(): Promise<{
  expired: number;
  extensionIds: string[];
}> {
  // Pull every pending extension and check the status of its reservations
  // in batch. N(pending) is small in practice; if it grows we can switch to
  // a single GROUP BY query.
  const pending = await db
    .select({
      id: stayExtensions.id,
      bookingId: stayExtensions.bookingId,
      newReservationIds: stayExtensions.newReservationIds,
    })
    .from(stayExtensions)
    .where(eq(stayExtensions.status, 'pending'));
  if (pending.length === 0) return { expired: 0, extensionIds: [] };

  const toExpire: { id: string; bookingId: string; ids: string[] }[] = [];
  for (const e of pending) {
    const ids = e.newReservationIds ?? [];
    if (ids.length === 0) continue;
    const rows = await db
      .select({ status: bedReservations.status })
      .from(bedReservations)
      .where(inArray(bedReservations.id, ids));
    if (rows.length === 0) continue;
    const allCancelled = rows.every((r) => r.status === 'cancelled');
    if (allCancelled) toExpire.push({ id: e.id, bookingId: e.bookingId, ids });
  }
  if (toExpire.length === 0) return { expired: 0, extensionIds: [] };

  await db.transaction(async (tx) => {
    await tx
      .update(stayExtensions)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          inArray(
            stayExtensions.id,
            toExpire.map((t) => t.id),
          ),
          eq(stayExtensions.status, 'pending'),
        ),
      );
    await tx.insert(auditLog).values({
      actorType: 'system',
      actorId: null,
      entity: 'stay_extension',
      entityId: toExpire[0]!.id,
      action: 'extension_hold_expired_sweep',
      diff: {
        expiredExtensionIds: toExpire.map((t) => t.id),
        affectedBookingIds: Array.from(new Set(toExpire.map((t) => t.bookingId))),
      },
    });
  });

  return {
    expired: toExpire.length,
    extensionIds: toExpire.map((t) => t.id),
  };
}

export async function submitExtensionPaymentProof(
  customerId: string,
  extensionId: string,
  paymentProofUrl: string,
  transactionRef?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [ext] = await db
    .select({
      id: stayExtensions.id,
      status: stayExtensions.status,
      bookingId: stayExtensions.bookingId,
    })
    .from(stayExtensions)
    .innerJoin(bookings, eq(bookings.id, stayExtensions.bookingId))
    .where(and(eq(stayExtensions.id, extensionId), eq(bookings.customerId, customerId)))
    .limit(1);
  if (!ext) return { ok: false, message: 'Extension not found.' };
  if (ext.status !== 'pending') {
    return { ok: false, message: 'This extension is not awaiting payment.' };
  }
  if (!paymentProofUrl.trim()) {
    return { ok: false, message: 'Payment photo is required.' };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(stayExtensions)
      .set({
        paymentProofUrl: paymentProofUrl.trim(),
        paymentProofTransactionRef: transactionRef?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(stayExtensions.id, extensionId));

    const { supersedeActiveRejection } = await import('@/src/services/paymentProofRejectionService');
    await supersedeActiveRejection('stay_extension', extensionId, tx);
  });

  const { linkResidentUpload } = await import('@/src/services/residentUploadEvents');
  await linkResidentUpload({
    storagePath: paymentProofUrl.trim(),
    adminQueue: 'extensions',
    linkedEntity: 'stay_extension',
    linkedEntityId: extensionId,
    bookingId: ext.bookingId,
  }).catch(() => undefined);

  const { scheduleAdminNotificationSync } = await import('@/src/services/adminLiveSync');
  scheduleAdminNotificationSync();

  return { ok: true };
}

export async function listPendingExtensionProofsForPg(pgId: string) {
  return db
    .select({
      extensionId: stayExtensions.id,
      bookingCode: bookings.bookingCode,
      customerName: customers.fullName,
      amountPaise: stayExtensions.quotedTotalPaise,
      paymentProofUrl: stayExtensions.paymentProofUrl,
    })
    .from(stayExtensions)
    .innerJoin(bookings, eq(bookings.id, stayExtensions.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(
      and(
        eq(stayExtensions.status, 'pending'),
        isNotNull(stayExtensions.paymentProofUrl),
        sql`EXISTS (
          SELECT 1 FROM ${bedReservations} br
          JOIN ${beds} b ON b.id = br.bed_id
          JOIN ${rooms} r ON r.id = b.room_id
          JOIN ${floors} f ON f.id = r.floor_id
          WHERE br.booking_id = ${stayExtensions.bookingId}
            AND f.pg_id = ${pgId}
          LIMIT 1
        )`,
      ),
    )
    .orderBy(desc(stayExtensions.updatedAt));
}

export async function approveExtensionPaymentProof(
  session: AdminSession,
  extensionId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [ext] = await db
    .select()
    .from(stayExtensions)
    .where(eq(stayExtensions.id, extensionId))
    .limit(1);
  if (!ext) return { ok: false, message: 'Extension not found.' };
  if (!ext.paymentProofUrl) {
    return { ok: false, message: 'No payment photo uploaded.' };
  }
  if (ext.status !== 'pending') {
    return { ok: false, message: 'Extension is not awaiting payment.' };
  }

  const [pgRow] = await db
    .select({ pgId: floors.pgId })
    .from(bookings)
    .innerJoin(bedReservations, and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(bookings.id, ext.bookingId))
    .limit(1);

  if (!pgRow || !adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgRow.pgId)) {
    return { ok: false, message: 'Access denied.' };
  }

  const { recordExtensionPaymentSuccess } = await import('./bookingLifecycle');
  const result = await recordExtensionPaymentSuccess({
    provider: 'mock',
    providerPaymentId: `extension-proof-${extensionId}`,
    amountPaise: ext.quotedTotalPaise,
    extensionId,
    rawPayload: { source: 'payment_proof', proofUrl: ext.paymentProofUrl },
  });

  if (!result.ok) return { ok: false, message: result.reason };
  return { ok: true };
}

export async function rejectExtensionPaymentProof(
  session: AdminSession,
  extensionId: string,
  rejection: {
    reviewKey: string;
    reasonCode: import('@/src/lib/approvals/paymentProofRejectionReasons').PaymentProofRejectionReasonCode;
    reasonDetail?: string;
    adminNote?: string;
    residentMessage: string;
    sendWhatsApp: boolean;
  },
): Promise<{ ok: true; whatsappUrl?: string } | { ok: false; message: string }> {
  const { rejectPaymentProof } = await import('@/src/services/paymentProofRejectionService');
  return rejectPaymentProof(session, {
    reviewKey: rejection.reviewKey,
    entityType: 'stay_extension',
    entityId: extensionId,
    reasonCode: rejection.reasonCode,
    reasonDetail: rejection.reasonDetail,
    adminNote: rejection.adminNote,
    residentMessage: rejection.residentMessage,
    sendWhatsApp: rejection.sendWhatsApp,
  });
}
