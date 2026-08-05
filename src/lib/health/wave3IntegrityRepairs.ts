/**
 * Wave 3 integrity repairs — deterministic only.
 *
 * Safe auto:
 * - Abandoned drafts (no hold / payment / invoice) coexisting with an active stay
 * - Residency↔tenancy drift via rebuildOccupancyState (sync + demote)
 * - Ended fixed-stay beds still marked active
 * - Orphan succeeded rent payment ↔ unique paid invoice amount match
 *
 * Never invents residents, bookings, invoices, or readings.
 */

import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, rentInvoices } from '@/src/db/schema';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import { rebuildOccupancyState } from '@/src/services/occupancyDiagnostics';
import type { RepairExecuteResult } from '@/src/lib/health/repairEngine';

function asRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: Array<Record<string, unknown>> })?.rows;
  return Array.isArray(rows) ? rows : [];
}

/**
 * Cancel draft (non-reserve) bookings that coexist with an active stay and have
 * zero live holds, zero non-cancelled rent invoices, and zero succeeded payments.
 */
export async function repairAbandonedDraftsWithActiveStay(): Promise<RepairExecuteResult> {
  const candidates = asRows(
    await db.execute(sql`
      SELECT
        draft.id::text AS draft_id,
        draft.booking_code AS draft_code,
        stay.id::text AS stay_id,
        stay.booking_code AS stay_code,
        c.id::text AS customer_id
      FROM bookings draft
      JOIN customers c ON c.id = draft.customer_id
      JOIN bookings stay ON stay.customer_id = c.id
        AND stay.id <> draft.id
        AND stay.status = 'confirmed'
        AND stay.duration_mode::text IS DISTINCT FROM 'reserve'
      JOIN bed_reservations br ON br.booking_id = stay.id
        AND br.status = 'active' AND br.kind = 'primary'
        AND br.stay_range @> CURRENT_DATE
      WHERE draft.status = 'draft'
        AND draft.duration_mode::text IS DISTINCT FROM 'reserve'
        AND NOT EXISTS (
          SELECT 1 FROM bed_reserve_holds h
          WHERE h.booking_id = draft.id
            AND h.status IN ('pending_payment', 'under_review', 'active')
        )
        AND NOT EXISTS (
          SELECT 1 FROM rent_invoices ri
          WHERE ri.booking_id = draft.id AND ri.status <> 'cancelled'
        )
        AND NOT EXISTS (
          SELECT 1 FROM payments p
          WHERE p.booking_id = draft.id AND p.status = 'succeeded'
        )
      ORDER BY draft.created_at ASC
      LIMIT 100
    `),
  );

  const cancelled: string[] = [];
  for (const row of candidates) {
    const draftId = String(row.draft_id);
    const [updated] = await db
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason:
          'Health Brain Wave 3: abandoned draft cancelled (active stay exists; no hold/payment/invoice)',
        updatedAt: new Date(),
      })
      .where(and(eq(bookings.id, draftId), eq(bookings.status, 'draft')))
      .returning({ id: bookings.id, bookingCode: bookings.bookingCode });

    if (updated) {
      cancelled.push(updated.id);
      await writeAuditLogNonBlocking(db, {
        actorType: 'system',
        actorId: null,
        action: 'health.abandoned_draft_cancelled',
        entity: 'booking',
        entityId: updated.id,
        diff: {
          bookingCode: updated.bookingCode,
          stayCode: row.stay_code,
          customerId: row.customer_id,
        },
      }).catch(() => undefined);
    }
  }

  return {
    ok: true,
    rowsTouched: cancelled.length,
    skipped: candidates.length - cancelled.length,
    diff: { cancelledBookingIds: cancelled },
  };
}

/**
 * Sync residency_status to active when assigned tenancy exists;
 * demote to vacated when active residency has no assigned tenancy.
 * Also complete ended fixed-stay beds still marked active.
 */
export async function repairResidencyTenancyDrift(): Promise<RepairExecuteResult> {
  const endedBeds = asRows(
    await db.execute(sql`
      UPDATE bed_reservations br
      SET status = 'completed', updated_at = NOW()
      FROM bookings bk
      WHERE br.booking_id = bk.id
        AND br.status = 'active'
        AND br.kind = 'primary'
        AND upper(br.stay_range) IS NOT NULL
        AND upper(br.stay_range) <= CURRENT_DATE
        AND bk.duration_mode = 'fixed_stay'
      RETURNING br.id::text AS id, bk.booking_code
    `),
  );

  for (const row of endedBeds) {
    await writeAuditLogNonBlocking(db, {
      actorType: 'system',
      actorId: null,
      action: 'health.ended_fixed_stay_bed_completed',
      entity: 'bed_reservation',
      entityId: String(row.id),
      diff: { bookingCode: row.booking_code },
    }).catch(() => undefined);
  }

  const rebuild = await rebuildOccupancyState();

  const endedBookings = await repairEndedConfirmedFixedStayBookings();

  // Cancel empty leftover drafts for customers we demoted (no active stay).
  const leftoverDrafts = asRows(
    await db.execute(sql`
      SELECT draft.id::text AS draft_id
      FROM bookings draft
      JOIN customers c ON c.id = draft.customer_id
      WHERE draft.status = 'draft'
        AND draft.duration_mode::text IS DISTINCT FROM 'reserve'
        AND c.residency_status = 'vacated'
        AND NOT EXISTS (
          SELECT 1 FROM bed_reserve_holds h
          WHERE h.booking_id = draft.id
            AND h.status IN ('pending_payment', 'under_review', 'active')
        )
        AND NOT EXISTS (
          SELECT 1 FROM rent_invoices ri
          WHERE ri.booking_id = draft.id AND ri.status <> 'cancelled'
        )
        AND NOT EXISTS (
          SELECT 1 FROM payments p
          WHERE p.booking_id = draft.id AND p.status = 'succeeded'
        )
        AND NOT EXISTS (
          SELECT 1 FROM bookings stay
          JOIN bed_reservations br ON br.booking_id = stay.id
            AND br.status = 'active' AND br.kind = 'primary'
            AND br.stay_range @> CURRENT_DATE
          WHERE stay.customer_id = c.id
            AND stay.status = 'confirmed'
            AND stay.duration_mode::text IS DISTINCT FROM 'reserve'
        )
      LIMIT 100
    `),
  );

  let draftsCancelled = 0;
  for (const row of leftoverDrafts) {
    const [updated] = await db
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason:
          'Health Brain Wave 3: empty draft cancelled after residency demotion (no active stay)',
        updatedAt: new Date(),
      })
      .where(and(eq(bookings.id, String(row.draft_id)), eq(bookings.status, 'draft')))
      .returning({ id: bookings.id });
    if (updated) draftsCancelled += 1;
  }

  const rowsTouched =
    endedBeds.length +
    rebuild.residencyStatusSynced +
    rebuild.residencyStatusDemoted +
    endedBookings.rowsTouched +
    draftsCancelled;

  return {
    ok: true,
    rowsTouched,
    diff: {
      endedBedsCompleted: endedBeds.length,
      residencyStatusSynced: rebuild.residencyStatusSynced,
      residencyStatusDemoted: rebuild.residencyStatusDemoted,
      endedFixedStayBookingsCompleted: endedBookings.rowsTouched,
      leftoverDraftsCancelled: draftsCancelled,
      orphanReservationsClosed: rebuild.orphanReservationsClosed,
      bookingsReconciled: rebuild.bookingsReconciled,
    },
  };
}

/**
 * Attach succeeded orphan rent payment to a unique paid invoice on the same booking
 * when amounts match and the current payment_id (if any) does not match rent_paise.
 */
export async function repairUnambiguousOrphanRentPaymentLinks(): Promise<RepairExecuteResult> {
  const orphans = asRows(
    await db.execute(sql`
      SELECT
        p.id::text AS payment_id,
        p.booking_id::text AS booking_id,
        p.amount_paise::bigint AS amount_paise
      FROM payments p
      WHERE p.status = 'succeeded'
        AND p.purpose = 'rent'
        AND coalesce(p.amount_paise, 0) > 0
        AND p.created_at > NOW() - INTERVAL '180 days'
        AND NOT EXISTS (SELECT 1 FROM rent_invoices ri WHERE ri.payment_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM electricity_invoices ei WHERE ei.payment_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM financial_invoices fi WHERE fi.payment_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM stay_extensions se WHERE se.payment_id = p.id)
      ORDER BY p.created_at ASC
      LIMIT 50
    `),
  );

  const linked: Array<{ paymentId: string; invoiceId: string; invoiceNumber: string | null }> = [];
  let skipped = 0;

  for (const orphan of orphans) {
    const paymentId = String(orphan.payment_id);
    const bookingId = String(orphan.booking_id);
    const amount = Number(orphan.amount_paise);

    const matches = asRows(
      await db.execute(sql`
        SELECT
          ri.id::text AS invoice_id,
          ri.invoice_number,
          ri.payment_id::text AS current_payment_id,
          ri.rent_paise::bigint AS rent_paise,
          linked.amount_paise::bigint AS linked_amount
        FROM rent_invoices ri
        LEFT JOIN payments linked ON linked.id = ri.payment_id
        WHERE ri.booking_id = ${bookingId}::uuid
          AND ri.status = 'paid'
          AND ri.rent_paise = ${amount}
          AND coalesce(ri.is_adhoc, false) = false
          AND extract(year from ri.billing_month::date) < 2090
          AND (
            ri.payment_id IS NULL
            OR linked.amount_paise < ri.rent_paise
          )
        ORDER BY ri.billing_month DESC
        LIMIT 5
      `),
    );

    if (matches.length !== 1) {
      skipped += 1;
      continue;
    }

    const match = matches[0]!;
    const invoiceId = String(match.invoice_id);

    const [updated] = await db
      .update(rentInvoices)
      .set({
        paymentId,
        updatedAt: new Date(),
      })
      .where(and(eq(rentInvoices.id, invoiceId), eq(rentInvoices.status, 'paid')))
      .returning({ id: rentInvoices.id, invoiceNumber: rentInvoices.invoiceNumber });

    if (!updated) {
      skipped += 1;
      continue;
    }

    linked.push({
      paymentId,
      invoiceId: updated.id,
      invoiceNumber: updated.invoiceNumber,
    });

    await writeAuditLogNonBlocking(db, {
      actorType: 'system',
      actorId: null,
      action: 'health.orphan_payment_linked',
      entity: 'rent_invoice',
      entityId: updated.id,
      diff: {
        paymentId,
        previousPaymentId: match.current_payment_id,
        invoiceNumber: updated.invoiceNumber,
        amountPaise: amount,
      },
    }).catch(() => undefined);
  }

  return {
    ok: true,
    rowsTouched: linked.length,
    skipped,
    diff: { linked },
  };
}

/**
 * Complete confirmed fixed-stay bookings whose primary bed stay has fully ended
 * (no active primary bed left). Never invents beds.
 */
export async function repairEndedConfirmedFixedStayBookings(): Promise<RepairExecuteResult> {
  const candidates = asRows(
    await db.execute(sql`
      SELECT
        bk.id::text AS booking_id,
        bk.booking_code
      FROM bookings bk
      WHERE bk.status = 'confirmed'
        AND bk.duration_mode = 'fixed_stay'
        AND NOT EXISTS (
          SELECT 1 FROM bed_reservations br
          WHERE br.booking_id = bk.id
            AND br.status = 'active'
            AND br.kind = 'primary'
        )
        AND EXISTS (
          SELECT 1 FROM bed_reservations br2
          WHERE br2.booking_id = bk.id
            AND br2.kind = 'primary'
            AND br2.status = 'completed'
            AND upper(br2.stay_range) IS NOT NULL
            AND upper(br2.stay_range) <= CURRENT_DATE
        )
      LIMIT 100
    `),
  );

  const completed: string[] = [];
  for (const row of candidates) {
    const [updated] = await db
      .update(bookings)
      .set({
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(and(eq(bookings.id, String(row.booking_id)), eq(bookings.status, 'confirmed')))
      .returning({ id: bookings.id, bookingCode: bookings.bookingCode });
    if (updated) {
      completed.push(updated.id);
      await writeAuditLogNonBlocking(db, {
        actorType: 'system',
        actorId: null,
        action: 'health.ended_fixed_stay_booking_completed',
        entity: 'booking',
        entityId: updated.id,
        diff: { bookingCode: updated.bookingCode },
      }).catch(() => undefined);
    }
  }

  return {
    ok: true,
    rowsTouched: completed.length,
    skipped: candidates.length - completed.length,
    diff: { completedBookingIds: completed },
  };
}
export async function cancelEmptySiblingDrafts(input: {
  customerId: string;
  keepBookingId?: string | null;
}): Promise<string[]> {
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.customerId, input.customerId),
        eq(bookings.status, 'draft'),
        sql`${bookings.durationMode}::text IS DISTINCT FROM 'reserve'`,
        input.keepBookingId ? ne(bookings.id, input.keepBookingId) : sql`true`,
      ),
    );

  const cancelled: string[] = [];
  for (const row of rows) {
    const hasMoney = asRows(
      await db.execute(sql`
        SELECT 1 AS x WHERE
          EXISTS (
            SELECT 1 FROM bed_reserve_holds h
            WHERE h.booking_id = ${row.id}::uuid
              AND h.status IN ('pending_payment', 'under_review', 'active')
          )
          OR EXISTS (
            SELECT 1 FROM rent_invoices ri
            WHERE ri.booking_id = ${row.id}::uuid AND ri.status <> 'cancelled'
          )
          OR EXISTS (
            SELECT 1 FROM payments p
            WHERE p.booking_id = ${row.id}::uuid AND p.status = 'succeeded'
          )
        LIMIT 1
      `),
    );
    if (hasMoney.length > 0) continue;

    const [updated] = await db
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason:
          'Auto-cancel empty sibling draft when creating/replacing booking (integrity prevention)',
        updatedAt: new Date(),
      })
      .where(and(eq(bookings.id, row.id), eq(bookings.status, 'draft')))
      .returning({ id: bookings.id });
    if (updated) cancelled.push(updated.id);
  }
  return cancelled;
}
