import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  actionItems,
  beds,
  bedReservations,
  bookings,
  customers,
  checkoutSettlements,
  depositLedger,
  electricityInvoices,
  floors,
  kycSubmissions,
  pgPaymentCategories,
  pgs,
  rentInvoices,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import type { ActionItem } from '@/src/db/schema/actionItems';

type ActionItemType = ActionItem['type'];
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import type { ActionItemMetadata } from '@/src/lib/actionCenter/constants';
import { todayString } from '@/src/lib/dates';
import { formatPgDisplayName } from '@/src/lib/operationsCenterRules';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import { resolveStalePaymentReviewArtifacts } from '@/src/services/paymentReviewIntegrity';
import { projectElectricityInvoice } from '@/src/services/electricityBilling';
import { projectInvoice } from '@/src/services/rentInvoices';
import { syncResidentRequestActionItems } from '@/src/services/residentRequestActions';
import { syncAdminNotificationsFromActionItems } from '@/src/services/adminNotifications';
import { resolveStaleVacatingActionItems } from '@/src/services/vacatingPastDue';
import { resolveFixedStayCheckoutActionItems } from '@/src/services/fixedStayActionItems';
import { resolveStaleKycActionItems,
  syncUnresolvedActionsFromDomain,
} from '@/src/services/unresolvedActionSync';
import { repairTerminalCheckoutOperations } from '@/src/services/terminalCheckoutOperationsRepair';
import { resolveAction } from '@/src/services/unresolvedActions';
import { diffDays, formatDate, tryDiffDays } from '@/src/lib/dates';

export type ActionItemRow = {
  id: string;
  type: ActionItemType;
  title: string;
  pgId: string;
  roomId: string | null;
  bedId: string | null;
  residentId: string | null;
  amount: number | null;
  dueDate: string | null;
  status: 'open' | 'in_progress' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  sourceKey: string;
  metadata: ActionItemMetadata;
  createdAt: Date;
  pgName: string;
  residentName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
};

export type ActionItemDetail = ActionItemRow & {
  residentPhone: string | null;
  residentEmail: string | null;
  ledgerEntries: Array<{
    id: string;
    label: string;
    amountPaise: number;
    date: string;
    kind: string;
  }>;
  availableActions: Array<{
    type: string;
    label: string;
    href?: string;
  }>;
};

type UpsertInput = {
  type: ActionItemType;
  title: string;
  pgId: string;
  roomId?: string | null;
  bedId?: string | null;
  residentId?: string | null;
  amount?: number | null;
  dueDate?: string | null;
  priority: 'low' | 'medium' | 'high';
  sourceKey: string;
  metadata?: ActionItemMetadata;
};

function sessionCanAccessPg(session: AdminSession, pgId: string): boolean {
  return adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId);
}

async function upsertActionItem(input: UpsertInput): Promise<void> {
  await db
    .insert(actionItems)
    .values({
      type: input.type,
      title: input.title,
      pgId: input.pgId,
      roomId: input.roomId ?? null,
      bedId: input.bedId ?? null,
      residentId: input.residentId ?? null,
      amount: input.amount ?? null,
      dueDate: input.dueDate ?? null,
      priority: input.priority,
      sourceKey: input.sourceKey,
      metadata: input.metadata ?? {},
      status: 'open',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: actionItems.sourceKey,
      set: {
        title: input.title,
        amount: input.amount ?? null,
        dueDate: input.dueDate ?? null,
        priority: input.priority,
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
      },
      where: sql`${actionItems.status} != 'resolved'`,
    });
}

/** Drop open billing tasks when the underlying invoice is no longer due. */
export async function resolveStaleBillingActionItems(): Promise<{ resolved: number }> {
  const rentRows = await db.execute<{ id: string }>(sql`
    UPDATE action_items ai
    SET status = 'resolved', updated_at = now()
    WHERE ai.type = 'rent_due'
      AND ai.status IN ('open', 'in_progress')
      AND NOT EXISTS (
        SELECT 1 FROM rent_invoices ri
        WHERE ai.source_key = 'rent:' || ri.id::text
          AND ri.status IN ('pending', 'overdue')
      )
    RETURNING ai.id
  `);

  const elecRows = await db.execute<{ id: string }>(sql`
    UPDATE action_items ai
    SET status = 'resolved', updated_at = now()
    WHERE ai.type = 'electricity_due'
      AND ai.status IN ('open', 'in_progress')
      AND NOT EXISTS (
        SELECT 1 FROM electricity_invoices ei
        WHERE ai.source_key = 'electricity:' || ei.id::text
          AND ei.status = 'pending'
      )
    RETURNING ai.id
  `);

  return { resolved: rentRows.length + elecRows.length };
}

async function archiveNotificationsWithoutOpenTasks(): Promise<void> {
  await db.execute(sql`
    UPDATE admin_notification_states ans
    SET state = 'archived', archived_at = now(), updated_at = now()
    FROM admin_notifications an
    WHERE ans.notification_id = an.id
      AND ans.state IN ('unread', 'read')
      AND NOT EXISTS (
        SELECT 1 FROM action_items ai
        WHERE ai.source_key = an.source_key
          AND ai.status IN ('open', 'in_progress')
      )
  `);
}

async function syncRentDue(session: AdminSession): Promise<void> {
  const rows = await db
    .select({
      invoice: rentInvoices,
      pgId: rentInvoices.pgId,
      bedId: rentInvoices.bedId,
      roomId: rooms.id,
      residentId: rentInvoices.customerId,
      pgName: pgs.name,
      residentName: customers.fullName,
      residentPhone: customers.phone,
      residentEmail: customers.email,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      bookingId: rentInvoices.bookingId,
    })
    .from(rentInvoices)
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, rentInvoices.pgId))
    .innerJoin(beds, eq(beds.id, rentInvoices.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(inArray(rentInvoices.status, ['pending', 'overdue']));

  for (const row of rows) {
    if (!sessionCanAccessPg(session, row.pgId)) continue;
    const projected = projectInvoice(row.invoice);
    if (projected.outstandingPaise <= 0) continue;
    const isOverdue = projected.effectiveStatus === 'overdue';
    await upsertActionItem({
      type: 'rent_due',
      title: `${row.residentName} · Rent ${isOverdue ? 'overdue' : 'due'}`,
      pgId: row.pgId,
      roomId: row.roomId,
      bedId: row.bedId,
      residentId: row.residentId,
      amount: projected.outstandingPaise,
      dueDate: row.invoice.dueDate,
      priority: isOverdue ? 'high' : 'medium',
      sourceKey: `rent:${row.invoice.id}`,
      metadata: {
        residentName: row.residentName,
        residentPhone: row.residentPhone,
        residentEmail: row.residentEmail,
        pgName: formatPgDisplayName(row.pgName),
        roomNumber: row.roomNumber,
        bedCode: row.bedCode,
        bookingId: row.bookingId,
        invoiceId: row.invoice.id,
        isOverdue,
        billingMonth: row.invoice.billingMonth,
      },
    });
  }
}

async function syncElectricityDue(session: AdminSession): Promise<void> {
  const today = todayString();
  const rows = await db
    .select({
      invoice: electricityInvoices,
      pgId: floors.pgId,
      pgName: pgs.name,
      residentName: customers.fullName,
      residentPhone: customers.phone,
      residentEmail: customers.email,
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      bookingId: electricityInvoices.bookingId,
    })
    .from(electricityInvoices)
    .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(beds, eq(beds.id, electricityInvoices.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(electricityInvoices.status, 'pending'));

  for (const row of rows) {
    if (!sessionCanAccessPg(session, row.pgId)) continue;
    const projected = projectElectricityInvoice(row.invoice, today);
    if (projected.outstandingPaise <= 0) continue;
    const isOverdue = projected.effectiveStatus === 'overdue';
    await upsertActionItem({
      type: 'electricity_due',
      title: `${row.residentName} · Electricity ${isOverdue ? 'overdue' : 'due'}`,
      pgId: row.pgId,
      roomId: row.roomId,
      bedId: row.invoice.bedId,
      residentId: row.invoice.customerId,
      amount: projected.outstandingPaise,
      dueDate: row.invoice.dueDate,
      priority: isOverdue ? 'high' : 'medium',
      sourceKey: `electricity:${row.invoice.id}`,
      metadata: {
        residentName: row.residentName,
        residentPhone: row.residentPhone,
        residentEmail: row.residentEmail,
        pgName: formatPgDisplayName(row.pgName),
        roomNumber: row.roomNumber,
        bedCode: row.bedCode,
        bookingId: row.bookingId,
        invoiceId: row.invoice.id,
        isOverdue,
        billingMonth: row.invoice.billingMonth,
      },
    });
  }
}

async function resolvePgContextForCustomer(
  customerId: string,
): Promise<{ pgId: string; pgName: string; roomId: string | null; bedId: string | null; roomNumber: string | null; bedCode: string | null } | null> {
  const assigned = await db.execute<{
    pg_id: string;
    pg_name: string;
    room_id: string | null;
    bed_id: string | null;
    room_number: string | null;
    bed_code: string | null;
  }>(sql`
    SELECT
      f.pg_id::text AS pg_id,
      p.name AS pg_name,
      r.id::text AS room_id,
      bd.id::text AS bed_id,
      r.room_number,
      bd.bed_code
    FROM bookings b
    INNER JOIN bed_reservations br
      ON br.booking_id = b.id
      AND br.kind = 'primary'
      AND br.status = 'active'
      AND CURRENT_DATE <@ br.stay_range
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE b.customer_id = ${customerId}::uuid
      AND b.status = 'confirmed'
    ORDER BY lower(br.stay_range) DESC
    LIMIT 1
  `);
  if (assigned[0]?.pg_id) {
    return {
      pgId: assigned[0].pg_id,
      pgName: assigned[0].pg_name,
      roomId: assigned[0].room_id,
      bedId: assigned[0].bed_id,
      roomNumber: assigned[0].room_number,
      bedCode: assigned[0].bed_code,
    };
  }

  const fromBooking = await db.execute<{ pg_id: string; pg_name: string }>(sql`
    SELECT DISTINCT f.pg_id::text AS pg_id, p.name AS pg_name
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id
    INNER JOIN beds bd ON bd.id = br.bed_id
    INNER JOIN rooms r ON r.id = bd.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE b.customer_id = ${customerId}::uuid
    LIMIT 1
  `);
  if (fromBooking[0]?.pg_id) {
    return {
      pgId: fromBooking[0].pg_id,
      pgName: fromBooking[0].pg_name,
      roomId: null,
      bedId: null,
      roomNumber: null,
      bedCode: null,
    };
  }

  const [fallbackPg] = await db
    .select({ id: pgs.id, name: pgs.name })
    .from(pgs)
    .where(eq(pgs.isActive, true))
    .orderBy(pgs.name)
    .limit(1);
  if (!fallbackPg) return null;

  return {
    pgId: fallbackPg.id,
    pgName: fallbackPg.name,
    roomId: null,
    bedId: null,
    roomNumber: null,
    bedCode: null,
  };
}

async function syncKycPending(session: AdminSession): Promise<void> {
  const rows = await db
    .select({
      id: kycSubmissions.id,
      residentId: kycSubmissions.customerId,
      pgId: floors.pgId,
      pgName: pgs.name,
      residentName: customers.fullName,
      residentPhone: customers.phone,
      residentEmail: customers.email,
      roomId: rooms.id,
      bedId: beds.id,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      createdAt: kycSubmissions.createdAt,
    })
    .from(kycSubmissions)
    .innerJoin(customers, eq(customers.id, kycSubmissions.customerId))
    .leftJoin(bookings, eq(bookings.id, kycSubmissions.bookingId))
    .leftJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .leftJoin(beds, eq(beds.id, bedReservations.bedId))
    .leftJoin(rooms, eq(rooms.id, beds.roomId))
    .leftJoin(floors, eq(floors.id, rooms.floorId))
    .leftJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(kycSubmissions.status, 'pending'));

  const today = todayString();
  for (const row of rows) {
    let pgId = row.pgId;
    let pgName = row.pgName;
    let roomId = row.roomId;
    let bedId = row.bedId;
    let roomNumber = row.roomNumber;
    let bedCode = row.bedCode;
    let notifyAllAdmins = false;

    if (!pgId) {
      const resolved = await resolvePgContextForCustomer(row.residentId);
      if (!resolved) continue;
      pgId = resolved.pgId;
      pgName = resolved.pgName;
      roomId = resolved.roomId;
      bedId = resolved.bedId;
      roomNumber = resolved.roomNumber;
      bedCode = resolved.bedCode;
      notifyAllAdmins = !resolved.roomId;
    }

    if (!sessionCanAccessPg(session, pgId)) continue;
    const daysWaiting = Math.max(0, diffDays(formatDate(row.createdAt), today));
    await upsertActionItem({
      type: 'kyc_pending',
      title: `New KYC uploaded by ${row.residentName}`,
      pgId,
      roomId,
      bedId,
      residentId: row.residentId,
      priority: daysWaiting >= 3 ? 'high' : daysWaiting >= 1 ? 'medium' : 'low',
      sourceKey: `kyc:${row.id}`,
      metadata: {
        residentName: row.residentName,
        residentPhone: row.residentPhone,
        residentEmail: row.residentEmail,
        pgName: pgName ? formatPgDisplayName(pgName) : 'Unassigned',
        roomNumber: roomNumber ?? undefined,
        bedCode: bedCode ?? undefined,
        submissionId: row.id,
        notifyAllAdmins,
      },
    });
  }
}

async function syncVacatingAlerts(session: AdminSession): Promise<void> {
  const today = todayString();
  /** LEFT JOIN bed location — INNER JOIN dropped pending rows when primary reservation was missing. */
  const rows = await db.execute<{
    id: string;
    pg_id: string | null;
    pg_name: string | null;
    resident_id: string;
    resident_name: string;
    resident_phone: string | null;
    resident_email: string | null;
    room_id: string | null;
    bed_id: string | null;
    room_number: string | null;
    bed_code: string | null;
    vacating_date: string;
    vacating_status: 'pending' | 'approved';
    booking_id: string;
    settlement_id: string | null;
  }>(sql`
    SELECT
      vr.id,
      loc.pg_id,
      loc.pg_name,
      vr.customer_id AS resident_id,
      c.full_name AS resident_name,
      c.phone AS resident_phone,
      c.email AS resident_email,
      loc.room_id,
      loc.bed_id,
      loc.room_number,
      loc.bed_code,
      vr.vacating_date::text AS vacating_date,
      vr.status AS vacating_status,
      vr.booking_id,
      cs.id AS settlement_id
    FROM vacating_requests vr
    INNER JOIN bookings b ON b.id = vr.booking_id
    INNER JOIN customers c ON c.id = vr.customer_id
    LEFT JOIN LATERAL (
      SELECT
        p.id AS pg_id,
        p.name AS pg_name,
        r.id AS room_id,
        bd.id AS bed_id,
        r.room_number,
        bd.bed_code
      FROM bed_reservations br
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      INNER JOIN floors f ON f.id = r.floor_id
      INNER JOIN pgs p ON p.id = f.pg_id
      WHERE br.booking_id = vr.booking_id AND br.kind = 'primary'
      ORDER BY
        CASE
          WHEN br.status IN ('hold', 'active') AND CURRENT_DATE <@ br.stay_range THEN 0
          ELSE 1
        END,
        br.created_at DESC
      LIMIT 1
    ) loc ON true
    LEFT JOIN checkout_settlements cs ON cs.vacating_request_id = vr.id
    WHERE vr.status IN ('pending', 'approved')
      AND NOT EXISTS (
        SELECT 1 FROM checkout_settlements cs2
        WHERE cs2.vacating_request_id = vr.id
          AND cs2.status IN ('completed', 'refund_paid')
      )
  `);

  for (const row of rows) {
    if (row.pg_id && !sessionCanAccessPg(session, row.pg_id)) continue;
    if (!row.pg_id) {
      console.warn('[syncVacatingAlerts] skip vacating row without PG context', row.id, row.booking_id);
      continue;
    }
    const daysRemaining = tryDiffDays(today, row.vacating_date) ?? 0;
    const isPastDue = daysRemaining < 0;
    const daysPastDue = isPastDue ? Math.abs(daysRemaining) : 0;
    const title = isPastDue
      ? row.vacating_status === 'approved'
        ? `${row.resident_name} · Move-out overdue (${daysPastDue}d) · complete checkout`
        : `${row.resident_name} · Notice expired (${daysPastDue}d) · approve move-out`
      : row.vacating_status === 'pending'
        ? `${row.resident_name} · Approve move-out notice · ${row.vacating_date}`
        : `${row.resident_name} · Vacating ${row.vacating_date}`;

    await upsertActionItem({
      type: 'vacating_alert',
      title,
      pgId: row.pg_id,
      roomId: row.room_id,
      bedId: row.bed_id,
      residentId: row.resident_id,
      dueDate: row.vacating_date,
      priority: isPastDue ? 'high' : daysRemaining <= 3 ? 'high' : daysRemaining <= 7 ? 'medium' : 'low',
      sourceKey: `vacating:${row.id}`,
      metadata: {
        residentName: row.resident_name,
        residentPhone: row.resident_phone ?? undefined,
        residentEmail: row.resident_email ?? undefined,
        pgName: row.pg_name ? formatPgDisplayName(row.pg_name) : undefined,
        roomNumber: row.room_number ?? undefined,
        bedCode: row.bed_code ?? undefined,
        bookingId: row.booking_id,
        vacatingRequestId: row.id,
        settlementId: row.settlement_id ?? undefined,
        isPastDue,
        daysPastDue: isPastDue ? daysPastDue : undefined,
      },
    });
  }
}

async function syncRefundsPending(session: AdminSession): Promise<void> {
  const today = todayString();
  const rows = await db
    .select({
      bookingId: bookings.id,
      pgId: floors.pgId,
      pgName: pgs.name,
      residentId: bookings.customerId,
      residentName: customers.fullName,
      residentPhone: customers.phone,
      residentEmail: customers.email,
      roomId: rooms.id,
      bedId: beds.id,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      updatedAt: bookings.updatedAt,
      completedAt: vacatingRequests.resolvedAt,
      depositPaise: sql<number>`coalesce(sum(${depositLedger.amountPaise}), 0)::bigint`,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .leftJoin(depositLedger, eq(depositLedger.bookingId, bookings.id))
    .leftJoin(
      vacatingRequests,
      and(
        eq(vacatingRequests.bookingId, bookings.id),
        eq(vacatingRequests.status, 'completed'),
      ),
    )
    .where(
      and(
        eq(bookings.adminDepositRefundStatus, 'pending'),
        eq(bookings.status, 'completed'),
        sql`NOT EXISTS (
          SELECT 1 FROM checkout_settlements cs
          WHERE cs.booking_id = ${bookings.id}
            AND cs.status IN ('completed', 'refund_paid')
            AND COALESCE(cs.final_refund_paise, 0) <= 0
        )`,
      ),
    )
    .groupBy(
      bookings.id,
      floors.pgId,
      pgs.name,
      bookings.customerId,
      customers.fullName,
      customers.phone,
      customers.email,
      rooms.id,
      beds.id,
      rooms.roomNumber,
      beds.bedCode,
      bookings.updatedAt,
      vacatingRequests.resolvedAt,
    );

  const activeKeys = new Set<string>();

  for (const row of rows) {
    if (!sessionCanAccessPg(session, row.pgId)) continue;
    const { getDepositSummaryForBooking } = await import('./deposits');
    const depositSummary = await getDepositSummaryForBooking(row.bookingId);
    const refundPaise = depositSummary?.refundableBalancePaise ?? 0;
    if (refundPaise <= 0) continue;
    const anchor = row.completedAt ?? row.updatedAt;
    const daysWaiting = Math.max(0, diffDays(formatDate(anchor), today));
    const sourceKey = `refund:${row.bookingId}`;
    activeKeys.add(sourceKey);
    await upsertActionItem({
      type: 'refund_pending',
      title: `${row.residentName} · Deposit refund pending`,
      pgId: row.pgId,
      roomId: row.roomId,
      bedId: row.bedId,
      residentId: row.residentId,
      amount: refundPaise,
      priority: daysWaiting >= 7 ? 'high' : daysWaiting >= 3 ? 'medium' : 'low',
      sourceKey,
      metadata: {
        residentName: row.residentName,
        residentPhone: row.residentPhone,
        residentEmail: row.residentEmail,
        pgName: formatPgDisplayName(row.pgName),
        roomNumber: row.roomNumber,
        bedCode: row.bedCode,
        bookingId: row.bookingId,
      },
    });
  }

  const stale = await db
    .select({ sourceKey: actionItems.sourceKey })
    .from(actionItems)
    .where(
      and(
        eq(actionItems.type, 'refund_pending'),
        inArray(actionItems.status, ['open', 'in_progress']),
      ),
    );

  for (const row of stale) {
    if (!activeKeys.has(row.sourceKey)) {
      await db
        .update(actionItems)
        .set({ status: 'resolved', updatedAt: new Date() })
        .where(eq(actionItems.sourceKey, row.sourceKey));
    }
  }
}

/** Resolve refund + checkout action items when settlement is done or wallet is empty. */
export async function resolveStaleRefundAndCheckoutActionItems(): Promise<{ resolved: number }> {
  const refundRows = await db.execute<{ id: string }>(sql`
    UPDATE action_items ai
    SET status = 'resolved', updated_at = now()
    WHERE ai.type = 'refund_pending'
      AND ai.status IN ('open', 'in_progress')
      AND (
        NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE ai.source_key = 'refund:' || b.id::text
            AND b.admin_deposit_refund_status = 'pending'
            AND b.status = 'completed'
        )
        OR EXISTS (
          SELECT 1 FROM checkout_settlements cs
          WHERE cs.booking_id::text = ai.metadata->>'bookingId'
            AND cs.status IN ('completed', 'refund_paid')
            AND COALESCE(cs.final_refund_paise, 0) <= 0
        )
      )
    RETURNING ai.id
  `);

  const checkoutRows = await db.execute<{ id: string }>(sql`
    UPDATE action_items ai
    SET status = 'resolved', updated_at = now()
    WHERE ai.type IN ('vacating_alert', 'fixed_stay_checkout_due')
      AND ai.status IN ('open', 'in_progress')
      AND EXISTS (
        SELECT 1
        FROM checkout_settlements cs
        INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
        WHERE cs.status IN ('completed', 'refund_paid')
          AND COALESCE(cs.final_refund_paise, 0) <= 0
          AND (
            ai.source_key = 'vacating:' || vr.id::text
            OR ai.source_key = 'fixed_stay_checkout:' || cs.booking_id::text
          )
      )
    RETURNING ai.id
  `);

  return { resolved: refundRows.length + checkoutRows.length };
}

async function syncPaymentReviews(session: AdminSession): Promise<void> {
  await resolveStalePaymentReviewArtifacts(session);
  const items = await listPendingPaymentReviews(session);
  const activeKeys = new Set<string>();
  for (const item of items) {
    const sourceKey = `payment_review:${item.key}`;
    activeKeys.add(sourceKey);
    await upsertActionItem({
      type: 'payment_received',
      title: item.title,
      pgId: item.pgId,
      amount: item.amountPaise,
      priority: 'high',
      sourceKey,
      metadata: {
        pgName: formatPgDisplayName(item.pgName),
        paymentReviewKey: item.key,
        notes: item.subtitle,
      },
    });
  }

  const stale = await db
    .select({ sourceKey: actionItems.sourceKey })
    .from(actionItems)
    .where(
      and(
        eq(actionItems.type, 'payment_received'),
        inArray(actionItems.status, ['open', 'in_progress']),
      ),
    );

  for (const row of stale) {
    if (!activeKeys.has(row.sourceKey)) {
      await db
        .update(actionItems)
        .set({ status: 'resolved', updatedAt: new Date() })
        .where(eq(actionItems.sourceKey, row.sourceKey));
    }
  }
}

async function syncMaintenanceIssues(session: AdminSession): Promise<void> {
  const rows = await db
    .select({
      bedId: beds.id,
      bedCode: beds.bedCode,
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      pgId: floors.pgId,
      pgName: pgs.name,
    })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(eq(beds.status, 'maintenance'), sql`${beds.archivedAt} IS NULL`));

  for (const row of rows) {
    if (!sessionCanAccessPg(session, row.pgId)) continue;
    await upsertActionItem({
      type: 'maintenance_issue',
      title: `Bed ${row.bedCode} · Room ${row.roomNumber} under maintenance`,
      pgId: row.pgId,
      roomId: row.roomId,
      bedId: row.bedId,
      priority: 'medium',
      sourceKey: `maintenance:${row.bedId}`,
      metadata: {
        pgName: formatPgDisplayName(row.pgName),
        roomNumber: row.roomNumber,
        bedCode: row.bedCode,
      },
    });
  }
}

async function syncDepositCollectionDue(session: AdminSession): Promise<void> {
  const { listOutstandingDeposits } = await import('./depositCollection');
  const today = formatDate(new Date());
  const rows = await listOutstandingDeposits();

  for (const row of rows) {
    if (!sessionCanAccessPg(session, row.pgId)) continue;
    const daysUntilDue = row.depositDueDate ? diffDays(today, row.depositDueDate) : 99;
    const isOverdue = row.depositCollectionStatus === 'overdue';
    await upsertActionItem({
      type: 'deposit_collection_due',
      title: `${row.customerFullName} · Deposit due ${isOverdue ? '(overdue)' : ''}`.trim(),
      pgId: row.pgId,
      residentId: row.customerId,
      amount: row.depositDuePaise,
      dueDate: row.depositDueDate,
      priority: isOverdue ? 'high' : daysUntilDue <= 7 ? 'medium' : 'low',
      sourceKey: `deposit_due:${row.bookingId}`,
      metadata: {
        residentName: row.customerFullName,
        residentPhone: row.customerPhone,
        pgName: formatPgDisplayName(row.pgName),
        roomNumber: row.roomNumber,
        bedCode: row.bedCode,
        bookingId: row.bookingId,
        isOverdue,
      },
    });
  }
}

export async function syncActionItems(session: AdminSession): Promise<void> {
  await repairTerminalCheckoutOperations();
  await resolveStaleBillingActionItems();
  await resolveStaleKycActionItems();
  await resolveStaleVacatingActionItems();
  await resolveFixedStayCheckoutActionItems();
  await resolveStaleRefundAndCheckoutActionItems();
  await Promise.all([
    syncRentDue(session),
    syncElectricityDue(session),
    syncKycPending(session),
    syncVacatingAlerts(session),
    syncRefundsPending(session),
    syncDepositCollectionDue(session),
    syncPaymentReviews(session),
    syncMaintenanceIssues(session),
    syncResidentRequestActionItems(),
  ]);
  const openItems = await listOpenActionItems(session);
  await syncAdminNotificationsFromActionItems(openItems);
  await archiveNotificationsWithoutOpenTasks();
  await syncUnresolvedActionsFromDomain(session);
}

/** Unscoped super-admin session for cron jobs that sync all PGs. */
function cronAdminSession(): AdminSession {
  return {
    kind: 'admin',
    sessionId: 'cron',
    adminId: 'cron',
    email: 'cron@system',
    fullName: 'Cron',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

export async function syncActionItemsForCron(): Promise<void> {
  await syncActionItems(cronAdminSession());
}

/** Notification layer only — use after partial action_item updates. */
export async function refreshAdminNotificationsFromActionItems(): Promise<void> {
  const openItems = await listOpenActionItems(cronAdminSession());
  await syncAdminNotificationsFromActionItems(openItems);
  await archiveNotificationsWithoutOpenTasks();
}

function mapRow(
  row: typeof actionItems.$inferSelect & {
    pgName: string;
    residentName: string | null;
    roomNumber: string | null;
    bedCode: string | null;
  },
): ActionItemRow {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    pgId: row.pgId,
    roomId: row.roomId,
    bedId: row.bedId,
    residentId: row.residentId,
    amount: row.amount,
    dueDate: row.dueDate,
    status: row.status,
    priority: row.priority,
    sourceKey: row.sourceKey,
    metadata: (row.metadata ?? {}) as ActionItemMetadata,
    createdAt: row.createdAt,
    pgName: row.pgName,
    residentName: row.residentName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
  };
}

export async function listOpenActionItems(session: AdminSession): Promise<ActionItemRow[]> {
  return listOpenActionItemsFiltered(session);
}

export async function listOpenActionItemsByType(
  session: AdminSession,
  type: ActionItemRow['type'],
): Promise<ActionItemRow[]> {
  return listOpenActionItemsFiltered(session, type);
}

/** Top N oldest open action items (for overview queue). */
export async function listOldestPendingActionItems(
  session: AdminSession,
  limit = 5,
): Promise<Array<ActionItemRow & { ageDays: number }>> {
  const today = todayString();
  const items = await listOpenActionItemsFiltered(session);
  return items
    .map((item) => ({
      ...item,
      ageDays: Math.max(0, diffDays(formatDate(item.createdAt), today)),
    }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, limit);
}

async function listOpenActionItemsFiltered(
  session: AdminSession,
  type?: ActionItemRow['type'],
): Promise<ActionItemRow[]> {
  const conditions = [inArray(actionItems.status, ['open', 'in_progress'])];
  if (type) conditions.push(eq(actionItems.type, type));

  const rows = await db
    .select({
      item: actionItems,
      pgName: pgs.name,
      residentName: customers.fullName,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
    })
    .from(actionItems)
    .innerJoin(pgs, eq(pgs.id, actionItems.pgId))
    .leftJoin(customers, eq(customers.id, actionItems.residentId))
    .leftJoin(beds, eq(beds.id, actionItems.bedId))
    .leftJoin(rooms, eq(rooms.id, actionItems.roomId))
    .where(and(...conditions))
    .orderBy(
      sql`CASE ${actionItems.priority} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
      desc(actionItems.createdAt),
    );

  return rows
    .filter((r) => sessionCanAccessPg(session, r.item.pgId))
    .map((r) =>
      mapRow({
        ...r.item,
        pgName: formatPgDisplayName(r.pgName),
        residentName: r.residentName ?? (r.item.metadata as ActionItemMetadata).residentName ?? null,
        roomNumber: r.roomNumber ?? (r.item.metadata as ActionItemMetadata).roomNumber ?? null,
        bedCode: r.bedCode ?? (r.item.metadata as ActionItemMetadata).bedCode ?? null,
      }),
    );
}

export async function getActionItemDetail(
  session: AdminSession,
  actionItemId: string,
): Promise<ActionItemDetail | null> {
  const [row] = await db
    .select({
      item: actionItems,
      pgName: pgs.name,
      residentName: customers.fullName,
      residentPhone: customers.phone,
      residentEmail: customers.email,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
    })
    .from(actionItems)
    .innerJoin(pgs, eq(pgs.id, actionItems.pgId))
    .leftJoin(customers, eq(customers.id, actionItems.residentId))
    .leftJoin(beds, eq(beds.id, actionItems.bedId))
    .leftJoin(rooms, eq(rooms.id, actionItems.roomId))
    .where(eq(actionItems.id, actionItemId))
    .limit(1);

  if (!row || !sessionCanAccessPg(session, row.item.pgId)) return null;

  const meta = (row.item.metadata ?? {}) as ActionItemMetadata;
  const base = mapRow({
    ...row.item,
    pgName: formatPgDisplayName(row.pgName),
    residentName: row.residentName ?? meta.residentName ?? null,
    roomNumber: row.roomNumber ?? meta.roomNumber ?? null,
    bedCode: row.bedCode ?? meta.bedCode ?? null,
  });

  const ledgerEntries: ActionItemDetail['ledgerEntries'] = [];
  const bookingId = meta.bookingId;

  if (bookingId) {
    const rentRows = await db
      .select({
        id: rentInvoices.id,
        billingMonth: rentInvoices.billingMonth,
        rentPaise: rentInvoices.rentPaise,
        status: rentInvoices.status,
        dueDate: rentInvoices.dueDate,
      })
      .from(rentInvoices)
      .where(eq(rentInvoices.bookingId, bookingId))
      .orderBy(desc(rentInvoices.billingMonth))
      .limit(6);

    for (const inv of rentRows) {
      ledgerEntries.push({
        id: inv.id,
        label: `Rent ${inv.billingMonth.slice(0, 7)}`,
        amountPaise: inv.rentPaise,
        date: inv.dueDate,
        kind: inv.status,
      });
    }

    const depositRows = await db
      .select({
        id: depositLedger.id,
        amountPaise: depositLedger.amountPaise,
        entryKind: depositLedger.entryKind,
        createdAt: depositLedger.createdAt,
      })
      .from(depositLedger)
      .where(eq(depositLedger.bookingId, bookingId))
      .orderBy(desc(depositLedger.createdAt))
      .limit(6);

    for (const entry of depositRows) {
      ledgerEntries.push({
        id: entry.id,
        label: `Deposit ${entry.entryKind}`,
        amountPaise: entry.amountPaise,
        date: formatDate(entry.createdAt),
        kind: entry.entryKind,
      });
    }
  }

  const phone = row.residentPhone ?? meta.residentPhone ?? null;
  const email = row.residentEmail ?? meta.residentEmail ?? null;

  const availableActions: ActionItemDetail['availableActions'] = [];

  if (phone && ['rent_due', 'electricity_due', 'kyc_pending'].includes(base.type)) {
    availableActions.push({ type: 'send_whatsapp', label: 'Send WhatsApp' });
  }
  if (email) {
    availableActions.push({ type: 'send_email', label: 'Send email' });
  }
  if (
    base.residentId &&
    base.amount &&
    ['rent_due', 'electricity_due'].includes(base.type)
  ) {
    availableActions.push({ type: 'generate_payment_link', label: 'Generate payment link' });
    availableActions.push({ type: 'open_payment_qr', label: 'Open UPI QR' });
  }
  if (base.residentId) {
    availableActions.push({
      type: 'view_ledger',
      label: 'View resident',
      href: `/admin/residents/${base.residentId}`,
    });
  }
  if (base.type === 'payment_received') {
    availableActions.push({
      type: 'view_ledger',
      label: 'Review payment',
      href: '/admin/operations/payment-reviews',
    });
  }
  if (base.type === 'kyc_pending' && meta.submissionId) {
    availableActions.push({
      type: 'view_ledger',
      label: 'Review KYC',
      href: `/admin/residents/kyc/${meta.submissionId}`,
    });
  }
  if (base.type === 'vacating_alert') {
    const settlementId =
      typeof meta.settlementId === 'string' && meta.settlementId.length > 0
        ? meta.settlementId
        : null;
    availableActions.push({
      type: 'view_ledger',
      label: settlementId ? 'Open checkout settlement' : 'Vacating queue',
      href: settlementId
        ? `/admin/checkout-settlements/${settlementId}`
        : '/admin/vacating',
    });
  }
  if (base.type === 'refund_pending' && meta.bookingId) {
    availableActions.push({
      type: 'view_ledger',
      label: 'Process refund',
      href: `/admin/deposits/${meta.bookingId}`,
    });
  }
  if (base.type === 'fixed_stay_checkout_due') {
    const settlementId =
      typeof meta.settlementId === 'string' && meta.settlementId.length > 0
        ? meta.settlementId
        : null;
    availableActions.push({
      type: 'view_ledger',
      label: settlementId ? 'Open checkout settlement' : 'Checkout settlements',
      href: settlementId
        ? `/admin/checkout-settlements/${settlementId}`
        : '/admin/checkout-settlements?tab=awaiting_resident',
    });
  }
  if (
    (base.type === 'deposit_refund_request' ||
      base.type === 'refund_request_submitted' ||
      base.type === 'extension_request') &&
    meta.requestId
  ) {
    availableActions.push({
      type: 'view_ledger',
      label: 'Review request',
      href: '/admin/requests',
    });
  }
  if (base.status !== 'resolved') {
    availableActions.push({ type: 'mark_resolved', label: 'Mark resolved' });
  }

  return {
    ...base,
    residentPhone: phone,
    residentEmail: email,
    ledgerEntries,
    availableActions,
  };
}

export async function updateActionItemStatus(
  session: AdminSession,
  actionItemId: string,
  status: 'open' | 'in_progress' | 'resolved',
): Promise<{ ok: boolean; message?: string }> {
  const [existing] = await db
    .select({ pgId: actionItems.pgId, sourceKey: actionItems.sourceKey })
    .from(actionItems)
    .where(eq(actionItems.id, actionItemId))
    .limit(1);

  if (!existing || !sessionCanAccessPg(session, existing.pgId)) {
    return { ok: false, message: 'Action item not found.' };
  }

  await db
    .update(actionItems)
    .set({ status, updatedAt: new Date() })
    .where(eq(actionItems.id, actionItemId));

  if (status === 'resolved') {
    await resolveAction({ sourceKey: `unresolved:${existing.sourceKey}` });
  }

  return { ok: true };
}

export async function getPgQrForPurpose(
  pgId: string,
  purpose: 'rent' | 'electricity' | 'deposit' | 'combined',
): Promise<{ qrUrl: string; upiId: string | null } | null> {
  const nameHints =
    purpose === 'rent' || purpose === 'combined'
      ? ['rent', 'monthly']
      : purpose === 'electricity'
        ? ['electricity', 'elec', 'power']
        : ['deposit', 'security'];

  const categories = await db
    .select()
    .from(pgPaymentCategories)
    .where(and(eq(pgPaymentCategories.pgId, pgId), eq(pgPaymentCategories.isActive, true)));

  const match =
    categories.find((c) =>
      nameHints.some((h) => c.name.toLowerCase().includes(h)),
    ) ?? categories[0];

  if (!match) return null;
  return { qrUrl: match.qrCodeImageUrl, upiId: match.upiId };
}
