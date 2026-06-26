import { and, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReserveHolds,
  beds,
  bedReservations,
  bookings,
  customers,
  depositLedger,
  electricityInvoices,
  floors,
  kycSubmissions,
  playstationMemberships,
  pgs,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { addDays, diffDays, formatDate, parseDate, todayString } from '@/src/lib/dates';
import {
  comparePriority,
  depositRefundPriority,
  electricityPriority,
  formatPgDisplayName,
  isWithinDays,
  kycPriority,
  paymentApprovalPriority,
  ps4RenewalPriority,
  reservationPriority,
  vacatingPriority,
  type OpsPriority,
} from '@/src/lib/operationsCenterRules';
import { dedupeOpsTasks, type OpsTaskInput } from '@/src/lib/operationsCenterAudit';
import {
  computeElectricityInvoiceEffectiveStatus,
  computeElectricityInvoiceOutstandingPaise,
} from '@/src/services/residentFinancialEngine';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';
import { isStaleZeroRefundSettlement } from '@/src/lib/residents/checkoutOpsQueueCopy';
import {
  isDismissedFromOperationsQueue,
  loadOperationsQueueDismissalIndex,
} from '@/src/services/operationsQueueDismissals';

export type OpsTask = OpsTaskInput;

export type OperationsCenterData = {
  pendingPayments: {
    count: number;
    items: Array<{ key: string; pgName: string; title: string; amountPaise: number }>;
  };
  pendingKyc: {
    count: number;
    items: Array<{
      id: string;
      residentName: string;
      pgName: string;
      submittedAt: Date;
      priority: OpsPriority;
    }>;
  };
  leavingSoon: {
    count: number;
    items: Array<{
      id: string;
      residentName: string;
      bedCode: string;
      roomNumber: string;
      pgName: string;
      vacatingDate: string;
      daysRemaining: number;
      priority: OpsPriority;
    }>;
  };
  bedsReleasingSoon: {
    count: number;
    items: Array<{
      id: string;
      bedCode: string;
      roomNumber: string;
      pgName: string;
      vacatingDate: string;
      daysRemaining: number;
      priority: OpsPriority;
    }>;
  };
  upcomingReservations: {
    count: number;
    items: Array<{
      id: string;
      residentName: string;
      bedCode: string;
      roomNumber: string;
      pgName: string;
      checkInDate: string;
      priority: OpsPriority;
    }>;
  };
  refundsPending: {
    count: number;
    items: Array<{
      residentName: string;
      pgName: string;
      depositPaise: number;
      daysWaiting: number;
      priority: OpsPriority;
      bookingId: string;
    }>;
  };
  /** Checkout pipeline refunds — SSOT for overview card linking to /admin/checkout-settlements */
  checkoutRefundsPending: {
    count: number;
    items: Array<{ id: string; residentName: string; pgName: string | null }>;
  };
  electricityPending: {
    count: number;
    items: Array<{
      invoiceId: string;
      residentName: string;
      pgName: string;
      amountDuePaise: number;
      priority: OpsPriority;
    }>;
  };
  ps4Renewals: {
    count: number;
    items: Array<{
      membershipId: string;
      residentName: string;
      pgName: string;
      expiresAt: Date;
      priority: OpsPriority;
    }>;
  };
  tasks: OpsTask[];
};

function sessionCanAccessPg(session: AdminSession, pgId: string): boolean {
  return adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId);
}

async function listPendingKycWithPg(session: AdminSession) {
  const today = todayString();
  const rows = await db
    .select({
      id: kycSubmissions.id,
      customerName: customers.fullName,
      pgId: floors.pgId,
      pgName: pgs.name,
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
    .where(eq(kycSubmissions.status, 'pending'))
    .groupBy(
      kycSubmissions.id,
      customers.fullName,
      floors.pgId,
      pgs.name,
      kycSubmissions.createdAt,
    )
    .orderBy(sql`${kycSubmissions.createdAt} DESC`);

  return rows
    .filter((r) => {
      if (!r.pgId) return session.role === 'super_admin';
      return sessionCanAccessPg(session, r.pgId);
    })
    .map((r) => ({
      id: r.id,
      residentName: r.customerName,
      pgName: r.pgName ? formatPgDisplayName(r.pgName) : 'UNASSIGNED',
      submittedAt: r.createdAt,
      priority: kycPriority(r.createdAt, today),
    }));
}

async function listActiveBedReserves(session: AdminSession) {
  const today = todayString();
  const rows = await db
    .select({
      id: bedReserveHolds.id,
      pgId: floors.pgId,
      pgName: pgs.name,
      customerName: customers.fullName,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      checkInDate: bedReserveHolds.checkInDate,
    })
    .from(bedReserveHolds)
    .innerJoin(customers, eq(customers.id, bedReserveHolds.customerId))
    .innerJoin(bookings, eq(bookings.id, bedReserveHolds.bookingId))
    .innerJoin(beds, eq(beds.id, bedReserveHolds.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(bedReserveHolds.status, 'active'),
        sql`${bedReserveHolds.checkInDate} >= ${today}::date`,
        inArray(bookings.status, ['pending_payment', 'confirmed']),
      ),
    )
    .orderBy(bedReserveHolds.checkInDate);

  return rows
    .filter((r) => sessionCanAccessPg(session, r.pgId))
    .map((r) => ({
      id: r.id,
      residentName: r.customerName,
      bedCode: r.bedCode,
      roomNumber: r.roomNumber,
      pgName: formatPgDisplayName(r.pgName),
      checkInDate: r.checkInDate,
      priority: reservationPriority(r.checkInDate, today),
    }));
}

async function listVacatingForOps(session: AdminSession) {
  const rows = await db
    .select({
      id: vacatingRequests.id,
      pgId: pgs.id,
      pgName: pgs.name,
      customerFullName: customers.fullName,
      bedCode: beds.bedCode,
      roomNumber: rooms.roomNumber,
      vacatingDate: vacatingRequests.vacatingDate,
    })
    .from(vacatingRequests)
    .innerJoin(bookings, eq(bookings.id, vacatingRequests.bookingId))
    .innerJoin(customers, eq(customers.id, vacatingRequests.customerId))
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(inArray(vacatingRequests.status, ['pending', 'approved']))
    .orderBy(vacatingRequests.vacatingDate);

  return rows.filter((r) => sessionCanAccessPg(session, r.pgId));
}

async function listPendingDepositRefunds(session: AdminSession) {
  const today = todayString();
  const rows = await db
    .select({
      bookingId: bookings.id,
      pgId: floors.pgId,
      pgName: pgs.name,
      customerName: customers.fullName,
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
            AND cs.status IN ('completed', 'refund_paid', 'refund_pending')
            AND COALESCE(cs.final_refund_paise, 0) <= 0
        )`,
      ),
    )
    .groupBy(
      bookings.id,
      floors.pgId,
      pgs.name,
      customers.fullName,
      bookings.updatedAt,
      vacatingRequests.resolvedAt,
    );

  return rows
    .filter((r) => sessionCanAccessPg(session, r.pgId))
    .map((r) => {
      const anchor = r.completedAt ?? r.updatedAt;
      const daysWaiting = Math.max(0, diffDays(formatDate(anchor), today));
      return {
        residentName: r.customerName,
        pgName: formatPgDisplayName(r.pgName),
        depositPaise: Math.max(0, Number(r.depositPaise)),
        daysWaiting,
        priority: depositRefundPriority(daysWaiting),
        bookingId: r.bookingId,
      };
    })
    .filter((r) => r.depositPaise > 0);
}

async function listOutstandingElectricity(session: AdminSession) {
  const today = todayString();
  const rows = await db
    .select({
      pgId: floors.pgId,
      pgName: pgs.name,
      customerName: customers.fullName,
      invoice: electricityInvoices,
    })
    .from(electricityInvoices)
    .innerJoin(bookings, eq(bookings.id, electricityInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(beds, eq(beds.id, electricityInvoices.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(electricityInvoices.status, 'pending'));

  const items: OperationsCenterData['electricityPending']['items'] = [];
  for (const row of rows) {
    if (!sessionCanAccessPg(session, row.pgId)) continue;
    const outstandingPaise = computeElectricityInvoiceOutstandingPaise(row.invoice, today);
    if (outstandingPaise <= 0) continue;
    const status =
      computeElectricityInvoiceEffectiveStatus(row.invoice, today) === 'overdue'
        ? 'overdue'
        : 'pending';
    items.push({
      invoiceId: row.invoice.id,
      residentName: row.customerName,
      pgName: formatPgDisplayName(row.pgName),
      amountDuePaise: outstandingPaise,
      priority: electricityPriority(status, row.invoice.dueDate, today),
    });
  }
  items.sort((a, b) => comparePriority(a.priority, b.priority));
  return items;
}

async function listPs4RenewalsForOps(session: AdminSession, today: string) {
  const cutoff = formatDate(addDays(parseDate(today), 7));
  const rows = await db
    .select({
      id: playstationMemberships.id,
      pgId: playstationMemberships.pgId,
      pgName: pgs.name,
      customerName: customers.fullName,
      expiresAt: playstationMemberships.expiresAt,
    })
    .from(playstationMemberships)
    .innerJoin(customers, eq(customers.id, playstationMemberships.customerId))
    .innerJoin(pgs, eq(pgs.id, playstationMemberships.pgId))
    .where(
      and(
        eq(playstationMemberships.status, 'active'),
        isNotNull(playstationMemberships.expiresAt),
        lte(sql`${playstationMemberships.expiresAt}::date`, sql`${cutoff}::date`),
        gte(sql`${playstationMemberships.expiresAt}::date`, sql`${today}::date`),
      ),
    )
    .orderBy(playstationMemberships.expiresAt);

  return rows
    .filter((r) => sessionCanAccessPg(session, r.pgId) && r.expiresAt)
    .map((r) => ({
      membershipId: r.id,
      residentName: r.customerName,
      pgName: formatPgDisplayName(r.pgName),
      expiresAt: r.expiresAt!,
      priority: ps4RenewalPriority(r.expiresAt!, today),
    }))
    .sort((a, b) => comparePriority(a.priority, b.priority));
}

export function buildOperationsTasks(
  data: Omit<OperationsCenterData, 'tasks'>,
  today: string,
): OpsTask[] {
  const tasks: OpsTask[] = [];

  for (const p of data.pendingPayments.items) {
    tasks.push({
      id: `pay-${p.key}`,
      priority: paymentApprovalPriority(),
      pgName: p.pgName,
      label: `Approve payment — ${p.title}`,
      href: '/admin/operations/payment-reviews',
    });
  }

  for (const k of data.pendingKyc.items) {
    tasks.push({
      id: `kyc-${k.id}`,
      priority: kycPriority(k.submittedAt, today),
      pgName: k.pgName,
      label: `Review KYC for ${k.residentName}`,
      href: `/admin/residents/kyc/${k.id}`,
    });
  }

  for (const v of data.leavingSoon.items) {
    tasks.push({
      id: `leave-${v.id}`,
      priority: v.priority,
      pgName: v.pgName,
      label:
        v.daysRemaining <= 0
          ? `${v.residentName} vacating today`
          : `Resident leaving in ${v.daysRemaining} day${v.daysRemaining === 1 ? '' : 's'} — ${v.residentName}`,
      href: '/admin/vacating',
    });
  }

  for (const r of data.refundsPending.items) {
    tasks.push({
      id: `refund-${r.bookingId}`,
      priority: r.priority,
      pgName: r.pgName,
      label: `Refund deposit for ${r.residentName}`,
      href: `/admin/deposits/${r.bookingId}`,
    });
  }

  for (const e of data.electricityPending.items) {
    tasks.push({
      id: `elec-${e.invoiceId}`,
      priority: e.priority,
      pgName: e.pgName,
      label: `Electricity due from ${e.residentName}`,
      href: '/admin/electricity',
    });
  }

  for (const p of data.ps4Renewals.items) {
    const daysLeft = diffDays(today, formatDate(p.expiresAt));
    tasks.push({
      id: `ps4-${p.membershipId}`,
      priority: p.priority,
      pgName: p.pgName,
      label:
        daysLeft <= 1
          ? `PS4 subscription expires ${daysLeft < 0 ? 'overdue' : 'tomorrow'} — ${p.residentName}`
          : `PS4 renewal needed — ${p.residentName}`,
      href: '/admin/playstation',
    });
  }

  for (const r of data.upcomingReservations.items) {
    tasks.push({
      id: `res-${r.id}`,
      priority: r.priority,
      pgName: r.pgName,
      label: `Upcoming check-in — ${r.residentName} on ${r.checkInDate}`,
      href: '/admin/bookings',
    });
  }

  return dedupeOpsTasks(tasks).sort((a, b) => {
    const p = comparePriority(a.priority, b.priority);
    if (p !== 0) return p;
    return a.label.localeCompare(b.label);
  });
}

export async function getOperationsCenterData(
  session: AdminSession,
): Promise<OperationsCenterData> {
  const today = todayString();

  const [
    paymentItems,
    pendingKycItems,
    vacatingRows,
    reservations,
    refunds,
    checkoutSettlements,
    electricityItems,
    ps4RenewalItems,
    dismissalIndex,
  ] = await Promise.all([
    listPendingPaymentReviews(session),
    listPendingKycWithPg(session),
    listVacatingForOps(session),
    listActiveBedReserves(session),
    listPendingDepositRefunds(session),
    listPipelineCheckoutSettlements(session),
    listOutstandingElectricity(session),
    listPs4RenewalsForOps(session, today),
    loadOperationsQueueDismissalIndex(),
  ]);

  const visibleVacatingRows = vacatingRows.filter(
    (v) => !isDismissedFromOperationsQueue(dismissalIndex, { vacatingRequestId: v.id }),
  );
  const visibleRefunds = refunds.filter(
    (r) => !isDismissedFromOperationsQueue(dismissalIndex, { bookingId: r.bookingId }),
  );

  const pendingPaymentRows = paymentItems.map((p) => ({
    key: p.key,
    pgName: formatPgDisplayName(p.pgName),
    title: p.title,
    amountPaise: p.amountPaise,
  }));

  const leavingSoonItems = visibleVacatingRows.map((v) => {
    const daysRemaining = diffDays(today, v.vacatingDate);
    return {
      id: v.id,
      residentName: v.customerFullName,
      bedCode: v.bedCode,
      roomNumber: v.roomNumber,
      pgName: formatPgDisplayName(v.pgName),
      vacatingDate: v.vacatingDate,
      daysRemaining,
      priority: vacatingPriority(daysRemaining),
    };
  });

  const bedsReleasingItems = leavingSoonItems
    .filter((v) => isWithinDays(v.vacatingDate, today, 30))
    .map(({ id, bedCode, roomNumber, pgName, vacatingDate, daysRemaining, priority }) => ({
      id,
      bedCode,
      roomNumber,
      pgName,
      vacatingDate,
      daysRemaining,
      priority,
    }));

  const checkoutRefundItems = checkoutSettlements
    .filter((s) => s.status === 'refund_pending' && !isStaleZeroRefundSettlement(s))
    .map((s) => ({
      id: s.id,
      residentName: s.customerName,
      pgName: s.pgName ? formatPgDisplayName(s.pgName) : null,
    }));

  const partial: Omit<OperationsCenterData, 'tasks'> = {
    pendingPayments: { count: pendingPaymentRows.length, items: pendingPaymentRows },
    pendingKyc: { count: pendingKycItems.length, items: pendingKycItems },
    leavingSoon: { count: leavingSoonItems.length, items: leavingSoonItems },
    bedsReleasingSoon: { count: bedsReleasingItems.length, items: bedsReleasingItems },
    upcomingReservations: { count: reservations.length, items: reservations },
    refundsPending: { count: visibleRefunds.length, items: visibleRefunds },
    checkoutRefundsPending: { count: checkoutRefundItems.length, items: checkoutRefundItems },
    electricityPending: { count: electricityItems.length, items: electricityItems },
    ps4Renewals: { count: ps4RenewalItems.length, items: ps4RenewalItems },
  };

  return {
    ...partial,
    tasks: buildOperationsTasks(partial, today),
  };
}
