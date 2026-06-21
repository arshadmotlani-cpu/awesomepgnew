import { requireAdminSession } from '@/src/lib/auth/guards';
import { isResidentBedAssignable } from '@/src/lib/residentBedAssignment';
import { buildCollectionsQueue } from '@/src/lib/billing/collectionsQueue';
import { todayString } from '@/src/lib/dates';
import { buildResidentOperationsDashboard } from '@/src/lib/residents/residentOperationsDashboard';
import {
  listAdminElectricityInvoicesForReminders,
  listAdminRentInvoices,
  listAdminVacatingRequests,
  type AdminRentInvoiceRow,
} from '@/src/db/queries/admin';
import { listPendingKycSubmissions } from '@/src/services/kyc';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import { listResidentsForAdmin } from '@/src/services/residentAdmin';
import { listPendingResidentRequestsForAdmin } from '@/src/services/residentRequests';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';
import { getOperationsCenterData } from '@/src/services/operationsCenter';
import type { AdminSession } from '@/src/lib/auth/session';

function mergeUnpaidRent(pending: AdminRentInvoiceRow[], overdue: AdminRentInvoiceRow[]) {
  const byId = new Map<string, AdminRentInvoiceRow>();
  for (const row of [...pending, ...overdue]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

export async function loadResidentOperationsDashboard(session: AdminSession) {
  const today = todayString();

  const [
    rentPendingRes,
    rentOverdueRes,
    elecPending,
    kycPending,
    paymentProofs,
    residents,
    vacatingRes,
    checkoutSettlements,
    residentRequests,
    opsCenter,
  ] = await Promise.all([
    listAdminRentInvoices({ status: 'pending' }),
    listAdminRentInvoices({ status: 'overdue' }),
    listAdminElectricityInvoicesForReminders(),
    listPendingKycSubmissions(),
    listPendingPaymentReviews(session),
    listResidentsForAdmin(session),
    listAdminVacatingRequests(),
    listPipelineCheckoutSettlements(session),
    listPendingResidentRequestsForAdmin(session),
    getOperationsCenterData(session),
  ]);

  const allUnpaidRent = mergeUnpaidRent(
    rentPendingRes.ok ? rentPendingRes.data : [],
    rentOverdueRes.ok ? rentOverdueRes.data : [],
  );

  const collectionsQueue = buildCollectionsQueue({
    rentRows: allUnpaidRent,
    electricityRows: elecPending.ok ? elecPending.data : [],
  });

  const rentOverdue = collectionsQueue.filter((q) => q.priority === 'overdue');
  const rentsDueToday = collectionsQueue.filter((q) => q.priority === 'due_today');

  const unassignedResidents = residents.filter((r) => isResidentBedAssignable(r));

  const vacatingRows =
    vacatingRes.ok
      ? vacatingRes.data
          .filter((v) => v.status === 'pending' || v.status === 'approved')
          .map((v) => ({
            id: v.id,
            customerId: '',
            customerFullName: v.customerFullName,
            pgName: v.pgName,
            roomNumber: v.roomNumber,
            bedCode: v.bedCode,
            status: v.status,
            vacatingDate: v.vacatingDate,
            bookingId: v.bookingId,
          }))
      : [];

  const residentByBooking = new Map(residents.map((r) => [r.bookingId, r]));
  for (const v of vacatingRows) {
    const match = residentByBooking.get(v.bookingId);
    if (match) v.customerId = match.id;
  }

  const checkoutRefunds = checkoutSettlements.filter((s) => s.status === 'refund_pending');

  const depositRefunds = opsCenter.refundsPending.items.map((r) => {
    const resident = residents.find((x) => x.bookingId === r.bookingId);
    return {
      bookingId: r.bookingId,
      customerName: r.residentName,
      pgName: r.pgName,
      customerId: resident?.id,
    };
  });

  const moveInsToday = opsCenter.upcomingReservations.items
    .filter((r) => r.checkInDate === today)
    .map((r) => ({
      residentName: r.residentName,
      pgName: r.pgName,
      bedCode: r.bedCode,
      roomNumber: r.roomNumber,
    }));

  const moveOutsToday = opsCenter.leavingSoon.items
    .filter((v) => v.daysRemaining <= 0)
    .map((v) => ({
      residentName: v.residentName,
      pgName: v.pgName,
    }));

  const dashboard = buildResidentOperationsDashboard({
    rentOverdue,
    paymentProofs,
    kycPending,
    unassignedResidents,
    vacatingRows: vacatingRows.filter((v) => v.customerId),
    checkoutRefunds,
    depositRefunds,
    residentRequests: residentRequests.map((r) => ({
      id: r.id,
      type: r.type,
      customerId: r.customerId,
      customerName: r.customerName,
      pgName: r.pgName,
      bookingId: r.bookingId,
      status: r.status,
    })),
    moveInsToday,
    moveOutsToday,
    rentsDueToday,
  });

  const residentIndex = new Map(residents.map((r) => [r.id, r]));
  for (const q of dashboard.queue) {
    if (q.customerId && !residentIndex.has(q.customerId)) {
      const partial = {
        id: q.customerId,
        fullName: q.residentName,
        email: '',
        phone: '',
        gender: 'other' as const,
        kycStatus: q.kycStatus ?? ('pending' as const),
        createdAt: new Date(),
        tenancyStatus: q.tenancyStatus ?? ('active' as const),
        pgId: null,
        pgName: q.pgName,
        roomNumber: q.roomNumber,
        bedCode: q.bedCode,
        roomId: null,
        bedId: null,
        monthlyRentPaise: 0,
        bookingId: q.bookingId,
        bookingCode: null,
        moveInDate: null,
        verificationSource: 'kyc' as const,
      };
      residentIndex.set(q.customerId, partial);
    }
  }

  return {
    ...dashboard,
    residentsById: residentIndex,
    allResidents: residents,
  };
}

export async function loadResidentOperationsDashboardPage() {
  const session = await requireAdminSession('/admin/operations');
  const data = await loadResidentOperationsDashboard(session);
  return { session, data };
}
