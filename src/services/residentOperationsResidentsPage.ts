import { desc, not, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog } from '@/src/db/schema';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { buildCollectionsQueue } from '@/src/lib/billing/collectionsQueue';
import {
  buildResidentOperationsResidentsView,
  type ResidentsCommandFilter,
  filterResidentsQueue,
} from '@/src/lib/residents/residentOperationsResidentsView';
import {
  listAdminElectricityInvoicesForReminders,
  listAdminRentInvoices,
  listAdminVacatingRequests,
  type AdminRentInvoiceRow,
} from '@/src/db/queries/admin';
import type { AdminSession } from '@/src/lib/auth/session';
import { listOwnerPayments } from '@/src/services/qrPayments';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';
import { listPipelineCheckoutSettlements } from '@/src/services/checkoutSettlement';
import { loadResidentOperationsDashboard } from '@/src/services/residentOperationsDashboard';
import { isStaleZeroRefundSettlement } from '@/src/lib/residents/checkoutOpsQueueCopy';
import {
  isDismissedFromOperationsQueue,
} from '@/src/services/operationsQueueDismissals';

const NOISE_ENTITIES = new Set(['whatsapp_message', 'app_log', 'visitor_event']);

function mergeUnpaidRent(pending: AdminRentInvoiceRow[], overdue: AdminRentInvoiceRow[]) {
  const byId = new Map<string, AdminRentInvoiceRow>();
  for (const row of [...pending, ...overdue]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

async function listRecentOperationalAudit(limit = 40) {
  return db
    .select({
      id: auditLog.id,
      entity: auditLog.entity,
      action: auditLog.action,
      createdAt: auditLog.createdAt,
      diff: auditLog.diff,
    })
    .from(auditLog)
    .where(not(eq(auditLog.entity, 'whatsapp_message')))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function loadResidentOperationsResidentsPage(
  session: AdminSession,
  filter: ResidentsCommandFilter | null,
) {
  const [
    dashboard,
    paymentProofs,
    qrPayments,
    rentPendingRes,
    rentOverdueRes,
    elecPending,
    checkoutSettlements,
    vacatingRes,
    recentAudit,
  ] = await Promise.all([
    loadResidentOperationsDashboard(session),
    listPendingPaymentReviews(session),
    listOwnerPayments(session, { status: 'pending' }),
    listAdminRentInvoices({ status: 'pending' }),
    listAdminRentInvoices({ status: 'overdue' }),
    listAdminElectricityInvoicesForReminders(),
    listPipelineCheckoutSettlements(session),
    listAdminVacatingRequests(),
    listRecentOperationalAudit(),
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
  const dismissalIndex = dashboard.dismissalIndex;
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
  const vacatingPendingCustomerIds =
    vacatingRes.ok
      ? vacatingRes.data.filter((v) => v.status === 'pending').map((v) => v.customerId).filter(Boolean)
      : [];

  const paymentProofAges = new Map<string, Date>();
  for (const proof of paymentProofs) {
    if (proof.kind === 'qr') {
      const qr = qrPayments.find((p) => p.id === proof.entityId);
      if (qr?.createdAt) paymentProofAges.set(proof.key, qr.createdAt);
    }
  }

  const filteredAudit = recentAudit.filter((row) => !NOISE_ENTITIES.has(row.entity));

  const view = buildResidentOperationsResidentsView({
    queue: dashboard.queue,
    allResidents: dashboard.allResidents ?? [],
    paymentProofs,
    paymentProofAges,
    checkoutRefunds,
    checkoutSettlements,
    rentOverdue,
    vacatingPendingCustomerIds,
    recentAudit: filteredAudit,
  });

  const filteredQueue = filterResidentsQueue(view.queue, filter, view.blockedResidents);

  return {
    commandCards: view.commandCards,
    queue: filteredQueue,
    allQueueCount: view.queue.length,
    nextQueueItem: view.queue[0] ?? null,
    journeyCounts: view.journeyCounts,
    blockedResidents: view.blockedResidents,
    recentActivity: view.recentActivity,
    activeFilter: filter,
  };
}

export async function loadResidentOperationsResidentsPageFromRequest(
  filterValue: string | undefined,
) {
  const session = await requireAdminSession('/admin/operations/residents');
  const filter = parseFilter(filterValue);
  const data = await loadResidentOperationsResidentsPage(session, filter);
  return { session, data };
}

function parseFilter(value: string | undefined): ResidentsCommandFilter | null {
  if (!value) return null;
  const valid: ResidentsCommandFilter[] = [
    'bed_assignment',
    'kyc',
    'payment_proof',
    'move_out',
    'overdue',
    'blocked',
  ];
  return valid.includes(value as ResidentsCommandFilter) ? (value as ResidentsCommandFilter) : null;
}
