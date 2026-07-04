/**
 * Production data consistency audit + idempotent repair.
 * Used by CLI scripts, admin pages, and cron routes.
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { actionItems, beds, bookings, checkoutSettlements, pgs, vacatingRequests } from '@/src/db/schema';
import {
  reconstructOccupancyFromBookingHistory,
  type OccupancyReconstructionResult,
} from '@/src/services/occupancyReconstructionRepair';
import { getPgAvailabilitySummaries } from '@/src/services/availabilityService';
import { runBedAudit, repairBedAuditIssue, type BedAuditIssue } from '@/src/services/bedAudit';
import { rebuildOccupancyState } from '@/src/services/occupancyDiagnostics';
import { reconcileOrphanBedReservations } from '@/src/lib/occupancySync';
import { resolveDuplicateBookingPaymentProofs } from '@/src/services/paymentProofReviewCleanup';
import { todayString } from '@/src/lib/dates';

export type PgAvailabilityAuditRow = {
  pgId: string;
  pgName: string;
  slug: string;
  totalBeds: number;
  expectedAvailable: number;
  actualAvailable: number;
  statusOnlyAvailable: number;
  occupiedBeds: number;
  reservedBeds: number;
  maintenanceBeds: number;
  reason: string | null;
};

export type ProductionDataConsistencyReport = {
  generatedAt: string;
  ghostOccupied: Array<{
    bedId: string;
    bedCode: string;
    pgName: string;
    roomNumber: string;
    bedStatus: string;
  }>;
  activeBookingNoOccupancyFlag: Array<{
    bookingId: string;
    bookingCode: string;
    customerName: string;
    pgName: string;
    roomNumber: string;
    bedCode: string;
  }>;
  duplicatePendingPayments: Array<{
    bookingId: string;
    bookingCode: string | null;
    pendingCount: number;
    recordIds: string[];
  }>;
  duplicateActionItems: Array<{
    type: string;
    entityKey: string;
    openCount: number;
    sourceKeys: string[];
  }>;
  orphanReservations: Array<{
    reservationId: string;
    bookingId: string;
    bookingCode: string;
    bookingStatus: string;
    resStatus: string;
    pgName: string | null;
    bedCode: string | null;
  }>;
  missingCheckoutSettlements: Array<{
    bookingId: string;
    bookingCode: string;
    customerName: string;
    vacatingStatus: string | null;
  }>;
  maintenanceMissingMetadata: Array<{
    bedId: string;
    bedCode: string;
    pgName: string;
    roomNumber: string;
    missingFields: string;
  }>;
  bedAuditIssues: BedAuditIssue[];
  pgAvailability: PgAvailabilityAuditRow[];
  issueTotal: number;
};

async function auditGhostOccupied() {
  const rows = await db.execute<{
    bed_id: string;
    bed_code: string;
    pg_name: string;
    room_number: string;
    bed_status: string;
  }>(sql`
    SELECT bd.id::text AS bed_id, bd.bed_code, p.name AS pg_name, r.room_number,
           bd.status::text AS bed_status
    FROM beds bd
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE bd.archived_at IS NULL AND bd.manual_occupied = true
      AND NOT EXISTS (
        SELECT 1 FROM bed_reservations br
        INNER JOIN bookings bk ON bk.id = br.booking_id
        WHERE br.bed_id = bd.id AND br.status = 'active' AND br.kind = 'primary'
          AND bk.status = 'confirmed' AND CURRENT_DATE <@ br.stay_range
      )
    ORDER BY p.name, r.room_number, bd.bed_code
  `);
  return rows.map((r) => ({
    bedId: r.bed_id,
    bedCode: r.bed_code,
    pgName: r.pg_name,
    roomNumber: r.room_number,
    bedStatus: r.bed_status,
  }));
}

async function auditActiveBookingNoFlag() {
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    customer_name: string;
    pg_name: string;
    room_number: string;
    bed_code: string;
  }>(sql`
    SELECT bk.id::text AS booking_id, bk.booking_code, c.full_name AS customer_name,
           p.name AS pg_name, r.room_number, bd.bed_code
    FROM bookings bk
    INNER JOIN customers c ON c.id = bk.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = bk.id
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE bk.status = 'confirmed' AND br.status = 'active' AND br.kind = 'primary'
      AND CURRENT_DATE <@ br.stay_range
      AND bd.manual_occupied = false AND bd.status = 'available'
    ORDER BY p.name, r.room_number, bd.bed_code
  `);
  return rows.map((r) => ({
    bookingId: r.booking_id,
    bookingCode: r.booking_code,
    customerName: r.customer_name,
    pgName: r.pg_name,
    roomNumber: r.room_number,
    bedCode: r.bed_code,
  }));
}

async function auditDuplicatePendingPayments() {
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string | null;
    pending_count: number;
    record_ids: string;
  }>(sql`
    SELECT pr.booking_id::text AS booking_id, bk.booking_code,
           count(*)::int AS pending_count,
           string_agg(pr.id::text, ', ' ORDER BY pr.created_at DESC) AS record_ids
    FROM pg_payment_records pr
    LEFT JOIN bookings bk ON bk.id = pr.booking_id
    WHERE pr.status = 'pending' AND pr.booking_id IS NOT NULL
    GROUP BY pr.booking_id, bk.booking_code
    HAVING count(*) > 1
  `);
  return rows.map((r) => ({
    bookingId: r.booking_id,
    bookingCode: r.booking_code,
    pendingCount: r.pending_count,
    recordIds: r.record_ids.split(', ').filter(Boolean),
  }));
}

async function auditDuplicateActionItems() {
  const rows = await db.execute<{
    type: string;
    entity_key: string;
    open_count: number;
    source_keys: string;
  }>(sql`
    SELECT ai.type::text AS type,
      coalesce(ai.metadata->>'bookingId', ai.metadata->>'settlementId', ai.resident_id::text, ai.bed_id::text, 'unknown') AS entity_key,
      count(*)::int AS open_count,
      string_agg(ai.source_key, ' | ' ORDER BY ai.created_at DESC) AS source_keys
    FROM action_items ai
    WHERE ai.status IN ('open', 'in_progress')
    GROUP BY 1, 2
    HAVING count(*) > 1
    LIMIT 100
  `);
  return rows.map((r) => ({
    type: r.type,
    entityKey: r.entity_key,
    openCount: r.open_count,
    sourceKeys: r.source_keys.split(' | ').filter(Boolean),
  }));
}

async function auditOrphanReservations() {
  const rows = await db.execute<{
    reservation_id: string;
    booking_id: string;
    booking_code: string;
    booking_status: string;
    res_status: string;
    pg_name: string | null;
    bed_code: string | null;
  }>(sql`
    SELECT br.id::text AS reservation_id, bk.id::text AS booking_id, bk.booking_code,
           bk.status::text AS booking_status, br.status::text AS res_status,
           p.name AS pg_name, bd.bed_code
    FROM bed_reservations br
    INNER JOIN bookings bk ON bk.id = br.booking_id
    LEFT JOIN beds bd ON bd.id = br.bed_id
    LEFT JOIN rooms r ON r.id = bd.room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN pgs p ON p.id = f.pg_id
    WHERE br.status IN ('active', 'hold')
      AND bk.status IN ('completed', 'cancelled', 'refunded')
    ORDER BY bk.updated_at DESC
    LIMIT 200
  `);
  return rows.map((r) => ({
    reservationId: r.reservation_id,
    bookingId: r.booking_id,
    bookingCode: r.booking_code,
    bookingStatus: r.booking_status,
    resStatus: r.res_status,
    pgName: r.pg_name,
    bedCode: r.bed_code,
  }));
}

async function auditMissingCheckoutSettlements() {
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    customer_name: string;
    vacating_status: string | null;
  }>(sql`
    SELECT bk.id::text AS booking_id, bk.booking_code, c.full_name AS customer_name,
           vr.status::text AS vacating_status
    FROM bookings bk
    INNER JOIN customers c ON c.id = bk.customer_id
    LEFT JOIN vacating_requests vr ON vr.booking_id = bk.id AND vr.status IN ('approved', 'completed')
    WHERE bk.status = 'completed' AND bk.deposit_paise > 0
      AND NOT EXISTS (
        SELECT 1 FROM checkout_settlements cs
        WHERE cs.booking_id = bk.id AND cs.status <> 'archived'
      )
    ORDER BY bk.updated_at DESC
    LIMIT 100
  `);
  return rows.map((r) => ({
    bookingId: r.booking_id,
    bookingCode: r.booking_code,
    customerName: r.customer_name,
    vacatingStatus: r.vacating_status,
  }));
}

async function auditMaintenanceMissingMetadata() {
  const rows = await db.execute<{
    bed_id: string;
    bed_code: string;
    pg_name: string;
    room_number: string;
    missing_fields: string;
  }>(sql`
    SELECT bd.id::text AS bed_id, bd.bed_code, p.name AS pg_name, r.room_number,
      trim(both ', ' from concat_ws(', ',
        CASE WHEN bd.maintenance_reason IS NULL OR trim(bd.maintenance_reason) = '' THEN 'reason' END,
        CASE WHEN bd.maintenance_started_at IS NULL THEN 'started_at' END
      )) AS missing_fields
    FROM beds bd
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE bd.archived_at IS NULL AND bd.status = 'maintenance'
      AND (bd.maintenance_reason IS NULL OR trim(bd.maintenance_reason) = '' OR bd.maintenance_started_at IS NULL)
  `);
  return rows.map((r) => ({
    bedId: r.bed_id,
    bedCode: r.bed_code,
    pgName: r.pg_name,
    roomNumber: r.room_number,
    missingFields: r.missing_fields,
  }));
}

async function buildPgAvailabilityReport(): Promise<PgAvailabilityAuditRow[]> {
  const pgRows = await db
    .select({ id: pgs.id, name: pgs.name, slug: pgs.slug })
    .from(pgs)
    .where(and(isNull(pgs.archivedAt), eq(pgs.isActive, true)))
    .orderBy(pgs.displayOrder, pgs.name);

  const summaries = await getPgAvailabilitySummaries(pgRows.map((p) => p.id));

  const naiveRows = await db.execute<{
    pg_id: string;
    status_only_available: number;
  }>(sql`
    SELECT f.pg_id::text AS pg_id,
      count(*) filter (where bd.status = 'available')::int AS status_only_available
    FROM beds bd
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    WHERE bd.archived_at IS NULL AND r.archived_at IS NULL AND f.archived_at IS NULL
    GROUP BY f.pg_id
  `);
  const statusOnlyByPg = new Map(naiveRows.map((r) => [r.pg_id, r.status_only_available]));

  return pgRows.map((pg) => {
    const ssot = summaries.get(pg.id);
    const expectedAvailable = ssot?.availableBeds ?? 0;
    const statusOnly = statusOnlyByPg.get(pg.id) ?? 0;
    const reasons: string[] = [];

    if (statusOnly !== expectedAvailable) {
      reasons.push(`status-only (${statusOnly}) ≠ SSOT (${expectedAvailable})`);
    }
    if ((ssot?.maintenanceBeds ?? 0) > 0) {
      reasons.push(`${ssot!.maintenanceBeds} maintenance`);
    }
    if (expectedAvailable === ssot?.totalBeds && (ssot?.occupiedBeds ?? 0) === 0 && ssot.totalBeds > 0) {
      reasons.push('no active reservations — use Mark Fully Occupied or sync bookings');
    }
    if (expectedAvailable === 0 && (ssot?.occupiedBeds ?? 0) > 0) {
      reasons.push('fully occupied per SSOT');
    }

    return {
      pgId: pg.id,
      pgName: pg.name,
      slug: pg.slug,
      totalBeds: ssot?.totalBeds ?? 0,
      expectedAvailable,
      actualAvailable: expectedAvailable,
      statusOnlyAvailable: statusOnly,
      occupiedBeds: ssot?.occupiedBeds ?? 0,
      reservedBeds: ssot?.reservedBeds ?? 0,
      maintenanceBeds: ssot?.maintenanceBeds ?? 0,
      reason: reasons.length > 0 ? reasons.join('; ') : null,
    };
  });
}

export async function runProductionDataConsistencyAudit(): Promise<ProductionDataConsistencyReport> {
  const [
    ghostOccupied,
    activeBookingNoOccupancyFlag,
    duplicatePendingPayments,
    duplicateActionItems,
    orphanReservations,
    missingCheckoutSettlements,
    maintenanceMissingMetadata,
    pgAvailability,
    bedAudit,
  ] = await Promise.all([
    auditGhostOccupied(),
    auditActiveBookingNoFlag(),
    auditDuplicatePendingPayments(),
    auditDuplicateActionItems(),
    auditOrphanReservations(),
    auditMissingCheckoutSettlements(),
    auditMaintenanceMissingMetadata(),
    buildPgAvailabilityReport(),
    runBedAudit(),
  ]);

  const issueTotal =
    ghostOccupied.length +
    activeBookingNoOccupancyFlag.length +
    duplicatePendingPayments.length +
    duplicateActionItems.length +
    orphanReservations.length +
    missingCheckoutSettlements.length +
    maintenanceMissingMetadata.length +
    bedAudit.issues.length;

  return {
    generatedAt: new Date().toISOString(),
    ghostOccupied,
    activeBookingNoOccupancyFlag,
    duplicatePendingPayments,
    duplicateActionItems,
    orphanReservations,
    missingCheckoutSettlements,
    maintenanceMissingMetadata,
    bedAuditIssues: bedAudit.issues,
    pgAvailability,
    issueTotal,
  };
}

export type UnrepairableCheckoutSettlement = {
  bookingId: string;
  bookingCode: string;
  customerName: string;
  reason: string;
};

export type ProductionDataConsistencyRepairResult = {
  ghostCleared: number;
  orphansClosed: number;
  paymentsDeduped: number;
  actionItemsResolved: number;
  maintenanceBackfilled: number;
  checkoutSettlementsCreated: number;
  checkoutSettlementsUnrepairable: UnrepairableCheckoutSettlement[];
  occupancyReconstruction: OccupancyReconstructionResult;
  rebuild: Awaited<ReturnType<typeof rebuildOccupancyState>>;
  tablesUpdated: string[];
  rowsRepaired: number;
};

/** Idempotent — safe to run multiple times. */
export async function runProductionDataConsistencyRepair(
  report: ProductionDataConsistencyReport,
): Promise<ProductionDataConsistencyRepairResult> {
  let ghostCleared = 0;
  for (const issue of report.bedAuditIssues.filter((i) => i.kind === 'ghost_occupied')) {
    const result = await repairBedAuditIssue(issue, 'prod-data-repair');
    if (result.ok) ghostCleared += 1;
  }

  const orphansClosed = await reconcileOrphanBedReservations();

  let paymentsDeduped = 0;
  for (const row of report.duplicatePendingPayments) {
    const keepId = row.recordIds[0];
    if (!keepId) continue;
    paymentsDeduped += await resolveDuplicateBookingPaymentProofs({
      bookingId: row.bookingId,
      keepRecordId: keepId,
      resolution: 'superseded',
    });
  }

  let actionItemsResolved = 0;
  for (const row of report.duplicateActionItems) {
    const [, ...staleKeys] = row.sourceKeys;
    if (staleKeys.length === 0) continue;
    const updated = await db
      .update(actionItems)
      .set({ status: 'resolved', updatedAt: new Date() })
      .where(
        and(
          inArray(actionItems.sourceKey, staleKeys),
          inArray(actionItems.status, ['open', 'in_progress']),
        ),
      )
      .returning({ id: actionItems.id });
    actionItemsResolved += updated.length;
  }

  let maintenanceBackfilled = 0;
  for (const row of report.maintenanceMissingMetadata) {
    const [current] = await db
      .select({
        maintenanceReason: beds.maintenanceReason,
        maintenanceReasonCustom: beds.maintenanceReasonCustom,
        maintenanceStartedAt: beds.maintenanceStartedAt,
      })
      .from(beds)
      .where(eq(beds.id, row.bedId))
      .limit(1);
    if (!current) continue;
    await db
      .update(beds)
      .set({
        maintenanceReason: current.maintenanceReason?.trim() ? current.maintenanceReason : 'other',
        maintenanceReasonCustom: current.maintenanceReasonCustom?.trim()
          ? current.maintenanceReasonCustom
          : 'Legacy maintenance — backfilled by audit',
        maintenanceStartedAt: current.maintenanceStartedAt ?? todayString(),
        updatedAt: new Date(),
      })
      .where(eq(beds.id, row.bedId));
    maintenanceBackfilled += 1;
  }

  const occupancyReconstruction = await reconstructOccupancyFromBookingHistory();

  const rebuild = await rebuildOccupancyState();

  let checkoutSettlementsCreated = 0;
  const checkoutSettlementsUnrepairable: UnrepairableCheckoutSettlement[] = [];
  const {
    createCheckoutSettlementFromVacating,
    ensureCheckoutSettlementForBooking,
  } = await import('@/src/services/checkoutSettlement');
  for (const row of report.missingCheckoutSettlements) {
    const [archivedSettlement] = await db
      .select({ id: checkoutSettlements.id })
      .from(checkoutSettlements)
      .where(
        and(
          eq(checkoutSettlements.bookingId, row.bookingId),
          eq(checkoutSettlements.status, 'archived'),
        ),
      )
      .orderBy(desc(checkoutSettlements.updatedAt))
      .limit(1);

    if (archivedSettlement) {
      const reactivated = await db
        .update(checkoutSettlements)
        .set({ status: 'awaiting_resident_details', updatedAt: new Date() })
        .where(
          and(
            eq(checkoutSettlements.id, archivedSettlement.id),
            eq(checkoutSettlements.status, 'archived'),
          ),
        )
        .returning({ id: checkoutSettlements.id });
      if (reactivated.length > 0) {
        checkoutSettlementsCreated += 1;
        continue;
      }
    }

    const [vacating] = await db
      .select({ id: vacatingRequests.id, status: vacatingRequests.status })
      .from(vacatingRequests)
      .where(
        and(
          eq(vacatingRequests.bookingId, row.bookingId),
          inArray(vacatingRequests.status, ['approved', 'completed']),
        ),
      )
      .orderBy(desc(vacatingRequests.updatedAt))
      .limit(1);

    if (vacating) {
      try {
        if (vacating.status === 'completed' || vacating.status === 'approved') {
          await db
            .update(vacatingRequests)
            .set({ checkoutSettlementSuppressed: false, updatedAt: new Date() })
            .where(
              and(
                eq(vacatingRequests.id, vacating.id),
                eq(vacatingRequests.checkoutSettlementSuppressed, true),
              ),
            );
        }
        const created = await createCheckoutSettlementFromVacating({
          vacatingRequestId: vacating.id,
          checkoutSource:
            vacating.status === 'completed' ? 'admin_force_checkout' : 'resident_vacating',
        });
        if (created.ok) {
          checkoutSettlementsCreated += 1;
        } else {
          checkoutSettlementsUnrepairable.push({
            bookingId: row.bookingId,
            bookingCode: row.bookingCode,
            customerName: row.customerName,
            reason: created.error,
          });
        }
      } catch (err) {
        checkoutSettlementsUnrepairable.push({
          bookingId: row.bookingId,
          bookingCode: row.bookingCode,
          customerName: row.customerName,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    const [booking] = await db
      .select({ customerId: bookings.customerId })
      .from(bookings)
      .where(eq(bookings.id, row.bookingId))
      .limit(1);
    if (!booking) {
      checkoutSettlementsUnrepairable.push({
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        customerName: row.customerName,
        reason: 'Booking row not found',
      });
      continue;
    }

    try {
      const ensured = await ensureCheckoutSettlementForBooking({
        bookingId: row.bookingId,
        customerId: booking.customerId,
      });
      if (ensured.ok) {
        checkoutSettlementsCreated += 1;
      } else {
        checkoutSettlementsUnrepairable.push({
          bookingId: row.bookingId,
          bookingCode: row.bookingCode,
          customerName: row.customerName,
          reason: ensured.error,
        });
      }
    } catch (err) {
      checkoutSettlementsUnrepairable.push({
        bookingId: row.bookingId,
        bookingCode: row.bookingCode,
        customerName: row.customerName,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const tablesUpdated = [
    ...(ghostCleared > 0 ? ['beds'] : []),
    ...(orphansClosed > 0 ? ['bed_reservations'] : []),
    ...(paymentsDeduped > 0 ? ['pg_payment_records'] : []),
    ...(actionItemsResolved > 0 ? ['action_items'] : []),
    ...(maintenanceBackfilled > 0 ? ['beds'] : []),
    ...(checkoutSettlementsCreated > 0 ? ['checkout_settlements'] : []),
    ...(occupancyReconstruction.reservationsReactivated > 0 ||
    occupancyReconstruction.stayRangesExtended > 0
      ? ['bed_reservations']
      : []),
    ...(occupancyReconstruction.manualFlagsCleared > 0 ? ['beds'] : []),
    ...(occupancyReconstruction.bookingsReconciled > 0 ||
    rebuild.bookingsReconciled > 0 ||
    rebuild.residencyStatusSynced > 0
      ? ['beds', 'customers']
      : []),
    ...(rebuild.orphanReservationsClosed > 0 ? ['bed_reservations'] : []),
  ];

  const rowsRepaired =
    ghostCleared +
    orphansClosed +
    paymentsDeduped +
    actionItemsResolved +
    maintenanceBackfilled +
    checkoutSettlementsCreated +
    occupancyReconstruction.reservationsReactivated +
    occupancyReconstruction.stayRangesExtended +
    occupancyReconstruction.manualFlagsCleared +
    occupancyReconstruction.bookingsReconciled +
    rebuild.orphanReservationsClosed +
    rebuild.bookingsReconciled +
    rebuild.residencyStatusSynced +
    rebuild.residencyStatusDemoted;

  return {
    ghostCleared,
    orphansClosed,
    paymentsDeduped,
    actionItemsResolved,
    maintenanceBackfilled,
    checkoutSettlementsCreated,
    checkoutSettlementsUnrepairable,
    occupancyReconstruction,
    rebuild,
    tablesUpdated: [...new Set(tablesUpdated)],
    rowsRepaired,
  };
}

export function formatProductionDataConsistencyReport(report: ProductionDataConsistencyReport): string {
  const lines: string[] = [];
  lines.push('# Production Data Consistency Audit');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## PG Availability');
  lines.push('| PG | Expected Available | Actual Available | Reason |');
  lines.push('|----|-------------------:|-----------------:|--------|');
  for (const row of report.pgAvailability) {
    lines.push(
      `| ${row.pgName} | ${row.expectedAvailable} | ${row.actualAvailable} | ${row.reason ?? 'OK'} |`,
    );
  }
  lines.push('');
  lines.push(`## Summary: ${report.issueTotal} issue rows`);
  lines.push(`- Ghost manual_occupied: ${report.ghostOccupied.length}`);
  lines.push(`- Active booking, bed not flagged: ${report.activeBookingNoOccupancyFlag.length}`);
  lines.push(`- Duplicate pending payments: ${report.duplicatePendingPayments.length}`);
  lines.push(`- Duplicate action items: ${report.duplicateActionItems.length}`);
  lines.push(`- Orphan reservations: ${report.orphanReservations.length}`);
  lines.push(`- Missing checkout settlements: ${report.missingCheckoutSettlements.length}`);
  lines.push(`- Maintenance missing metadata: ${report.maintenanceMissingMetadata.length}`);
  lines.push(`- Bed audit issues: ${report.bedAuditIssues.length}`);
  return lines.join('\n');
}
