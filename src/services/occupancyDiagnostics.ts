/**
 * Admin occupancy audit and repair — bed_reservations SSOT.
 */

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/src/db/client';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { isNotOccupancyPlaceholderCustomerSql } from '@/src/lib/occupancySqlFilters';
import { revalidateOccupancyViews } from '@/src/lib/occupancyRevalidate';
import { reconcileBookingOccupancy, reconcileOrphanBedReservations } from '@/src/lib/occupancySync';
import {
  occupancyReservationCoreSql_b,
  adminAssignedReservationSql_b,
  bedOccupiedTodayExistsSql,
} from '@/src/lib/occupancySsot';
import { deriveTenancyStatus } from '@/src/lib/residentActiveTenancy';
import { customerIsVerifiedSql } from '@/src/lib/residentVerification';
import { runBedAudit, type BedAuditIssue } from '@/src/services/bedAudit';

export type OccupancyAuditRow = {
  residentName: string;
  customerId: string;
  bookingId: string | null;
  bedReservationId: string | null;
  bedLabel: string | null;
  residentsPageStatus: 'assigned' | 'unassigned' | 'vacating' | 'vacated';
  bedMapStatus: 'assigned' | 'unassigned';
  mismatch: boolean;
  mismatchReason: string | null;
};

export type OccupancyRebuildResult = {
  orphanReservationsClosed: number;
  bookingsReconciled: number;
  residencyStatusSynced: number;
  residencyStatusDemoted: number;
};

export type OccupancyRepairPreview = {
  mismatchCountBefore: number;
  residentMismatchRows: OccupancyAuditRow[];
  bedAuditIssues: BedAuditIssue[];
  bedAuditIssueCount: number;
  rebuild: OccupancyRebuildResult;
  summary: ReturnType<typeof summarizeOccupancyAudit>;
};

export type OccupancyRepairExecuteResult = OccupancyRebuildResult & {
  mismatchCountBefore: number;
  mismatchCountAfter: number;
  repairedCount: number;
  remainingCount: number;
  bedAuditIssueCountBefore: number;
  bedAuditIssueCountAfter: number;
};

type AuditDbRow = {
  customer_id: string;
  full_name: string;
  residency_status: string;
  booking_id: string | null;
  bed_reservation_id: string | null;
  pg_id: string | null;
  pg_name: string | null;
  room_number: string | null;
  bed_code: string | null;
  is_vacating: boolean;
  has_placeholder_booking_notes: boolean;
  occupied_today: boolean;
};

export async function auditOccupancyMismatches(
  session: AdminSession,
): Promise<OccupancyAuditRow[]> {
  const rows = await db.execute<AuditDbRow>(sql`
    SELECT
      c.id::text AS customer_id,
      c.full_name,
      c.residency_status::text AS residency_status,
      assigned.booking_id,
      assigned.bed_reservation_id,
      assigned.pg_id,
      assigned.pg_name,
      assigned.room_number,
      assigned.bed_code,
      coalesce(assigned.is_vacating, false) AS is_vacating,
      coalesce(assigned.has_placeholder_booking_notes, false) AS has_placeholder_booking_notes,
      coalesce(today.booking_id IS NOT NULL, false) AS occupied_today
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT
        b.id::text AS booking_id,
        br.id::text AS bed_reservation_id,
        f.pg_id::text AS pg_id,
        p.name AS pg_name,
        r.room_number,
        bd.bed_code,
        EXISTS (
          SELECT 1 FROM vacating_requests vr
          WHERE vr.booking_id = b.id
            AND vr.status IN ('pending', 'approved')
        ) AS is_vacating,
        (
          b.notes ILIKE '%occupancy placeholder%'
          OR b.notes ILIKE '%Full occupancy marker%'
          OR b.notes ILIKE '%full occupancy%'
          OR b.pricing_snapshot::text ILIKE '%Occupancy placeholder%'
        ) AS has_placeholder_booking_notes
      FROM bookings b
      INNER JOIN bed_reservations br ON br.booking_id = b.id
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      INNER JOIN floors f ON f.id = r.floor_id
      INNER JOIN pgs p ON p.id = f.pg_id
      WHERE b.customer_id = c.id
        AND ${adminAssignedReservationSql_b}
      ORDER BY
        (CURRENT_DATE <@ br.stay_range) DESC,
        lower(br.stay_range) DESC
      LIMIT 1
    ) assigned ON true
    LEFT JOIN LATERAL (
      SELECT b.id::text AS booking_id
      FROM bookings b
      INNER JOIN bed_reservations br ON br.booking_id = b.id
      WHERE b.customer_id = c.id
        AND ${occupancyReservationCoreSql_b}
      LIMIT 1
    ) today ON true
    WHERE c.archived_at IS NULL
      AND ${isNotOccupancyPlaceholderCustomerSql}
      AND ${customerIsVerifiedSql}
    ORDER BY c.full_name ASC
  `);

  return Array.from(rows)
    .filter(
      (row) =>
        !row.pg_id ||
        adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pg_id),
    )
    .map((row) => {
      const residentsAssigned = row.booking_id != null;
      const occupiedToday = row.occupied_today;
      const derived = deriveTenancyStatus({
        residencyStatus: row.residency_status as 'active' | 'vacated' | 'blocked',
        activeTenancy: row.booking_id
          ? { bookingId: row.booking_id, isVacating: row.is_vacating }
          : null,
      });

      const residentsPageStatus: OccupancyAuditRow['residentsPageStatus'] =
        derived === 'vacating'
          ? 'vacating'
          : derived === 'active'
            ? 'assigned'
            : derived === 'vacated'
              ? 'vacated'
              : 'unassigned';

      const bedMapStatus: 'assigned' | 'unassigned' =
        residentsAssigned || occupiedToday ? 'assigned' : 'unassigned';
      const residentsShowsAssigned =
        residentsPageStatus === 'assigned' || residentsPageStatus === 'vacating';

      let mismatch = false;
      let mismatchReason: string | null = null;

      if (occupiedToday && !residentsShowsAssigned) {
        mismatch = true;
        mismatchReason = 'Bed occupied today but Residents shows unassigned';
      } else if (residentsShowsAssigned && !residentsAssigned) {
        mismatch = true;
        mismatchReason = 'Residents shows assigned but no primary reservation (today or upcoming)';
      } else if (residentsAssigned && !residentsShowsAssigned) {
        mismatch = true;
        mismatchReason = row.has_placeholder_booking_notes
          ? 'Reservation exists but booking has occupancy-placeholder markers'
          : 'Reservation exists but Residents tenancy status is not assigned';
      }

      const bedLabel =
        row.pg_name && row.room_number && row.bed_code
          ? `${row.pg_name} · Room ${row.room_number} · ${row.bed_code}`
          : null;

      return {
        residentName: row.full_name,
        customerId: row.customer_id,
        bookingId: row.booking_id,
        bedReservationId: row.bed_reservation_id,
        bedLabel,
        residentsPageStatus,
        bedMapStatus,
        mismatch,
        mismatchReason,
      };
    })
    .filter((row) => row.mismatch || row.bedMapStatus === 'assigned');
}

export async function previewOccupancyRepair(
  session: AdminSession,
): Promise<OccupancyRepairPreview> {
  const [residentMismatchRows, bedAuditReport, rebuild] = await Promise.all([
    auditOccupancyMismatches(session),
    runBedAudit(),
    previewRebuildOccupancyState(),
  ]);
  const bedAuditIssues = bedAuditReport.issues;
  const summary = summarizeOccupancyAudit(residentMismatchRows);
  return {
    mismatchCountBefore: summary.mismatchCount,
    residentMismatchRows,
    bedAuditIssues,
    bedAuditIssueCount: bedAuditIssues.length,
    rebuild,
    summary,
  };
}

/** Preview rebuild — counts only, no writes. */
export async function previewRebuildOccupancyState(): Promise<OccupancyRebuildResult> {
  const orphanRows = await db.execute<{ id: string }>(sql`
    SELECT br.id::text AS id
    FROM bed_reservations br
    INNER JOIN bookings bk ON bk.id = br.booking_id
    WHERE br.status IN ('hold', 'active')
      AND bk.status IN ('completed', 'cancelled', 'refunded')
  `);
  const orphanReservationsClosed = Array.isArray(orphanRows) ? orphanRows.length : 0;

  const bookingRows = await db.execute<{ booking_id: string }>(sql`
    SELECT DISTINCT b.id::text AS booking_id
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id
    WHERE b.status = 'confirmed'
      AND br.status IN ('active', 'hold')
  `);
  const bookingsReconciled = Array.isArray(bookingRows) ? bookingRows.length : 0;

  const syncRows = await db.execute<{ id: string }>(sql`
    SELECT c.id::text AS id
    FROM customers c
    WHERE c.archived_at IS NULL
      AND c.residency_status NOT IN ('active', 'blocked')
      AND EXISTS (
        SELECT 1
        FROM bookings b
        INNER JOIN bed_reservations br ON br.booking_id = b.id
        WHERE b.customer_id = c.id
          AND ${adminAssignedReservationSql_b}
      )
  `);
  const residencyStatusSynced = Array.isArray(syncRows) ? syncRows.length : 0;

  const demoteRows = await db.execute<{ id: string }>(sql`
    SELECT c.id::text AS id
    FROM customers c
    WHERE c.archived_at IS NULL
      AND c.residency_status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM bookings b
        INNER JOIN bed_reservations br ON br.booking_id = b.id
        WHERE b.customer_id = c.id
          AND ${adminAssignedReservationSql_b}
      )
  `);
  const residencyStatusDemoted = Array.isArray(demoteRows) ? demoteRows.length : 0;

  return {
    orphanReservationsClosed,
    bookingsReconciled,
    residencyStatusSynced,
    residencyStatusDemoted,
  };
}

/** Reconcile reservations and residency flags — does not create bookings or reservations. */
export async function rebuildOccupancyState(): Promise<OccupancyRebuildResult> {
  const orphanReservationsClosed = await reconcileOrphanBedReservations();

  const bookingRows = await db.execute<{ booking_id: string }>(sql`
    SELECT DISTINCT b.id::text AS booking_id
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id
    WHERE b.status = 'confirmed'
      AND br.status IN ('active', 'hold')
  `);

  let bookingsReconciled = 0;
  for (const row of Array.from(bookingRows)) {
    await reconcileBookingOccupancy(row.booking_id, { revalidate: false });
    bookingsReconciled += 1;
  }

  const synced = await db.execute<{ id: string }>(sql`
    UPDATE customers c
    SET residency_status = 'active', updated_at = now()
    WHERE c.archived_at IS NULL
      AND c.residency_status NOT IN ('active', 'blocked')
      AND EXISTS (
        SELECT 1
        FROM bookings b
        INNER JOIN bed_reservations br ON br.booking_id = b.id
        WHERE b.customer_id = c.id
          AND ${adminAssignedReservationSql_b}
      )
    RETURNING c.id::text AS id
  `);
  const residencyStatusSynced = Array.isArray(synced) ? synced.length : 0;

  const demoted = await db.execute<{ id: string }>(sql`
    UPDATE customers c
    SET residency_status = 'vacated', updated_at = now()
    WHERE c.archived_at IS NULL
      AND c.residency_status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM bookings b
        INNER JOIN bed_reservations br ON br.booking_id = b.id
        WHERE b.customer_id = c.id
          AND ${adminAssignedReservationSql_b}
      )
    RETURNING c.id::text AS id
  `);
  const residencyStatusDemoted = Array.isArray(demoted) ? demoted.length : 0;

  await revalidateOccupancyViews();
  try {
    revalidatePath('/admin/residents', 'layout');
    revalidatePath('/admin/pgs', 'layout');
    revalidatePath('/admin/overview', 'layout');
    revalidatePath('/admin/operations', 'layout');
    revalidatePath('/admin/settings', 'layout');
  } catch {
    // No-op outside Next.js request context (CLI repair scripts).
  }

  return {
    orphanReservationsClosed,
    bookingsReconciled,
    residencyStatusSynced,
    residencyStatusDemoted,
  };
}

export async function executeOccupancyRepair(
  session: AdminSession,
): Promise<OccupancyRepairExecuteResult> {
  const before = await previewOccupancyRepair(session);
  const rebuild = await rebuildOccupancyState();
  const afterRows = await auditOccupancyMismatches(session);
  const afterBedIssues = (await runBedAudit()).issues;
  const afterSummary = summarizeOccupancyAudit(afterRows);

  return {
    ...rebuild,
    mismatchCountBefore: before.mismatchCountBefore,
    mismatchCountAfter: afterSummary.mismatchCount,
    repairedCount: Math.max(0, before.mismatchCountBefore - afterSummary.mismatchCount),
    remainingCount: afterSummary.mismatchCount,
    bedAuditIssueCountBefore: before.bedAuditIssueCount,
    bedAuditIssueCountAfter: afterBedIssues.length,
  };
}

export function summarizeOccupancyAudit(rows: OccupancyAuditRow[]): {
  totalScanned: number;
  mismatchCount: number;
  bedMapAssignedCount: number;
  residentsUnassignedCount: number;
  occupiedTodayUnassignedCount: number;
} {
  const mismatches = rows.filter((r) => r.mismatch);
  return {
    totalScanned: rows.length,
    mismatchCount: mismatches.length,
    bedMapAssignedCount: rows.filter((r) => r.bedMapStatus === 'assigned').length,
    residentsUnassignedCount: rows.filter(
      (r) => r.bedMapStatus === 'assigned' && r.residentsPageStatus === 'unassigned',
    ).length,
    occupiedTodayUnassignedCount: rows.filter((r) =>
      Boolean(r.mismatchReason?.includes('Bed occupied today')),
    ).length,
  };
}

/** Dashboard vs bed-map occupied bed count — must match SSOT. */
export async function countOccupiedBedsSsot(): Promise<number> {
  const rows = await db.execute<{ count: number }>(sql`
    SELECT count(*)::int AS count
    FROM beds
    WHERE beds.archived_at IS NULL
      AND ${bedOccupiedTodayExistsSql}
  `);
  return rows[0]?.count ?? 0;
}
