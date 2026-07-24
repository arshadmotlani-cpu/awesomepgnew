/**
 * Resident Command Center — composes SSOT services for /admin/residents/[customerId].
 * No duplicate business logic; deep links only to existing workflows.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bookings,
  checkoutSettlements,
  roomChangeRequests,
  vacatingRequests,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import type {
  CommandCenterBookingDepositRow,
  CommandCenterBookingHistoryRow,
  CommandCenterPendingItem,
  CommandCenterRequestRow,
  CommandCenterRoomChangeRow,
  CommandCenterVacatingRow,
  ResidentCommandCenterData,
} from '@/src/lib/residents/commandCenterTypes';
import {
  bookingWorkflowHref,
  checkoutRefundHref,
  paymentProofWorkflowHref,
  residentRequestWorkflowHref,
  settlementWorkflowHref,
  vacatingWorkflowHref,
} from '@/src/lib/residents/commandCenterLinks';
import {
  buildKycReviewAction,
  mapUnresolvedActionRow,
} from '@/src/lib/residents/residentUnresolvedActions';
import { getActiveTenancyForCustomer } from '@/src/lib/residentActiveTenancy';
import { fetchBedOccupancyRows, resolveBedOccupancyRows } from '@/src/services/bedOccupancyBatch';
import { canAdminMarkInvoicePaidWithCash } from '@/src/services/adminCashSettlement';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import {
  DEPOSIT_CREDIT_REASON,
  listPriorBookingDepositsForReview,
} from '@/src/services/depositCredit';
import { getLatestKycSubmission } from '@/src/services/kyc';
import { listResidentInvoiceHistory } from '@/src/services/invoiceGeneration';
import {
  getBookingFinancialAccount,
  getResidentFinancialAccount,
} from '@/src/services/residentFinancialEngine';
import { getResidentBillingFormDefaults } from '@/src/services/residentBillingProfiles';
import { loadMonthlyBillingSnapshotForBooking } from '@/src/lib/billing/monthlyBillingSnapshot';
import { getResidencyAdminView } from '@/src/services/continuousResidency';
import {
  getCustomerVerificationStatus,
  getResidentDetail,
} from '@/src/services/residentAdmin';
import { listOpenRequestsForCustomer } from '@/src/services/residentRequests';
import { buildResidentTimeline } from '@/src/services/residentTimeline';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import { getOpenActionsForResident } from '@/src/services/unresolvedActions';

async function listBookingHistoryForCustomer(
  customerId: string,
): Promise<CommandCenterBookingHistoryRow[]> {
  const { sql } = await import('drizzle-orm');
  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    status: string;
    expected_checkout_date: string | null;
    created_at: Date;
    pg_name: string | null;
    room_number: string | null;
    bed_code: string | null;
    move_in_date: string | null;
  }>(sql`
    SELECT
      b.id::text AS booking_id,
      b.booking_code,
      b.status::text AS status,
      b.expected_checkout_date::text AS expected_checkout_date,
      b.created_at,
      p.name AS pg_name,
      r.room_number,
      bd.bed_code,
      to_char(lower(br.stay_range), 'YYYY-MM-DD') AS move_in_date
    FROM bookings b
    LEFT JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    LEFT JOIN beds bd ON bd.id = br.bed_id
    LEFT JOIN rooms r ON r.id = bd.room_id
    LEFT JOIN floors f ON f.id = r.floor_id
    LEFT JOIN pgs p ON p.id = f.pg_id
    WHERE b.customer_id = ${customerId}::uuid
    ORDER BY b.created_at DESC
    LIMIT 25
  `);

  return rows.map((r) => ({
    bookingId: r.booking_id,
    bookingCode: r.booking_code,
    status: r.status,
    pgName: r.pg_name,
    roomNumber: r.room_number,
    bedCode: r.bed_code,
    moveInDate: r.move_in_date,
    moveOutDate: r.expected_checkout_date,
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }));
}

async function listRoomChangesForCustomer(
  customerId: string,
): Promise<CommandCenterRoomChangeRow[]> {
  const rows = await db
    .select({
      id: roomChangeRequests.id,
      bookingId: roomChangeRequests.bookingId,
      bookingCode: bookings.bookingCode,
      status: roomChangeRequests.status,
      requestedShiftDate: roomChangeRequests.requestedShiftDate,
      createdAt: roomChangeRequests.createdAt,
    })
    .from(roomChangeRequests)
    .innerJoin(bookings, eq(bookings.id, roomChangeRequests.bookingId))
    .where(eq(roomChangeRequests.customerId, customerId))
    .orderBy(desc(roomChangeRequests.createdAt))
    .limit(20);

  return rows.map((r) => ({
    id: r.id,
    bookingId: r.bookingId,
    bookingCode: r.bookingCode,
    status: r.status,
    requestedShiftDate: r.requestedShiftDate,
    createdAt: r.createdAt,
  }));
}

async function listVacatingForCustomer(
  customerId: string,
): Promise<CommandCenterVacatingRow[]> {
  const bookingIds = (
    await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.customerId, customerId))
  ).map((b) => b.id);

  if (!bookingIds.length) return [];

  const rows = await db
    .select({
      id: vacatingRequests.id,
      bookingId: vacatingRequests.bookingId,
      bookingCode: bookings.bookingCode,
      status: vacatingRequests.status,
      vacatingDate: vacatingRequests.vacatingDate,
      createdAt: vacatingRequests.createdAt,
      settlementId: checkoutSettlements.id,
      settlementStatus: checkoutSettlements.status,
    })
    .from(vacatingRequests)
    .innerJoin(bookings, eq(bookings.id, vacatingRequests.bookingId))
    .leftJoin(checkoutSettlements, eq(checkoutSettlements.vacatingRequestId, vacatingRequests.id))
    .where(inArray(vacatingRequests.bookingId, bookingIds))
    .orderBy(desc(vacatingRequests.createdAt))
    .limit(10);

  return rows.map((r) => ({
    id: r.id,
    bookingId: r.bookingId,
    bookingCode: r.bookingCode,
    status: r.status,
    vacatingDate: r.vacatingDate,
    settlementId: r.settlementId,
    settlementStatus: r.settlementStatus,
    createdAt: r.createdAt,
  }));
}

function mapOpenRequests(rows: Awaited<ReturnType<typeof listOpenRequestsForCustomer>>): CommandCenterRequestRow[] {
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    amountPaise: r.amountPaise,
    createdAt: r.createdAt,
    bookingId: r.bookingId,
    bookingCode: null,
  }));
}

async function buildPendingReviews(
  session: AdminSession,
  customerId: string,
  pendingKycSubmissionId: string | null,
  customerName: string,
): Promise<CommandCenterPendingItem[]> {
  const items: CommandCenterPendingItem[] = [];
  const seen = new Set<string>();

  function push(item: CommandCenterPendingItem) {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  }

  const [unresolved, paymentProofs] = await Promise.all([
    getOpenActionsForResident(customerId),
    listPendingPaymentReviews(session),
  ]);

  for (const row of unresolved) {
    const mapped = mapUnresolvedActionRow(row);
    const href =
      mapped.kind === 'deposit_refund' && row.entityType === 'booking'
        ? checkoutRefundHref(row.entityId)
        : mapped.href;
    push({
      id: mapped.sourceKey,
      category: mapped.kind.replace(/_/g, ' '),
      label: mapped.label,
      detail: mapped.stateLine ?? null,
      priority: mapped.priority,
      href,
      createdAt: row.createdAt,
    });
  }

  if (pendingKycSubmissionId) {
    const kyc = buildKycReviewAction({
      customerId,
      customerName,
      pendingKycSubmissionId,
    });
    push({
      id: kyc.sourceKey,
      category: 'KYC',
      label: kyc.label,
      detail: kyc.stateLine ?? null,
      priority: kyc.priority,
      href: kyc.href,
      createdAt: new Date(),
    });
  }

  for (const proof of paymentProofs) {
    if (proof.customerId !== customerId) continue;
    push({
      id: `payment_proof:${proof.key}`,
      category: proof.paymentTypeLabel,
      label: `${proof.paymentTypeLabel} uploaded`,
      detail: `${proof.title} · ${proof.subtitle}`,
      priority: 'high',
      href: paymentProofWorkflowHref(proof),
      createdAt: new Date(),
    });
  }

  const openRequests = await listOpenRequestsForCustomer(customerId);
  for (const req of openRequests) {
    if (!['submitted', 'under_review'].includes(req.status)) continue;
    if (req.type === 'deposit_refund') {
      if (!req.bookingId) continue;
      push({
        id: `resident_request:${req.id}`,
        category: 'Refund',
        label: 'Deposit refund request',
        detail: req.notes,
        priority: 'high',
        href: checkoutRefundHref(req.bookingId),
        createdAt: req.createdAt,
      });
      continue;
    }
    const label =
      req.type === 'stay_extension'
        ? 'Stay extension request'
        : `Resident request: ${req.type.replace(/_/g, ' ')}`;
    push({
      id: `resident_request:${req.id}`,
      category: 'Request',
      label,
      detail: req.notes,
      priority: 'medium',
      href: residentRequestWorkflowHref(req.id),
      createdAt: req.createdAt,
    });
  }

  const roomChanges = await listRoomChangesForCustomer(customerId);
  for (const rc of roomChanges) {
    if (!['submitted', 'draft'].includes(rc.status)) continue;
    push({
      id: `room_change:${rc.id}`,
      category: 'Room change',
      label: 'Room change request submitted',
      detail: `Shift date ${rc.requestedShiftDate}`,
      priority: 'medium',
      href: bookingWorkflowHref(rc.bookingId),
      createdAt: rc.createdAt,
    });
  }

  const vacating = await listVacatingForCustomer(customerId);
  for (const v of vacating) {
    if (v.status === 'pending') {
      push({
        id: `vacating:${v.id}`,
        category: 'Vacating',
        label: 'Move-out approval pending',
        detail: `Vacating ${v.vacatingDate}`,
        priority: 'high',
        href: vacatingWorkflowHref(v.id),
        createdAt: v.createdAt,
      });
      continue;
    }
    if (v.settlementStatus === 'awaiting_admin_review' && v.settlementId) {
      push({
        id: `vacating-settlement:${v.settlementId}`,
        category: 'Checkout',
        label: 'Checkout settlement review',
        detail: `Vacating ${v.vacatingDate}`,
        priority: 'high',
        href: settlementWorkflowHref(v.settlementId),
        createdAt: v.createdAt,
      });
      continue;
    }
    if (v.settlementStatus === 'refund_pending') {
      push({
        id: `vacating-refund:${v.bookingId}`,
        category: 'Refund',
        label: 'Refund ready to pay',
        detail: `Vacating ${v.vacatingDate}`,
        priority: 'high',
        href: checkoutRefundHref(v.bookingId),
        createdAt: v.createdAt,
      });
    }
  }

  const priorityRank = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => {
    const pr = priorityRank[a.priority] - priorityRank[b.priority];
    if (pr !== 0) return pr;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

async function listBookingDepositRows(
  customerId: string,
  bookingHistory: CommandCenterBookingHistoryRow[],
  activeBookingId: string | null,
): Promise<CommandCenterBookingDepositRow[]> {
  const priorDeposits = await listPriorBookingDepositsForReview(customerId, activeBookingId);
  const priorByBookingId = new Map(priorDeposits.map((row) => [row.bookingId, row]));

  const rows = await Promise.all(
    bookingHistory.map(async (booking) => {
      const summary = await getDepositSummaryForBooking(booking.bookingId);
      if (!summary) return null;

      const transferFromPriorPaise = summary.entries
        .filter(
          (entry) =>
            entry.entryKind === 'collected' && entry.reason === DEPOSIT_CREDIT_REASON,
        )
        .reduce((sum, entry) => sum + entry.amountPaise, 0);

      const prior = priorByBookingId.get(booking.bookingId);

      return {
        bookingId: booking.bookingId,
        bookingCode: booking.bookingCode,
        bookingStatus: booking.status,
        depositPaidPaise: summary.collectedPaise,
        depositUsedPaise: summary.deductedPaise,
        depositRefundedPaise: summary.refundedPaise,
        depositRemainingPaise: summary.refundableBalancePaise,
        transferFromPriorPaise,
        additionalDepositPaidPaise: Math.max(0, summary.collectedPaise - transferFromPriorPaise),
        dispositionLabel: prior?.statusLabel ?? null,
      } satisfies CommandCenterBookingDepositRow;
    }),
  );

  return rows
    .filter((row): row is CommandCenterBookingDepositRow => row !== null)
    .reverse();
}

async function resolveOccupancy(bedId: string) {
  const rows = await fetchBedOccupancyRows({ bedId });
  const resolved = resolveBedOccupancyRows(rows)[0];
  if (!resolved) return null;
  return {
    label: resolved.adminView.label,
    adminViewLabel: resolved.adminView.label,
  };
}

export async function loadResidentCommandCenter(
  session: AdminSession,
  customerId: string,
): Promise<ResidentCommandCenterData | null> {
  const detail = await getResidentDetail(session, customerId);
  if (!detail) return null;

  const { customer, activeTenancy, canArchive, settledTenancy } = detail;
  const isVacated = customer.residencyStatus === 'vacated';

  const bookingId =
    activeTenancy?.bookingId ?? settledTenancy?.bookingId ?? null;

  const [
    verification,
    latestKyc,
    residencyView,
    bookingHistory,
    roomChanges,
    vacatingRows,
    openRequestsRaw,
    occupancy,
  ] = await Promise.all([
    getCustomerVerificationStatus(customerId),
    getLatestKycSubmission(customerId),
    getResidencyAdminView(customerId),
    listBookingHistoryForCustomer(customerId),
    listRoomChangesForCustomer(customerId),
    listVacatingForCustomer(customerId),
    listOpenRequestsForCustomer(customerId),
    activeTenancy ? resolveOccupancy(activeTenancy.bedId) : Promise.resolve(null),
  ]);

  const pendingKycSubmissionId =
    latestKyc?.status === 'pending' ? latestKyc.id : null;

  const [financialAccount, depositSummary, billingDefaults, billingSnapshot, invoiceHistory, pendingReviews, timeline, bookingDeposits] =
    await Promise.all([
      isVacated && settledTenancy
        ? getBookingFinancialAccount({
            bookingId: settledTenancy.bookingId,
            customerId,
            customerName: customer.fullName,
            customerPhone: customer.phone,
            bookingCode: settledTenancy.bookingCode,
            pgId: settledTenancy.pgId,
            pgName: settledTenancy.pgName,
            roomNumber: settledTenancy.roomNumber,
            depositPaise: 0,
            depositDuePaise: 0,
          })
        : getResidentFinancialAccount(customerId),
      bookingId ? getDepositSummaryForBooking(bookingId) : Promise.resolve(null),
      activeTenancy
        ? getResidentBillingFormDefaults(customerId, activeTenancy.bookingId)
        : Promise.resolve(null),
      activeTenancy
        ? loadMonthlyBillingSnapshotForBooking({
            bookingId: activeTenancy.bookingId,
            customerId,
          })
        : Promise.resolve(null),
      listResidentInvoiceHistory(customerId, 40),
      buildPendingReviews(session, customerId, pendingKycSubmissionId, customer.fullName),
      buildResidentTimeline(session, customerId, null),
      listBookingDepositRows(customerId, bookingHistory, bookingId),
    ]);

  const activeTenancyFull = await getActiveTenancyForCustomer(customerId);

  return {
    customer: {
      id: customer.id,
      fullName: customer.fullName,
      email: customer.email,
      phone: customer.phone,
      kycStatus: customer.kycStatus,
      residencyStatus: customer.residencyStatus,
      createdAt: customer.createdAt,
    },
    isVacated,
    activeTenancy: activeTenancyFull,
    settledTenancy,
    occupancy,
    financialAccount,
    depositSummary,
    bookingDeposits,
    billingDefaults,
    billingSnapshot,
    invoiceHistory,
    pendingReviews,
    bookingHistory,
    roomChanges,
    openRequests: mapOpenRequests(openRequestsRaw),
    vacatingRows,
    timeline,
    residencyView,
    canArchive,
    pendingKycSubmissionId,
    verification: verification ? { isVerified: verification.isVerified } : null,
    canMarkCash: canAdminMarkInvoicePaidWithCash(session.role),
    adminName: session.fullName ?? session.email,
  };
}