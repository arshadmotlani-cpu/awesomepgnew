/**
 * Billing Centre morning operations dashboard — composes existing queries only.
 */

import {
  listAdminOpenRentInvoices,
  listAdminPaidElectricityInvoices,
  listAdminRentInvoices,
  listPgs,
} from '@/src/db/queries/admin';
import { db } from '@/src/db/client';
import { collectionReminderDeliveries, depositLedger, electricityInvoices } from '@/src/db/schema';
import {
  buildBillingOperationsKpis,
  buildOverdueByBucket,
  buildPendingPaymentRows,
  buildUpcomingGenerationRows,
  sumOutstandingByBooking,
  type BillingGeneratedTodayRow,
  type BillingOperationsSnapshot,
} from '@/src/lib/admin/billingOperationsPresentation';
import {
  mergeBillingRecentCollections,
} from '@/src/lib/admin/billingCollectionsPresentation';
import { todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';
import { resolveFinancialInvoiceIdMap } from '@/src/services/adminCashSettlement';
import { listTodayGeneratedInvoices } from '@/src/services/billingScheduler';
import { loadUpcomingRentSchedule } from '@/src/services/billingUpcomingSchedule';
import { and, eq, inArray, sql } from 'drizzle-orm';

async function loadDepositHeldByBookingIds(
  bookingIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (bookingIds.length === 0) return map;

  const rows = await db
    .select({
      bookingId: depositLedger.bookingId,
      balancePaise: sql<number>`coalesce(sum(${depositLedger.amountPaise}), 0)::bigint::int`,
    })
    .from(depositLedger)
    .where(inArray(depositLedger.bookingId, bookingIds))
    .groupBy(depositLedger.bookingId);

  for (const row of rows) {
    map.set(row.bookingId, Math.max(0, row.balancePaise));
  }
  return map;
}

async function loadReminderStatsByRentInvoiceIds(
  invoiceIds: string[],
): Promise<Map<string, { lastSentAt: Date | null; count: number }>> {
  const map = new Map<string, { lastSentAt: Date | null; count: number }>();
  if (invoiceIds.length === 0) return map;

  const rows = await db
    .select({
      rentInvoiceId: collectionReminderDeliveries.rentInvoiceId,
      sentAt: collectionReminderDeliveries.sentAt,
      createdAt: collectionReminderDeliveries.createdAt,
    })
    .from(collectionReminderDeliveries)
    .where(
      and(
        inArray(collectionReminderDeliveries.rentInvoiceId, invoiceIds),
        sql`${collectionReminderDeliveries.status} IN ('sent_link', 'pending')`,
      ),
    )
    .orderBy(collectionReminderDeliveries.createdAt);

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

async function loadElectricityPaiseByBookingMonth(
  keys: Array<{ bookingId: string; billingMonth: string }>,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (keys.length === 0) return map;

  const bookingIds = [...new Set(keys.map((k) => k.bookingId))];
  const rows = await db
    .select({
      bookingId: electricityInvoices.bookingId,
      billingMonth: electricityInvoices.billingMonth,
      amountPaise: electricityInvoices.amountPaise,
    })
    .from(electricityInvoices)
    .where(
      and(
        inArray(electricityInvoices.bookingId, bookingIds),
        eq(electricityInvoices.status, 'pending'),
      ),
    );

  for (const row of rows) {
    if (!row.bookingId) continue;
    const key = `${row.bookingId}:${row.billingMonth}`;
    map.set(key, row.amountPaise);
  }
  return map;
}

export async function loadBillingOperationsDashboard(): Promise<BillingOperationsSnapshot> {
  const todayIso = todayInBillingTimezone();

  const [openRentResult, rentPaidResult, elecPaidResult, pgsResult, upcomingSchedule, generatedRaw] =
    await Promise.all([
      listAdminOpenRentInvoices(),
      listAdminRentInvoices({ status: 'paid' }),
      listAdminPaidElectricityInvoices(),
      listPgs(),
      loadUpcomingRentSchedule({ fromDate: todayIso, horizonDays: 8 }),
      listTodayGeneratedInvoices(todayIso),
    ]);

  const openRent = openRentResult.ok ? openRentResult.data : [];
  const scheduleResidents = upcomingSchedule.days.flatMap((d) => d.residents);
  const bookingIds = [...new Set(scheduleResidents.map((r) => r.bookingId))];

  const [depositHeldByBooking, reminderStats] = await Promise.all([
    loadDepositHeldByBookingIds(bookingIds),
    loadReminderStatsByRentInvoiceIds(openRent.map((r) => r.id)),
  ]);

  const outstandingByBooking = sumOutstandingByBooking(openRent);

  const upcomingGeneration = buildUpcomingGenerationRows({
    scheduleResidents,
    depositHeldByBooking,
    outstandingByBooking,
    todayIso,
  });

  const rentStatusById = new Map(openRent.map((r) => [r.id, r.effectiveStatus]));

  const electricityKeys = generatedRaw.map((r) => ({
    bookingId: r.bookingId,
    billingMonth: r.billingMonth,
  }));
  const electricityByKey = await loadElectricityPaiseByBookingMonth(electricityKeys);

  const generatedFinancialMap = await resolveFinancialInvoiceIdMap(
    generatedRaw.map((r) => ({ sourceTable: 'rent_invoices' as const, sourceId: r.invoiceId })),
  );

  const generatedToday: BillingGeneratedTodayRow[] = generatedRaw.map((r) => {
    const electricityPaise =
      electricityByKey.get(`${r.bookingId}:${r.billingMonth}`) ?? null;
    const rentAmount = Math.max(0, r.rentPaise - r.discountPaise);
    return {
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoiceNumber,
      customerId: r.customerId,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      bookingId: r.bookingId,
      pgId: r.pgId,
      pgName: r.pgName,
      roomNumber: r.roomNumber,
      rentPaise: rentAmount,
      electricityPaise,
      totalPaise: rentAmount + (electricityPaise ?? 0),
      paymentStatus: rentStatusById.get(r.invoiceId) ?? r.status,
      financialInvoiceId: generatedFinancialMap.get(`rent_invoices:${r.invoiceId}`) ?? null,
    };
  });

  const pendingFinancialMap = await resolveFinancialInvoiceIdMap(
    openRent.map((r) => ({ sourceTable: 'rent_invoices' as const, sourceId: r.id })),
  );

  const pendingPayments = buildPendingPaymentRows({
    openRent,
    reminderStats,
    financialIdMap: pendingFinancialMap,
    todayIso,
  });

  const overdueByBucket = buildOverdueByBucket(pendingPayments, todayIso);

  const recentlyPaid = mergeBillingRecentCollections(
    rentPaidResult.ok ? rentPaidResult.data : [],
    elecPaidResult.ok ? elecPaidResult.data : [],
  );

  const kpis = buildBillingOperationsKpis({
    upcomingGeneration,
    pendingPayments,
    overdueByBucket,
    recentlyPaid,
    todayIso,
  });

  return {
    todayIso,
    kpis,
    upcomingGeneration,
    generatedToday,
    pendingPayments,
    recentlyPaid,
    overdueByBucket,
    pgs: pgsResult.ok ? pgsResult.data.map((p) => ({ id: p.id, name: p.name })) : [],
  };
}
