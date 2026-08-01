/**
 * Billing Centre command dashboard — read-only SSOT composition.
 * DO NOT import invoice generation, deposit writers, or financial engine mutators.
 */
import {
  listAdminElectricityInvoicesForReminders,
  listAdminOpenRentInvoices,
} from '@/src/db/queries/admin';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  depositLedger,
  electricityBills,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  applyBillingCentreDashboardFilters,
  buildApprovalRows,
  buildGeneratedTodayRows,
  buildPendingCollectionRows,
  buildSummaryCards,
  type BillingCentreDashboardFilters,
  type BillingCentreDashboardView,
} from '@/src/lib/admin/billingCentreDashboardPresentation';
import { buildCollectionsQueue } from '@/src/lib/billing/collectionsQueue';
import { todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';
import { formatDate } from '@/src/lib/dates';
import { resolveFinancialInvoiceIdMap } from '@/src/services/adminCashSettlement';
import { loadBillingCommandCenterSnapshot } from '@/src/services/billingCommandCenter';
import { loadBillingOperationsDashboard } from '@/src/services/billingOperationsDashboard';
import { listOutstandingDeposits } from '@/src/services/depositCollection';
import { getMoveOutPipelineSnapshot } from '@/src/services/moveOutPipelineService';
import { getUnifiedOperationsQueueForBadges } from '@/src/services/unifiedOperationsQueue';
import { and, eq, inArray, sql } from 'drizzle-orm';

async function loadElectricityBillsGeneratedToday(todayIso: string) {
  const rows = await db
    .select({
      id: electricityBills.id,
      pgId: electricityBills.pgId,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      billingMonth: electricityBills.billingMonth,
      totalPaise: electricityBills.totalPaise,
    })
    .from(electricityBills)
    .innerJoin(pgs, eq(pgs.id, electricityBills.pgId))
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .where(
      sql`(${electricityBills.createdAt} AT TIME ZONE 'Asia/Kolkata')::date = ${todayIso}::date`,
    )
    .orderBy(electricityBills.createdAt);

  return rows.map((r) => ({
    id: r.id,
    pgId: r.pgId,
    pgName: r.pgName,
    roomNumber: r.roomNumber,
    billingMonth: String(r.billingMonth),
    totalPaise: r.totalPaise,
  }));
}

async function loadDepositsCollectedToday(todayIso: string) {
  const rows = await db
    .select({
      id: depositLedger.id,
      bookingId: depositLedger.bookingId,
      amountPaise: depositLedger.amountPaise,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      pgId: floors.pgId,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
    })
    .from(depositLedger)
    .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(depositLedger.entryKind, 'collected'),
        eq(bedReservations.kind, 'primary'),
        sql`(${depositLedger.createdAt} AT TIME ZONE 'Asia/Kolkata')::date = ${todayIso}::date`,
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    bookingId: r.bookingId,
    customerId: r.customerId,
    customerName: r.customerName,
    customerPhone: r.customerPhone ?? '',
    pgId: r.pgId,
    pgName: r.pgName,
    roomNumber: r.roomNumber,
    amountPaise: Math.max(0, r.amountPaise),
  }));
}

async function loadReminderStatsForRent(openRentIds: string[]) {
  const { collectionReminderDeliveries } = await import('@/src/db/schema');
  const map = new Map<string, { lastSentAt: Date | null; count: number }>();
  if (openRentIds.length === 0) return map;

  const rows = await db
    .select({
      rentInvoiceId: collectionReminderDeliveries.rentInvoiceId,
      sentAt: collectionReminderDeliveries.sentAt,
      createdAt: collectionReminderDeliveries.createdAt,
    })
    .from(collectionReminderDeliveries)
    .where(
      and(
        inArray(collectionReminderDeliveries.rentInvoiceId, openRentIds),
        sql`${collectionReminderDeliveries.status} IN ('sent_link', 'pending')`,
      ),
    );

  for (const row of rows) {
    if (!row.rentInvoiceId) continue;
    const existing = map.get(row.rentInvoiceId) ?? { lastSentAt: null, count: 0 };
    const sentAt = row.sentAt ?? row.createdAt;
    existing.count += 1;
    if (!existing.lastSentAt || sentAt > existing.lastSentAt) {
      existing.lastSentAt = sentAt;
    }
    map.set(row.rentInvoiceId, existing);
  }
  return map;
}

function countVacatingThisWeek(
  items: Array<{ vacatingDate: string }>,
  todayIso: string,
): number {
  const weekEnd = formatDate(
    new Date(
      Date.UTC(
        Number(todayIso.slice(0, 4)),
        Number(todayIso.slice(5, 7)) - 1,
        Number(todayIso.slice(8, 10)) + 7,
      ),
    ),
  );
  return items.filter((i) => i.vacatingDate >= todayIso && i.vacatingDate <= weekEnd).length;
}

export async function loadBillingCentreDashboardSnapshot(
  session: AdminSession,
  billingMonth: string,
  filters: BillingCentreDashboardFilters = {},
): Promise<BillingCentreDashboardView> {
  const todayIso = todayInBillingTimezone();

  const [
    operations,
    commandSnapshot,
    depositRows,
    moveOutSnapshot,
    opsQueue,
    openRentResult,
    elecPendingResult,
    electricityToday,
    depositsToday,
  ] = await Promise.all([
    loadBillingOperationsDashboard(),
    loadBillingCommandCenterSnapshot(session, billingMonth),
    listOutstandingDeposits(),
    getMoveOutPipelineSnapshot(session),
    getUnifiedOperationsQueueForBadges(session),
    listAdminOpenRentInvoices(),
    listAdminElectricityInvoicesForReminders(),
    loadElectricityBillsGeneratedToday(todayIso),
    loadDepositsCollectedToday(todayIso),
  ]);

  const openRent = openRentResult.ok ? openRentResult.data : [];
  const allUnpaidRent = openRent.filter(
    (r) => r.outstandingPaise > 0 && r.effectiveStatus !== 'paid' && r.effectiveStatus !== 'cancelled',
  );
  const allUnpaidElectricity = elecPendingResult.ok ? elecPendingResult.data : [];

  const collectionsQueue = buildCollectionsQueue({
    rentRows: allUnpaidRent,
    electricityRows: allUnpaidElectricity,
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

  const reminderStats = await loadReminderStatsForRent(openRent.map((r) => r.id));

  const generatedToday = buildGeneratedTodayRows({
    rentRows: operations.generatedToday,
    electricityRows: electricityToday,
    depositRows: depositsToday,
  });

  const pendingCollections = buildPendingCollectionRows({
    queueItems: collectionsQueue,
    depositRows,
    reminderStats,
    todayIso,
  });

  const pendingApprovals = buildApprovalRows(opsQueue.items);
  const approvalCount = pendingApprovals.length;

  const vacatingThisWeek = countVacatingThisWeek(
    moveOutSnapshot.activeItems.map((i) => ({ vacatingDate: i.vacatingDate })),
    todayIso,
  );

  const summary = buildSummaryCards({
    commandSnapshot,
    operations,
    pendingCollections,
    approvalCount,
    vacatingThisWeek,
  });

  const view: BillingCentreDashboardView = {
    todayIso,
    summary,
    commandCards: commandSnapshot.cards,
    opsKpis: operations.kpis,
    upcomingGeneration: operations.upcomingGeneration,
    generatedToday,
    generatedTodayTotalPaise: generatedToday.reduce((s, r) => s + r.amountPaise, 0),
    pendingCollections,
    recentlyPaid: operations.recentlyPaid,
    pendingApprovals,
    pgs: operations.pgs,
  };

  return applyBillingCentreDashboardFilters(view, filters);
}
