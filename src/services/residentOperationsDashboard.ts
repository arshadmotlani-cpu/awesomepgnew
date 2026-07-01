import { requireAdminSession } from '@/src/lib/auth/guards';
import { isResidentBedAssignmentEligible } from '@/src/lib/residentBedAssignment';
import { buildCollectionsQueue } from '@/src/lib/billing/collectionsQueue';
import { resolveFinancialInvoiceIdMap } from '@/src/services/adminCashSettlement';
import { todayString } from '@/src/lib/dates';
import { buildResidentOperationsDashboard } from '@/src/lib/residents/residentOperationsDashboard';
import {
  listAdminElectricityInvoicesForReminders,
  listAdminOpenRentInvoices,
  listAdminVacatingRequests,
  type AdminRentInvoiceRow,
} from '@/src/db/queries/admin';
import { listPendingKycSubmissions } from '@/src/services/kyc';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import { listResidentsForAdmin } from '@/src/services/residentAdmin';
import { listPendingResidentRequestsForAdmin } from '@/src/services/residentRequests';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';
import { getMoveOutPipelineSnapshot } from '@/src/services/moveOutPipelineService';
import { getOperationsCenterData } from '@/src/services/operationsCenter';
import { isStaleZeroRefundSettlement } from '@/src/lib/residents/checkoutOpsQueueCopy';
import {
  isDismissedFromOperationsQueue,
  loadOperationsQueueDismissalIndex,
} from '@/src/services/operationsQueueDismissals';
import type { AdminSession } from '@/src/lib/auth/session';

function mergeUnpaidRent(open: AdminRentInvoiceRow[]) {
  return open.filter((r) => r.outstandingPaise > 0 && r.effectiveStatus !== 'paid' && r.effectiveStatus !== 'cancelled');
}

export async function loadResidentOperationsDashboard(session: AdminSession) {
  const today = todayString();

  const [
    openRentRes,
    elecPending,
    kycPending,
    paymentProofs,
    residents,
    vacatingRes,
    checkoutSettlements,
    residentRequests,
    moveOutPipeline,
    opsCenter,
    dismissalIndex,
  ] = await Promise.all([
    listAdminOpenRentInvoices(),
    listAdminElectricityInvoicesForReminders(),
    listPendingKycSubmissions(),
    listPendingPaymentReviews(session),
    listResidentsForAdmin(session),
    listAdminVacatingRequests(),
    listPipelineCheckoutSettlements(session),
    listPendingResidentRequestsForAdmin(session),
    getMoveOutPipelineSnapshot(session),
    getOperationsCenterData(session),
    loadOperationsQueueDismissalIndex(),
  ]);

  const allUnpaidRent = mergeUnpaidRent(openRentRes.ok ? openRentRes.data : []);

  const collectionsQueue = buildCollectionsQueue({
    rentRows: allUnpaidRent,
    electricityRows: elecPending.ok ? elecPending.data : [],
  });

  const financialIdMap = await resolveFinancialInvoiceIdMap(
    collectionsQueue.map((item) => ({
      sourceTable: item.sourceTable,
      sourceId: item.sourceId,
    })),
  );
  for (const item of collectionsQueue) {
    item.financialInvoiceId =
      financialIdMap.get(`${item.sourceTable}:${item.sourceId}`) ?? null;
  }

  const rentOverdue = collectionsQueue.filter((q) => q.priority === 'overdue');
  const rentsDueToday = collectionsQueue.filter((q) => q.priority === 'due_today');

  const unassignedResidents = residents
    .filter((r) => isResidentBedAssignmentEligible(r))
    .map((r) => ({
      ...r,
      bookingId: r.onboardingBookingId ?? r.bookingId,
      bookingCode: r.onboardingBookingCode ?? r.bookingCode,
    }));

  const settlementByVacatingId = new Map(
    checkoutSettlements.map((s) => [s.vacatingRequestId, s]),
  );

  const vacatingRows = moveOutPipeline.activeItems.map((item) => {
    const settlement = settlementByVacatingId.get(item.vacatingRequestId);
    return {
      id: item.vacatingRequestId,
      customerId: item.customerId,
      customerFullName: item.customerFullName,
      pgName: item.pgName,
      roomNumber: item.roomNumber,
      bedCode: item.bedCode,
      status: item.vacatingStatus,
      vacatingDate: item.vacatingDate,
      bookingId: item.bookingId,
      settlementId: settlement?.id ?? item.settlementId,
      settlementStatus: settlement?.status ?? item.settlementStatus,
      finalRefundPaise: settlement?.finalRefundPaise ?? null,
    };
  });

  const residentByBooking = new Map(residents.map((r) => [r.bookingId, r]));
  for (const v of vacatingRows) {
    if (!v.customerId) {
      const match = residentByBooking.get(v.bookingId);
      if (match) v.customerId = match.id;
    }
  }

  const checkoutRefunds = checkoutSettlements.filter(
    (s) =>
      s.status === 'refund_pending' &&
      !isStaleZeroRefundSettlement(s) &&
      !isDismissedFromOperationsQueue(dismissalIndex, {
        customerId: s.customerId,
        bookingId: s.bookingId,
        settlementId: s.id,
        vacatingRequestId: s.vacatingRequestId,
      }),
  );

  const depositRefunds = opsCenter.refundsPending.items
    .filter(
      (r) =>
        !isDismissedFromOperationsQueue(dismissalIndex, {
          bookingId: r.bookingId,
        }),
    )
    .map((r) => {
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

  const moveOutsToday = moveOutPipeline.moveOutNoticeItems
    .filter((v) => v.daysRemaining <= 0)
    .map((v) => ({
      residentName: v.residentName,
      pgName: v.pgName,
    }));

  const dashboard = buildResidentOperationsDashboard({
    unpaidBilling: collectionsQueue.filter(
      (r) =>
        !r.customerId ||
        !isDismissedFromOperationsQueue(dismissalIndex, {
          customerId: r.customerId,
          bookingId: r.bookingId ?? undefined,
        }),
    ),
    paymentProofs: paymentProofs.filter(
      (p) =>
        !p.customerId ||
        !isDismissedFromOperationsQueue(dismissalIndex, { customerId: p.customerId }),
    ),
    kycPending: kycPending.filter(
      (k) =>
        !isDismissedFromOperationsQueue(dismissalIndex, {
          customerId: k.customerId,
          bookingId: k.bookingId ?? undefined,
        }),
    ),
    unassignedResidents: unassignedResidents.filter(
      (r) => !isDismissedFromOperationsQueue(dismissalIndex, { customerId: r.id, bookingId: r.bookingId }),
    ),
    vacatingRows: vacatingRows.filter((v) => v.customerId),
    checkoutRefunds,
    depositRefunds,
    residentRequests: residentRequests
      .filter(
        (r) =>
          !isDismissedFromOperationsQueue(dismissalIndex, {
            customerId: r.customerId,
            bookingId: r.bookingId,
          }),
      )
      .map((r) => ({
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

  if (vacatingRes.ok) {
    for (const v of vacatingRes.data) {
      if (!['pending', 'approved'].includes(v.status)) continue;
      if (residentIndex.has(v.customerId)) continue;
      residentIndex.set(v.customerId, {
        id: v.customerId,
        fullName: v.customerFullName,
        email: '',
        phone: v.customerPhone,
        gender: 'other',
        kycStatus: 'pending',
        createdAt: v.createdAt,
        tenancyStatus: 'vacating',
        pgId: null,
        pgName: v.pgName,
        roomNumber: v.roomNumber,
        bedCode: v.bedCode,
        roomId: null,
        bedId: null,
        monthlyRentPaise: 0,
        bookingId: v.bookingId,
        bookingCode: v.bookingCode,
        moveInDate: null,
        verificationSource: 'kyc',
        onboardingBookingId: null,
        onboardingBookingStatus: null,
        onboardingBookingCode: null,
        onboardingPaymentApproved: false,
        hasPendingKycSubmission: false,
      });
    }
  }

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
        onboardingBookingId: null,
        onboardingBookingStatus: null,
        onboardingBookingCode: null,
        onboardingPaymentApproved: false,
        hasPendingKycSubmission: q.category === 'kyc',
      };
      residentIndex.set(q.customerId, partial);
    }
  }

  return {
    ...dashboard,
    residentsById: residentIndex,
    allResidents: residents,
    dismissalIndex,
  };
}

export async function loadResidentOperationsDashboardPage() {
  const session = await requireAdminSession('/admin/operations');
  const data = await loadResidentOperationsDashboard(session);
  return { session, data };
}
