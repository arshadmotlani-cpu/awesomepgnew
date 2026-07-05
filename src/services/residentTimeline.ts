/**
 * Admin Resident Timeline — aggregate cross-workflow events for production investigations.
 */
import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  actionItems,
  adminNotifications,
  bookings,
  checkoutSettlements,
  customers,
  financialInvoices,
  kycSubmissions,
  paymentProofRejections,
  pgPaymentRecords,
  residentRequests,
  residentUploadEvents,
  roomChangeRequests,
  vacatingRequests,
} from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type {
  ResidentTimelineEvent,
  ResidentTimelineEventKind,
  ResidentTimelineMatch,
  ResidentTimelineResult,
  ResidentTimelineSubject,
} from '@/src/lib/admin/residentTimelineTypes';
import type { AdminSession } from '@/src/lib/auth/session';
import { searchResidentsForAdmin } from '@/src/services/adminResidentSearch';
import { residentUploadTypeLabel } from '@/src/services/residentUploadEvents';
import {
  bookingTimelineDetailForStatus,
  bookingTimelineKindForStatus,
  isBookingStatus,
  labelBookingStatus,
} from '@/src/lib/booking/bookingStatus';

function canAccessPg(session: AdminSession, pgId: string | null | undefined): boolean {
  if (!pgId) return session.role === 'super_admin';
  return adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId);
}

function evt(
  partial: Omit<ResidentTimelineEvent, 'id'> & { id?: string },
): ResidentTimelineEvent {
  return {
    id: partial.id ?? `${partial.sourceTable}:${partial.recordId}:${partial.kind}:${partial.timestamp.getTime()}`,
    ...partial,
  };
}

function kindForStatus(status: string): ResidentTimelineEventKind {
  if (isBookingStatus(status)) {
    return bookingTimelineKindForStatus(status);
  }
  if (status === 'approved' || status === 'verified') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'cancelled' || status === 'withdrawn') return 'cancelled';
  if (status === 'pending' || status === 'submitted') {
    return 'submitted';
  }
  return 'status_changed';
}

/** Parse room/bed queries like "204 B2", "204-B2", "204/b2". */
export function parseRoomBedQuery(raw: string): { roomNumber: string; bedCode: string } | null {
  const normalized = raw.trim().replace(/\s+/g, ' ');
  const m = normalized.match(/^(\d{2,4})\s*[-/]?\s*(?:bed\s*)?([bB]?\d+|[bB]\d+)$/i);
  if (!m) return null;
  const bedRaw = m[2]!.toUpperCase();
  const bedCode = bedRaw.startsWith('B') ? bedRaw : `B${bedRaw}`;
  return { roomNumber: m[1]!, bedCode };
}

export async function resolveResidentTimelineMatches(
  session: AdminSession,
  query: string,
): Promise<ResidentTimelineMatch[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const matches: ResidentTimelineMatch[] = [];
  const seen = new Set<string>();

  function push(match: ResidentTimelineMatch) {
    const key = `${match.customerId}:${match.bookingId ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push(match);
  }

  const bookingRows = await db
    .select({
      customerId: bookings.customerId,
      customerName: customers.fullName,
      phone: customers.phone,
      email: customers.email,
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      bookingStatus: bookings.status,
      pgName: sql<string | null>`null`,
      roomNumber: sql<string | null>`null`,
      bedCode: sql<string | null>`null`,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(ilike(bookings.bookingCode, q))
    .limit(5);

  for (const row of bookingRows) {
    push({
      customerId: row.customerId,
      customerName: row.customerName,
      phone: row.phone,
      email: row.email,
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      bookingStatus: row.bookingStatus,
      pgName: row.pgName,
      roomNumber: row.roomNumber,
      bedCode: row.bedCode,
    });
  }

  const roomBed = parseRoomBedQuery(q);
  if (roomBed) {
    const bedRows = await db.execute<{
      customer_id: string;
      customer_name: string;
      phone: string | null;
      email: string | null;
      booking_id: string;
      booking_code: string;
      booking_status: string;
      pg_name: string;
      room_number: string;
      bed_code: string;
      pg_id: string;
    }>(sql`
      SELECT
        c.id AS customer_id,
        c.full_name AS customer_name,
        c.phone,
        c.email,
        bk.id AS booking_id,
        bk.booking_code,
        bk.status AS booking_status,
        p.name AS pg_name,
        r.room_number,
        bd.bed_code,
        p.id AS pg_id
      FROM beds bd
      INNER JOIN rooms r ON r.id = bd.room_id
      INNER JOIN floors f ON f.id = r.floor_id
      INNER JOIN pgs p ON p.id = f.pg_id
      INNER JOIN bed_reservations br ON br.bed_id = bd.id
      INNER JOIN bookings bk ON bk.id = br.booking_id
      INNER JOIN customers c ON c.id = bk.customer_id
      WHERE r.room_number = ${roomBed.roomNumber}
        AND (bd.bed_code ILIKE ${roomBed.bedCode} OR bd.bed_code ILIKE ${'%' + roomBed.bedCode.replace(/^B/, '') + '%'})
        AND br.kind = 'primary'
        AND br.status IN ('hold', 'active')
        AND CURRENT_DATE <@ br.stay_range
      ORDER BY br.created_at DESC
      LIMIT 5
    `);

    for (const row of bedRows) {
      if (!canAccessPg(session, row.pg_id)) continue;
      push({
        customerId: row.customer_id,
        customerName: row.customer_name,
        phone: row.phone,
        email: row.email,
        bookingId: row.booking_id,
        bookingCode: row.booking_code,
        bookingStatus: row.booking_status,
        pgName: row.pg_name,
        roomNumber: row.room_number,
        bedCode: row.bed_code,
      });
    }
  }

  const searchHits = await searchResidentsForAdmin(session, q, 8);
  for (const hit of searchHits) {
    push({
      customerId: hit.id,
      customerName: hit.fullName,
      phone: hit.phone,
      email: hit.email,
      bookingId: hit.bookingId,
      bookingCode: hit.bookingCode,
      bookingStatus: hit.tenancyStatus === 'active' ? 'confirmed' : null,
      pgName: hit.pgName,
      roomNumber: hit.roomNumber,
      bedCode: hit.bedCode,
    });
  }

  return matches.slice(0, 10);
}

async function enrichSubject(
  session: AdminSession,
  customerId: string,
  bookingId: string | null,
): Promise<ResidentTimelineSubject> {
  const [customer] = await db
    .select({
      id: customers.id,
      fullName: customers.fullName,
      phone: customers.phone,
      email: customers.email,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  let bookingRow: {
    id: string;
    bookingCode: string;
    status: string;
    pgName: string | null;
    roomNumber: string | null;
    bedCode: string | null;
  } | null = null;

  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    booking_status: string;
    pg_name: string | null;
    room_number: string | null;
    bed_code: string | null;
  }>(sql`
    SELECT
      bk.id AS booking_id,
      bk.booking_code,
      bk.status AS booking_status,
      loc.pg_name,
      loc.room_number,
      loc.bed_code
    FROM bookings bk
    LEFT JOIN LATERAL (
      SELECT p.name AS pg_name, r.room_number, bd.bed_code
      FROM bed_reservations br
      INNER JOIN beds bd ON bd.id = br.bed_id
      INNER JOIN rooms r ON r.id = bd.room_id
      INNER JOIN floors f ON f.id = r.floor_id
      INNER JOIN pgs p ON p.id = f.pg_id
      WHERE br.booking_id = bk.id AND br.kind = 'primary'
      ORDER BY
        CASE WHEN br.status IN ('hold', 'active') AND CURRENT_DATE <@ br.stay_range THEN 0 ELSE 1 END,
        br.created_at DESC
      LIMIT 1
    ) loc ON true
    WHERE ${bookingId ? sql`bk.id = ${bookingId}::uuid` : sql`bk.customer_id = ${customerId}::uuid`}
    ORDER BY bk.created_at DESC
    LIMIT 1
  `);

  if (rows[0]) {
    bookingRow = {
      id: rows[0].booking_id,
      bookingCode: rows[0].booking_code,
      status: rows[0].booking_status,
      pgName: rows[0].pg_name,
      roomNumber: rows[0].room_number,
      bedCode: rows[0].bed_code,
    };
  }

  return {
    customerId,
    customerName: customer?.fullName ?? 'Unknown',
    phone: customer?.phone ?? null,
    email: customer?.email ?? null,
    bookingId: bookingRow?.id ?? bookingId,
    bookingCode: bookingRow?.bookingCode ?? null,
    bookingStatus: bookingRow?.status ?? null,
    pgName: bookingRow?.pgName ?? null,
    roomNumber: bookingRow?.roomNumber ?? null,
    bedCode: bookingRow?.bedCode ?? null,
  };
}

export async function buildResidentTimeline(
  session: AdminSession,
  customerId: string,
  bookingId?: string | null,
): Promise<ResidentTimelineResult> {
  const subject = await enrichSubject(session, customerId, bookingId ?? null);

  const bookingIds = subject.bookingId
    ? [subject.bookingId]
    : (
        await db
          .select({ id: bookings.id })
          .from(bookings)
          .where(eq(bookings.customerId, customerId))
          .orderBy(desc(bookings.createdAt))
          .limit(50)
      ).map((b) => b.id);

  const events: ResidentTimelineEvent[] = [];

  if (bookingIds.length) {
    const bookingRows = await db
      .select()
      .from(bookings)
      .where(inArray(bookings.id, bookingIds))
      .orderBy(desc(bookings.createdAt));

    for (const b of bookingRows) {
      events.push(
        evt({
          kind: 'booking_created',
          label: 'Booking created',
          status: b.status,
          recordId: b.id,
          sourceTable: 'bookings',
          timestamp: b.createdAt,
          bookingId: b.id,
          bookingCode: b.bookingCode,
          detail:
            isBookingStatus(b.status)
              ? bookingTimelineDetailForStatus(b.status)
              : null,
          adminHref: `/admin/bookings/${b.id}`,
        }),
      );
      if (b.updatedAt.getTime() - b.createdAt.getTime() > 1000) {
        events.push(
          evt({
            kind: kindForStatus(b.status),
            label: `Booking status: ${labelBookingStatus(b.status)}`,
            status: b.status,
            recordId: b.id,
            sourceTable: 'bookings',
            timestamp: b.updatedAt,
            bookingId: b.id,
            bookingCode: b.bookingCode,
            detail: null,
            adminHref: `/admin/bookings/${b.id}`,
          }),
        );
      }
    }

    const payments = await db
      .select()
      .from(pgPaymentRecords)
      .where(inArray(pgPaymentRecords.bookingId, bookingIds))
      .orderBy(desc(pgPaymentRecords.createdAt));

    for (const p of payments) {
      events.push(
        evt({
          kind: kindForStatus(p.status),
          label: `Booking payment proof ${p.status}`,
          status: p.status,
          recordId: p.id,
          sourceTable: 'pg_payment_records',
          timestamp: p.createdAt,
          bookingId: p.bookingId,
          bookingCode: subject.bookingCode,
          detail: p.paymentScreenshotUrl ? 'Screenshot on file' : null,
          adminHref: '/admin/operations?filter=waiting_for_approval',
        }),
      );
    }

    const vacating = await db
      .select()
      .from(vacatingRequests)
      .where(inArray(vacatingRequests.bookingId, bookingIds))
      .orderBy(desc(vacatingRequests.createdAt));

    for (const v of vacating) {
      events.push(
        evt({
          kind: 'submitted',
          label: 'Move-out notice submitted',
          status: v.status,
          recordId: v.id,
          sourceTable: 'vacating_requests',
          timestamp: v.createdAt,
          bookingId: v.bookingId,
          bookingCode: subject.bookingCode,
          detail: `Vacating ${v.vacatingDate}`,
          adminHref: '/admin/vacating',
        }),
      );
      if (v.status !== 'pending' || v.updatedAt.getTime() - v.createdAt.getTime() > 1000) {
        events.push(
          evt({
            kind: kindForStatus(v.status),
            label: `Move-out ${v.status}`,
            status: v.status,
            recordId: v.id,
            sourceTable: 'vacating_requests',
            timestamp: v.updatedAt,
            bookingId: v.bookingId,
            bookingCode: subject.bookingCode,
            detail: v.notes,
            adminHref: '/admin/vacating',
          }),
        );
      }
    }

    const settlements = await db
      .select()
      .from(checkoutSettlements)
      .where(inArray(checkoutSettlements.bookingId, bookingIds))
      .orderBy(desc(checkoutSettlements.createdAt));

    for (const s of settlements) {
      events.push(
        evt({
          kind: 'created_settlement',
          label: 'Checkout settlement created',
          status: s.status,
          recordId: s.id,
          sourceTable: 'checkout_settlements',
          timestamp: s.createdAt,
          bookingId: s.bookingId,
          bookingCode: subject.bookingCode,
          detail: null,
          adminHref: `/admin/checkout-settlements/${s.id}`,
        }),
      );
      if (s.updatedAt.getTime() - s.createdAt.getTime() > 1000) {
        events.push(
          evt({
            kind: 'status_changed',
            label: `Checkout settlement: ${s.status.replace(/_/g, ' ')}`,
            status: s.status,
            recordId: s.id,
            sourceTable: 'checkout_settlements',
            timestamp: s.updatedAt,
            bookingId: s.bookingId,
            bookingCode: subject.bookingCode,
            detail: null,
            adminHref: `/admin/checkout-settlements/${s.id}`,
          }),
        );
      }
    }
  }

  const roomChanges = await db
    .select()
    .from(roomChangeRequests)
    .where(eq(roomChangeRequests.customerId, customerId))
    .orderBy(desc(roomChangeRequests.createdAt));

  for (const rc of roomChanges) {
    events.push(
      evt({
        kind: 'submitted',
        label: 'Room change request',
        status: rc.status,
        recordId: rc.id,
        sourceTable: 'room_change_requests',
        timestamp: rc.createdAt,
        bookingId: rc.bookingId,
        bookingCode: subject.bookingCode,
        detail: `Shift ${rc.requestedShiftDate}`,
        adminHref: `/admin/bookings/${rc.bookingId}`,
      }),
    );
    if (rc.status !== 'submitted' && rc.updatedAt.getTime() - rc.createdAt.getTime() > 1000) {
      events.push(
        evt({
          kind: kindForStatus(rc.status),
          label: `Room change ${rc.status}`,
          status: rc.status,
          recordId: rc.id,
          sourceTable: 'room_change_requests',
          timestamp: rc.updatedAt,
          bookingId: rc.bookingId,
          bookingCode: subject.bookingCode,
          detail: rc.adminNotes,
          adminHref: `/admin/bookings/${rc.bookingId}`,
        }),
      );
    }
  }

  const finInvoices = await db
    .select()
    .from(financialInvoices)
    .where(eq(financialInvoices.customerId, customerId))
    .orderBy(desc(financialInvoices.createdAt))
    .limit(80);

  for (const inv of finInvoices) {
    events.push(
      evt({
        kind: inv.status === 'paid' ? 'approved' : 'submitted',
        label: `Invoice ${inv.invoiceNumber}`,
        status: inv.status,
        recordId: inv.id,
        sourceTable: 'financial_invoices',
        timestamp: inv.createdAt,
        bookingId: inv.bookingId,
        bookingCode: subject.bookingCode,
        detail: `${inv.invoiceType} · ${inv.amountPaise} paise`,
        adminHref: '/admin/billing?tab=billing',
      }),
    );
    if (inv.paidAt && inv.paidAt.getTime() - inv.createdAt.getTime() > 1000) {
      events.push(
        evt({
          kind: 'approved',
          label: `Invoice paid · ${inv.invoiceNumber}`,
          status: 'paid',
          recordId: inv.id,
          sourceTable: 'financial_invoices',
          timestamp: inv.paidAt,
          bookingId: inv.bookingId,
          bookingCode: subject.bookingCode,
          detail: inv.invoiceType,
          adminHref: '/admin/billing?tab=billing',
        }),
      );
    }
  }

  const kycRows = await db
    .select()
    .from(kycSubmissions)
    .where(eq(kycSubmissions.customerId, customerId))
    .orderBy(desc(kycSubmissions.createdAt));

  for (const k of kycRows) {
    events.push(
      evt({
        kind: 'submitted',
        label: 'KYC submitted',
        status: k.status,
        recordId: k.id,
        sourceTable: 'kyc_submissions',
        timestamp: k.createdAt,
        bookingId: k.bookingId,
        bookingCode: subject.bookingCode,
        detail: null,
        adminHref: `/admin/residents/kyc/${k.id}`,
      }),
    );
    if (k.status !== 'pending') {
      events.push(
        evt({
          kind: kindForStatus(k.status),
          label: `KYC ${k.status}`,
          status: k.status,
          recordId: k.id,
          sourceTable: 'kyc_submissions',
          timestamp: k.reviewedAt ?? k.updatedAt,
          bookingId: k.bookingId,
          bookingCode: subject.bookingCode,
          detail: k.rejectionReason,
          adminHref: `/admin/residents/kyc/${k.id}`,
        }),
      );
    }
  }

  const uploads = await db
    .select()
    .from(residentUploadEvents)
    .where(eq(residentUploadEvents.customerId, customerId))
    .orderBy(desc(residentUploadEvents.createdAt))
    .limit(50);

  for (const u of uploads) {
    events.push(
      evt({
        kind: u.adminVisible ? 'linked_upload' : 'uploaded_document',
        label: u.adminVisible
          ? `${residentUploadTypeLabel(u.uploadType)} linked to admin queue`
          : `${residentUploadTypeLabel(u.uploadType)} uploaded (orphan)`,
        status: u.status,
        recordId: u.id,
        sourceTable: 'resident_upload_events',
        timestamp: u.createdAt,
        bookingId: u.bookingId,
        bookingCode: subject.bookingCode,
        detail: u.adminVisible ? u.adminQueue : 'Not visible to admin — submit step may be missing',
        adminHref: '/admin/uploads',
      }),
    );
  }

  const requests = await db
    .select()
    .from(residentRequests)
    .where(eq(residentRequests.customerId, customerId))
    .orderBy(desc(residentRequests.createdAt));

  for (const r of requests) {
    events.push(
      evt({
        kind: 'submitted',
        label: `Resident request: ${r.type.replace(/_/g, ' ')}`,
        status: r.status,
        recordId: r.id,
        sourceTable: 'resident_requests',
        timestamp: r.createdAt,
        bookingId: r.bookingId,
        bookingCode: subject.bookingCode,
        detail: null,
        adminHref: '/admin/requests',
      }),
    );
    if (r.status !== 'submitted' && r.updatedAt.getTime() - r.createdAt.getTime() > 1000) {
      events.push(
        evt({
          kind: kindForStatus(r.status),
          label: `Resident request ${r.status}`,
          status: r.status,
          recordId: r.id,
          sourceTable: 'resident_requests',
          timestamp: r.updatedAt,
          bookingId: r.bookingId,
          bookingCode: subject.bookingCode,
          detail: null,
          adminHref: '/admin/requests',
        }),
      );
    }
  }

  const actions = await db
    .select()
    .from(actionItems)
    .where(eq(actionItems.residentId, customerId))
    .orderBy(desc(actionItems.createdAt))
    .limit(40);

  for (const a of actions) {
    if (!canAccessPg(session, a.pgId)) continue;
    events.push(
      evt({
        kind: 'created_action_item',
        label: `Action item: ${a.title}`,
        status: a.status,
        recordId: a.id,
        sourceTable: 'action_items',
        timestamp: a.createdAt,
        bookingId: (a.metadata as { bookingId?: string })?.bookingId ?? null,
        bookingCode: subject.bookingCode,
        detail: a.type.replace(/_/g, ' '),
        adminHref: '/admin/operations',
      }),
    );
  }

  const notifications = await db
    .select()
    .from(adminNotifications)
    .where(eq(adminNotifications.residentId, customerId))
    .orderBy(desc(adminNotifications.createdAt))
    .limit(30);

  for (const n of notifications) {
    if (!canAccessPg(session, n.pgId)) continue;
    events.push(
      evt({
        kind: 'notification_sent',
        label: `Admin notification: ${n.title}`,
        status: 'sent',
        recordId: n.id,
        sourceTable: 'admin_notifications',
        timestamp: n.createdAt,
        bookingId: (n.metadata as { bookingId?: string })?.bookingId ?? null,
        bookingCode: subject.bookingCode,
        detail: n.type.replace(/_/g, ' '),
        adminHref: n.href,
      }),
    );
  }

  const proofRejections = await db
    .select()
    .from(paymentProofRejections)
    .where(eq(paymentProofRejections.customerId, customerId))
    .orderBy(desc(paymentProofRejections.rejectedAt))
    .limit(50);

  for (const r of proofRejections) {
    if (!canAccessPg(session, r.pgId)) continue;
    events.push(
      evt({
        kind: 'rejected',
        label: `Payment proof rejected — ${r.reasonLabel}`,
        status: r.status,
        recordId: r.id,
        sourceTable: 'payment_proof_rejections',
        timestamp: r.rejectedAt,
        bookingId: r.bookingId,
        bookingCode: subject.bookingCode,
        detail: r.residentMessage,
        adminHref: '/admin/operations?filter=waiting_for_approval',
      }),
    );
  }

  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const { nextAction, blockedReason, existsSummary } = deriveTimelineSummary(subject, events);

  return { subject, events, nextAction, blockedReason, existsSummary };
}

export function deriveTimelineSummary(
  subject: ResidentTimelineSubject,
  events: ResidentTimelineEvent[],
): { nextAction: string; blockedReason: string | null; existsSummary: string } {
  const pendingVacating = events.find(
    (e) => e.sourceTable === 'vacating_requests' && e.status === 'pending' && e.kind === 'submitted',
  );
  if (pendingVacating) {
    return {
      existsSummary: 'Yes — move-out notice exists (pending admin approval).',
      nextAction: 'Admin: approve move-out at /admin/vacating',
      blockedReason: 'Waiting for admin to approve move-out notice.',
    };
  }

  const orphanUpload = events.find(
    (e) => e.sourceTable === 'resident_upload_events' && e.kind === 'uploaded_document',
  );
  if (orphanUpload) {
    return {
      existsSummary: 'Yes — file upload exists but may not be linked to a review queue.',
      nextAction: 'Resident: complete the submit step after upload, or admin links manually',
      blockedReason: orphanUpload.detail,
    };
  }

  if (subject.bookingStatus === 'superseded') {
    return {
      existsSummary: 'Yes — an older booking was superseded by a newer confirmed booking.',
      nextAction: 'No action — use the active confirmed booking for this resident',
      blockedReason: 'Superseded bookings are terminal and not shown in Operations.',
    };
  }

  if (subject.bookingStatus === 'pending_approval') {
    return {
      existsSummary: 'Yes — booking exists awaiting admin payment approval.',
      nextAction: 'Admin: approve payment proof in Collections',
      blockedReason: 'Booking not activated until admin approves payment.',
    };
  }

  if (subject.bookingStatus === 'pending_payment') {
    return {
      existsSummary: 'Yes — booking exists but payment proof not submitted yet.',
      nextAction: 'Resident: pay and upload proof on booking page',
      blockedReason: 'Booking awaiting resident payment.',
    };
  }

  const pendingKyc = events.find(
    (e) => e.sourceTable === 'kyc_submissions' && e.status === 'pending' && e.kind === 'submitted',
  );
  if (pendingKyc) {
    return {
      existsSummary: 'Yes — KYC submission exists (pending review).',
      nextAction: 'Admin: review KYC at /admin/residents/kyc',
      blockedReason: 'KYC not yet approved.',
    };
  }

  const openSettlement = events.find(
    (e) =>
      e.sourceTable === 'checkout_settlements' &&
      !['completed', 'refund_paid', 'archived'].includes(e.status),
  );
  if (openSettlement) {
    return {
      existsSummary: 'Yes — checkout settlement in progress.',
      nextAction: `Admin: continue checkout at ${openSettlement.adminHref ?? '/admin/checkout-settlements'}`,
      blockedReason: `Settlement status: ${openSettlement.status.replace(/_/g, ' ')}`,
    };
  }

  if (events.length === 0) {
    return {
      existsSummary: 'No workflow records found for this resident.',
      nextAction: 'Verify search — resident may not have submitted, or used a different account.',
      blockedReason: null,
    };
  }

  return {
    existsSummary: `Yes — ${events.length} workflow event(s) on record.`,
    nextAction: 'Review timeline below — no obvious blocker detected.',
    blockedReason: null,
  };
}
